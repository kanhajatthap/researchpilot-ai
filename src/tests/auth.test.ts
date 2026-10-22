import { describe, it, expect, beforeEach } from 'vitest';
import { userStore } from '@/lib/auth/user-store.server';

describe('User Authentication & Store System', () => {
  it('authenticates seeded admin user with correct credentials', async () => {
    const user = await userStore.authenticate('kanhajatthap@gmail.com', 'Password123!');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('kanhajatthap@gmail.com');
    expect(user?.name).toBe('Kanha Jatthap');
    expect(user?.role).toBe('admin');
    // Ensure sensitive security fields are not leaked
    expect((user as any).passwordHash).toBeUndefined();
    expect((user as any).salt).toBeUndefined();
  });

  it('rejects authentication with invalid password', async () => {
    const user = await userStore.authenticate('kanhajatthap@gmail.com', 'WrongPassword!');
    expect(user).toBeNull();
  });

  it('rejects authentication for non-existent user', async () => {
    const user = await userStore.authenticate('nonexistent@example.com', 'Password123!');
    expect(user).toBeNull();
  });

  it('registers a new user and allows authentication', async () => {
    const testEmail = `testuser_${Date.now()}@researchpilot.ai`;
    const newUser = await userStore.create('Test User', testEmail, 'StrongPass123!');

    expect(newUser).toBeDefined();
    expect(newUser.email).toBe(testEmail);
    expect(newUser.name).toBe('Test User');
    expect(newUser.role).toBe('user');

    // Authenticate with new credentials
    const authed = await userStore.authenticate(testEmail, 'StrongPass123!');
    expect(authed).not.toBeNull();
    expect(authed?.id).toBe(newUser.id);
  });

  it('prevents registering duplicate email addresses', async () => {
    const duplicateEmail = `dup_${Date.now()}@researchpilot.ai`;
    await userStore.create('User One', duplicateEmail, 'Pass12345!');

    await expect(
      userStore.create('User Two', duplicateEmail, 'AnotherPass123!')
    ).rejects.toThrow('An account with this email already exists.');
  });

  it('creates, resolves, and invalidates session tokens', async () => {
    const user = await userStore.findByEmail('kanhajatthap@gmail.com');
    expect(user).not.toBeNull();

    const sessionToken = await userStore.createSession(user!.id);
    expect(sessionToken).toBeDefined();
    expect(typeof sessionToken).toBe('string');

    // Resolve user from session
    const resolvedUser = await userStore.getSessionUser(sessionToken);
    expect(resolvedUser).not.toBeNull();
    expect(resolvedUser?.id).toBe(user!.id);

    // Delete session
    await userStore.deleteSession(sessionToken);
    const postDeleteUser = await userStore.getSessionUser(sessionToken);
    expect(postDeleteUser).toBeNull();
  });

  it('generates a password reset token and successfully resets password', async () => {
    const resetEmail = `reset_${Date.now()}@researchpilot.ai`;
    await userStore.create('Reset Test', resetEmail, 'OldPassword123!');

    const token = await userStore.createPasswordResetToken(resetEmail);
    expect(token).toBeTruthy();

    const resetSuccess = await userStore.resetPasswordWithToken(token!, 'NewBrandNewPassword123!');
    expect(resetSuccess).toBe(true);

    // Old password should now fail
    const oldAuth = await userStore.authenticate(resetEmail, 'OldPassword123!');
    expect(oldAuth).toBeNull();

    // New password should succeed
    const newAuth = await userStore.authenticate(resetEmail, 'NewBrandNewPassword123!');
    expect(newAuth).not.toBeNull();
    expect(newAuth?.email).toBe(resetEmail);
  });

  it('returns false when attempting to reset with an invalid token', async () => {
    const result = await userStore.resetPasswordWithToken('invalid_token_xyz', 'NewPass123!');
    expect(result).toBe(false);
  });
});
