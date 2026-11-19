import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/authStore';

const profile = {
  name: 'Root',
  email: 'root@example.com',
  role: 'admin',
  permissions: ['users:read_all'],
  has_password: true,
  created_at: '2026-01-01T00:00:00Z',
  active_sessions: 1,
};

describe('authStore isSystemSuperuser', () => {
  beforeEach(() => useAuthStore.getState().reset());

  it('defaults to false and stays false when the profile omits the flag', () => {
    expect(useAuthStore.getState().isSystemSuperuser).toBe(false);
    useAuthStore.getState().setProfile(profile as never);
    expect(useAuthStore.getState().isSystemSuperuser).toBe(false);
  });

  it('copies the flag from the profile', () => {
    useAuthStore.getState().setProfile({ ...profile, is_system_superuser: true } as never);
    expect(useAuthStore.getState().isSystemSuperuser).toBe(true);
  });

  it('clears the flag when permissions are dropped, on logout and on clearProfile', () => {
    const set = () => useAuthStore.getState().setProfile({ ...profile, is_system_superuser: true } as never);
    set();
    useAuthStore.getState().dropPermissions();
    expect(useAuthStore.getState().isSystemSuperuser).toBe(false);
    set();
    useAuthStore.getState().setAuthenticated(false);
    expect(useAuthStore.getState().isSystemSuperuser).toBe(false);
    set();
    useAuthStore.getState().clearProfile();
    expect(useAuthStore.getState().isSystemSuperuser).toBe(false);
  });
});
