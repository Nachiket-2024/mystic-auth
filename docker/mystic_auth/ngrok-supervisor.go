package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	ngrokAPIURL        = "http://127.0.0.1:4040/api/tunnels"
	probeInterval      = 15 * time.Second
	probeTimeout       = 5 * time.Second
	failureThreshold   = 4
	shutdownTimeout    = 10 * time.Second
	initialRestartWait = 5 * time.Second
	maximumRestartWait = 5 * time.Minute
)

func checkTunnelHealth(apiURL, publicURL string, client *http.Client) error {
	public, err := url.Parse(publicURL)
	if err != nil || public.Scheme != "https" || public.Host == "" || public.User != nil {
		return errors.New("NGROK_PUBLIC_URL must be an HTTPS URL without credentials")
	}

	request, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return fmt.Errorf("build ngrok API health request: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("ngrok local API unavailable: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("ngrok local API returned %s", response.Status)
	}
	var result struct {
		Tunnels []struct {
			PublicURL string `json:"public_url"`
		} `json:"tunnels"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode ngrok tunnel status: %w", err)
	}
	active := false
	for _, tunnel := range result.Tunnels {
		if strings.EqualFold(strings.TrimRight(tunnel.PublicURL, "/"), strings.TrimRight(public.String(), "/")) {
			active = true
			break
		}
	}
	if !active {
		return errors.New("configured public tunnel is not active in the ngrok agent")
	}

	probeURL := *public
	probeURL.Path = "/"
	probeURL.RawQuery = ""
	probeURL.Fragment = ""
	publicRequest, err := http.NewRequest(http.MethodGet, probeURL.String(), nil)
	if err != nil {
		return fmt.Errorf("build public tunnel health request: %w", err)
	}
	publicRequest.Header.Set("Cache-Control", "no-cache")
	publicRequest.Header.Set("User-Agent", "mystic-auth-tunnel-health/1.0")
	publicResponse, err := client.Do(publicRequest)
	if err != nil {
		return fmt.Errorf("public tunnel route unavailable: %w", err)
	}
	defer publicResponse.Body.Close()
	if publicResponse.StatusCode < http.StatusOK || publicResponse.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("public tunnel route returned %s", publicResponse.Status)
	}
	return nil
}

func startAgent(args []string) (*exec.Cmd, chan error) {
	cmd := exec.Command("/ngrok", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		done <- err
		return cmd, done
	}
	go func() { done <- cmd.Wait() }()
	return cmd, done
}

func stopAgent(cmd *exec.Cmd, done <-chan error) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-done:
	case <-time.After(shutdownTimeout):
		_ = cmd.Process.Kill()
		<-done
	}
}

func nextRestartWait(wait time.Duration) time.Duration {
	wait *= 2
	if wait > maximumRestartWait {
		return maximumRestartWait
	}
	return wait
}

func runSupervisor(ctx context.Context, args []string, probe func() error) error {
	return runSupervisorWith(ctx, args, probe, startAgent, probeInterval, failureThreshold, initialRestartWait)
}

func runSupervisorWith(
	ctx context.Context,
	args []string,
	probe func() error,
	start func([]string) (*exec.Cmd, chan error),
	interval time.Duration,
	threshold int,
	initialWait time.Duration,
) error {
	if len(args) == 0 {
		return errors.New("ngrok command is required")
	}
	if interval <= 0 || threshold < 1 || start == nil || probe == nil {
		return errors.New("invalid supervisor configuration")
	}
	restartWait := initialWait
	cmd, done := start(args)
	if cmd.Process == nil {
		return <-done
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	failures := 0

	for {
		select {
		case <-ctx.Done():
			stopAgent(cmd, done)
			return nil
		case err := <-done:
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("ngrok agent exited; restarting after backoff (%v)", err)
			failures = 0
			if !waitUnlessStopped(ctx, restartWait) {
				return nil
			}
			cmd, done = start(args)
			restartWait = nextRestartWait(restartWait)
		case <-ticker.C:
			if err := probe(); err != nil {
				failures++
				log.Printf("ngrok route health check failed (%d/%d): %v", failures, threshold, err)
			} else {
				failures = 0
				restartWait = initialRestartWait
			}
			if failures >= threshold {
				log.Printf("ngrok route remains unhealthy; restarting the agent with backoff")
				stopAgent(cmd, done)
				if !waitUnlessStopped(ctx, restartWait) {
					return nil
				}
				cmd, done = start(args)
				restartWait = nextRestartWait(restartWait)
				failures = 0
			}
		}
	}
}

func waitUnlessStopped(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func main() {
	publicURL := os.Getenv("NGROK_PUBLIC_URL")
	if publicURL == "" {
		log.Fatal("NGROK_PUBLIC_URL is required")
	}
	client := &http.Client{Timeout: probeTimeout}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := runSupervisor(ctx, os.Args[1:], func() error {
		return checkTunnelHealth(ngrokAPIURL, publicURL, client)
	}); err != nil {
		log.Fatal("ngrok supervisor failed")
	}
}
