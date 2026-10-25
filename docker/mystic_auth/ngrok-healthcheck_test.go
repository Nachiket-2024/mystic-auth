package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckHealth(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
		wantErr    bool
	}{
		{name: "active tunnel", statusCode: http.StatusOK, body: `{"tunnels":[{"name":"public"}]}`},
		{name: "no tunnels", statusCode: http.StatusOK, body: `{"tunnels":[]}`, wantErr: true},
		{name: "invalid response", statusCode: http.StatusOK, body: `not-json`, wantErr: true},
		{name: "API unavailable", statusCode: http.StatusServiceUnavailable, body: `{}`, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != "/api/tunnels" {
					t.Errorf("unexpected health request: %s %s", r.Method, r.URL.Path)
				}
				w.WriteHeader(test.statusCode)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()

			err := checkHealth(server.URL + "/api/tunnels")
			if (err != nil) != test.wantErr {
				t.Fatalf("checkHealth() error = %v, wantErr %t", err, test.wantErr)
			}
		})
	}
}

func TestCheckPublicRoute(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || r.Header.Get("Cache-Control") != "no-cache" {
			t.Errorf("unexpected public health request: %s %s", r.Method, r.URL)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	publicURL := server.URL
	if err := checkPublicRoute(publicURL, server.Client()); err != nil {
		t.Fatalf("checkPublicRoute() error = %v", err)
	}
}

func TestCheckPublicRouteRejectsInsecureURLs(t *testing.T) {
	client := &http.Client{}
	for _, value := range []string{"", "http://tunnel.example.test", "https://user:secret@tunnel.example.test"} {
		if err := checkPublicRoute(value, client); err == nil {
			t.Errorf("checkPublicRoute(%q) should reject URL", value)
		}
	}
}
