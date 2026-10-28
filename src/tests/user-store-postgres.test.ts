// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

/**
 * Verifies that user accounts and sessions are persisted through the Postgres
 * state row when a database is configured. This is the production path on
 * Vercel, where the filesystem is read-only (the original cause of
 * `ENOENT ... /var/task/data/users/users.json`).
 */

const fake = vi.hoisted(() => {
  const rows = new Map<string, unknown>();
  const calls: string[] = [];

  const run = (sql: string, params: unknown[]) => {
    calls.push(sql);

    if (sql.includes('CREATE TABLE')) return { rows: [], rowCount: null };

    if (sql.includes('INSERT INTO app_state')) {
      const existed = rows.has(params[0] as string);
      if (sql.includes('DO UPDATE')) {
        rows.set(params[0] as string, JSON.parse(params[1] as string));
        return { rows: [], rowCount: 1 };
      }
      if (!existed) rows.set(params[0] as string, {});
      return { rows: [], rowCount: existed ? 0 : 1 };
    }

    if (sql.includes('SELECT value')) {
      return {
        rows: rows.has(params[0] as string) ? [{ value: rows.get(params[0] as string) }] : [],
        rowCount: rows.has(params[0] as string) ? 1 : 0,
      };
    }

    if (sql.includes('UPDATE app_state')) {
      rows.set(params[0] as string, JSON.parse(params[1] as string));
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: null };
  };

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => run(sql, params)),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string, params: unknown[] = []) => run(sql, params)),
  };

  return { rows, calls, client, pool };
});

vi.mock('pg', () => ({
  Pool: class {
    connect = fake.pool.connect;
    query = fake.pool.query;
  },
}));

import { assertAuthStorageReady, userStore, AuthStorageError } from '@/lib/auth/user-store.server';
import { _resetPostgresForTests } from '@/lib/storage/postgres';

const savedEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  VERCEL: process.env.VERCEL,
};

beforeEach(() => {
  fake.rows.clear();
  fake.calls.length = 0;
  fake.client.query.mockClear();
  fake.client.release.mockClear();
  fake.pool.connect.mockClear();
  fake.pool.query.mockClear();
  _resetPostgresForTests();

  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/researchpilot';
  delete process.env.STORAGE_DRIVER;
  delete process.env.VERCEL;
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('user store on Postgres', () => {
  it('persists a registered account and authenticates it later', async () => {
    const created = await userStore.create('Kanha', 'kanha@example.com', 'StrongPass123!');
    expect(created.email).toBe('kanha@example.com');

    // Accounts live in the `users` state row, not on disk.
    const row = fake.rows.get('users') as { users: Record<string, unknown>; sessions: unknown };
    expect(Object.keys(row.users)).toHaveLength(3); // two demo accounts + the new one

    const authed = await userStore.authenticate('kanha@example.com', 'StrongPass123!');
    expect(authed?.id).toBe(created.id);
    expect(Object.keys(authed as object)).not.toContain('passwordHash');
    expect(Object.keys(authed as object)).not.toContain('salt');
  });

  it('rejects a duplicate email across separate store instances', async () => {
    await userStore.create('One', 'dupe@example.com', 'StrongPass123!');
    await expect(
      userStore.create('Two', 'dupe@example.com', 'StrongPass123!'),
    ).rejects.toThrow('An account with this email already exists.');
  });

  it('keeps sessions across cold starts (no in-process cache)', async () => {
    const user = await userStore.authenticate('admin@researchpilot.ai', 'Password123!');
    expect(user).not.toBeNull();

    const token = await userStore.createSession(user!.id);
    // Simulate a new serverless invocation: only Postgres state survives.
    _resetPostgresForTests();
    fake.calls.length = 0;

    const resolved = await userStore.getSessionUser(token);
    expect(resolved?.email).toBe('admin@researchpilot.ai');

    await userStore.deleteSession(token);
    expect(await userStore.getSessionUser(token)).toBeNull();
  });

  it('seeds the demo accounts used by the login page', async () => {
    const demo = await userStore.authenticate('demo@researchpilot.ai', 'Password123!');
    expect(demo?.role).toBe('researcher');
  });

  it('reports a clear error when Vercel has no database configured', () => {
    delete process.env.DATABASE_URL;
    process.env.VERCEL = '1';

    expect(() => assertAuthStorageReady()).toThrow(AuthStorageError);
    expect(() => assertAuthStorageReady()).toThrow(/DATABASE_URL/);
  });
});
