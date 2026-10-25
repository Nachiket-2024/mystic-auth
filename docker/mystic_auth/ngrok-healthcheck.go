package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"
)

const localAPIURL = "http://127.0.0.1:4040/api/tunnels"

func checkHealth(url string) error {
	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("ngrok local API returned %s", response.Status)
	}
	var result struct {
		Tunnels []json.RawMessage `json:"tunnels"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode ngrok tunnel status: %w", err)
	}
	if len(result.Tunnels) == 0 {
		return fmt.Errorf("ngrok has no active tunnels")
	}
	return nil
}

func checkPublicRoute(publicURL string, client *http.Client) error {
	parsed, err := url.Parse(publicURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return fmt.Errorf("NGROK_PUBLIC_URL must be an HTTPS URL without credentials")
	}
	parsed.Path = "/"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	request, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return fmt.Errorf("build public tunnel health request: %w", err)
	}
	request.Header.Set("Cache-Control", "no-cache")
	request.Header.Set("User-Agent", "mystic-auth-tunnel-health/1.0")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("public tunnel route unavailable: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("public tunnel route returned %s", response.Status)
	}
	return nil
}

func main() {
	if err := checkHealth(localAPIURL); err != nil {
		panic(err)
	}
	if err := checkPublicRoute(os.Getenv("NGROK_PUBLIC_URL"), &http.Client{Timeout: 5 * time.Second}); err != nil {
		panic(err)
	}
}
