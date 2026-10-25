package main

import (
	"fmt"
	"net/http"
	"time"
)

const readyURL = "http://127.0.0.1:20241/ready"

func checkReady(url string) error {
	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("cloudflared readiness endpoint returned %s", response.Status)
	}
	return nil
}

func main() {
	if err := checkReady(readyURL); err != nil {
		panic(err)
	}
}
