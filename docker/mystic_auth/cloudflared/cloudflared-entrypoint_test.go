package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestPrepareCredentialWritesPrivateTrimmedFile(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "source")
	if err := os.WriteFile(source, []byte("test-token\n"), 0600); err != nil {
		t.Fatal(err)
	}

	uid, gid := os.Getuid(), os.Getgid()
	if uid == 0 {
		uid, gid = tunnelUID, tunnelGID
	}
	path, err := prepareCredential(source, uid, gid)
	if err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "test-token" {
		t.Fatalf("credential file contains unexpected content")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0400 {
		t.Fatalf("credential mode = %04o, want 0400", info.Mode().Perm())
	}
	owner := info.Sys().(*syscall.Stat_t)
	if int(owner.Uid) != uid || int(owner.Gid) != gid {
		t.Fatalf("credential owner = %d:%d, want %d:%d", owner.Uid, owner.Gid, uid, gid)
	}
	directoryInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if directoryInfo.Mode().Perm() != 0700 {
		t.Fatalf("credential directory mode = %04o, want 0700", directoryInfo.Mode().Perm())
	}
}

func TestPrepareCredentialRejectsEmptyFile(t *testing.T) {
	source := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(source, []byte(" \n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareCredential(source, os.Getuid(), os.Getgid()); err == nil {
		t.Fatal("expected an empty credential to be rejected")
	}
}
