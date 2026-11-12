package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"sync/atomic"
	"testing"
	"time"
)

func TestCheckTunnelHealth(t *testing.T) {
	public := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || r.Header.Get("User-Agent") != "mystic-auth-tunnel-health/1.0" {
			t.Errorf("unexpected public probe: path=%q user-agent=%q", r.URL.Path, r.Header.Get("User-Agent"))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer public.Close()
	publicURL := "https://tunnel.example.test"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tunnels" {
			t.Errorf("unexpected api path: %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"tunnels":[{"public_url":"https://tunnel.example.test"}]}`))
	}))
	defer api.Close()

	client := &http.Client{Transport: rewriteTransport{target: public.URL}}
	if err := checkTunnelHealth(api.URL+"/api/tunnels", publicURL, client); err != nil {
		t.Fatalf("checkTunnelHealth() error = %v", err)
	}
}

type rewriteTransport struct{ target string }

func (rt rewriteTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Host == "tunnel.example.test" {
		target, err := http.NewRequest(http.MethodGet, rt.target, nil)
		if err != nil {
			return nil, err
		}
		request.URL.Scheme = target.URL.Scheme
		request.URL.Host = target.URL.Host
	}
	return http.DefaultTransport.RoundTrip(request)
}

func TestCheckTunnelHealthRejectsWrongTunnelOrBadRoute(t *testing.T) {
	for _, test := range []struct {
		name, tunnels string
		publicStatus  int
		wantErr       bool
	}{
		{name: "configured tunnel missing", tunnels: `{"tunnels":[]}`, publicStatus: http.StatusOK, wantErr: true},
		{name: "public route unavailable", tunnels: `{"tunnels":[{"public_url":"https://tunnel.example.test"}]}`, publicStatus: http.StatusBadGateway, wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(test.tunnels)) }))
			defer api.Close()
			public := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(test.publicStatus) }))
			defer public.Close()
			client := &http.Client{Transport: rewriteTransport{target: public.URL}}
			err := checkTunnelHealth(api.URL, "https://tunnel.example.test", client)
			if (err != nil) != test.wantErr {
				t.Fatalf("checkTunnelHealth() error = %v, wantErr %t", err, test.wantErr)
			}
		})
	}
}

func TestRestartBackoffIsBounded(t *testing.T) {
	wait := initialRestartWait
	for i := 0; i < 20; i++ {
		wait = nextRestartWait(wait)
	}
	if wait != maximumRestartWait {
		t.Fatalf("restart backoff = %s, want cap %s", wait, maximumRestartWait)
	}
	if nextRestartWait(0) != 0 {
		t.Fatal("zero restart wait should stay zero")
	}
}

func TestSupervisorRestartsAgentAfterSustainedProbeFailures(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := make(chan struct{}, 3)
	var starts atomic.Int32
	start := func(_ []string) (*exec.Cmd, chan error) {
		cmd := exec.Command("/bin/sleep", "30")
		done := make(chan error, 1)
		if err := cmd.Start(); err != nil {
			done <- err
			return cmd, done
		}
		starts.Add(1)
		started <- struct{}{}
		go func() { done <- cmd.Wait() }()
		return cmd, done
	}
	result := make(chan error, 1)
	go func() {
		result <- runSupervisorWith(ctx, []string{"http"}, func() error {
			return errors.New("public route unavailable")
		}, start, time.Millisecond, 2, 0)
	}()

	for i := 0; i < 2; i++ {
		select {
		case <-started:
		case <-time.After(time.Second):
			cancel()
			t.Fatal("supervisor did not start the replacement agent after sustained failures")
		}
	}
	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("runSupervisorWith() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("supervisor did not stop after cancellation")
	}
	if got := starts.Load(); got != 2 {
		t.Fatalf("agent started %d times, want initial start plus one recovery restart", got)
	}
}
