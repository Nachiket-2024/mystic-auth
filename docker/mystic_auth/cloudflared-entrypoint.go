package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

const (
	tunnelCredentialPath = "/run/secrets/cloudflare_tunnel_token"
	tunnelUID            = 65532
	tunnelGID            = 65532
)

func prepareCredential(sourcePath string, uid, gid int) (string, error) {
	contents, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", fmt.Errorf("read tunnel credential: %w", err)
	}
	token := strings.TrimSpace(string(contents))
	if token == "" {
		return "", fmt.Errorf("tunnel credential is empty")
	}

	directory, err := os.MkdirTemp("/tmp", "cloudflared-credential-")
	if err != nil {
		return "", fmt.Errorf("create private credential directory: %w", err)
	}
	if err := os.Chmod(directory, 0700); err != nil {
		return "", err
	}
	credentialPath := filepath.Join(directory, "token")
	if err := os.WriteFile(credentialPath, []byte(token), 0400); err != nil {
		return "", fmt.Errorf("write private tunnel credential: %w", err)
	}
	if err := os.Chmod(credentialPath, 0400); err != nil {
		return "", err
	}
	if err := os.Chown(credentialPath, uid, gid); err != nil {
		return "", fmt.Errorf("assign tunnel credential to unprivileged user: %w", err)
	}
	if err := os.Chown(directory, uid, gid); err != nil {
		return "", fmt.Errorf("assign private credential directory to unprivileged user: %w", err)
	}
	return credentialPath, nil
}

func main() {
	credentialPath, err := prepareCredential(tunnelCredentialPath, tunnelUID, tunnelGID)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := syscall.Setgroups([]int{}); err != nil {
		fmt.Fprintln(os.Stderr, "drop supplementary groups:", err)
		os.Exit(1)
	}
	if err := syscall.Setgid(tunnelGID); err != nil {
		fmt.Fprintln(os.Stderr, "drop group privileges:", err)
		os.Exit(1)
	}
	if err := syscall.Setuid(tunnelUID); err != nil {
		fmt.Fprintln(os.Stderr, "drop user privileges:", err)
		os.Exit(1)
	}

	args := append([]string{"/cloudflared"}, os.Args[1:]...)
	args = append(args, "--token-file", credentialPath)
	if err := syscall.Exec("/cloudflared", args, os.Environ()); err != nil {
		fmt.Fprintln(os.Stderr, "start cloudflared:", err)
		os.Exit(1)
	}
}
