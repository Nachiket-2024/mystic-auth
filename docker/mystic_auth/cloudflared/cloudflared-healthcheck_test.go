package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckReady(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantErr    bool
	}{
		{name: "ready", statusCode: http.StatusOK},
		{name: "not ready", statusCode: http.StatusServiceUnavailable, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(test.statusCode)
			}))
			defer server.Close()
			err := checkReady(server.URL)
			if (err != nil) != test.wantErr {
				t.Fatalf("checkReady() error = %v, wantErr %t", err, test.wantErr)
			}
		})
	}
}
