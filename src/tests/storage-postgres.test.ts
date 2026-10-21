// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Unit tests for the Postgres state store using a fake `pg` pool. They pin the
 * transactional read-modify-write contract (lock row, commit, rollback) without
 * requiring a live database.
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
        // Upsert used by writeStateRow.
        rows.set(params[0] as string, JSON.parse(params[1] as string));
        return { rows: [], rowCount: 1 };
      }
      // Placeholder insert used by withStateRow (DO NOTHING).
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

import {
  _resetPostgresForTests,
  readStateRow,
  withStateRow,
  writeStateRow,
} from '@/lib/storage/postgres';

beforeEach(() => {
  fake.rows.clear();
  fake.calls.length = 0;
  fake.client.query.mockClear();
  fake.client.release.mockClear();
  fake.pool.connect.mockClear();
  fake.pool.query.mockClear();
  _resetPostgresForTests();
});

describe('postgres state store', () => {
  it('returns null for a row that has never been written', async () => {
    expect(await readStateRow('missing')).toBeNull();
  });

  it('persists and reads a value', async () => {
    await writeStateRow('state', { documents: { a: 1 } });
    expect(await readStateRow('state')).toEqual({ documents: { a: 1 } });
  });

  it('runs mutations in a transaction with a row lock', async () => {
    const result = await withStateRow<{ count: number }, number>('counter', async (current) => {
      const value = { count: (current?.count ?? 0) + 1 };
      return { value, result: value.count };
    });

    expect(result).toBe(1);
    expect(fake.calls.some((sql) => sql === 'BEGIN')).toBe(true);
    expect(fake.calls.some((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(fake.calls.some((sql) => sql === 'COMMIT')).toBe(true);
    expect(await readStateRow('counter')).toEqual({ count: 1 });
  });

  it('rolls back and rethrows when the mutation fails', async () => {
    await writeStateRow('counter', { count: 5 });

    await expect(
      withStateRow('counter', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(fake.calls.some((sql) => sql === 'ROLLBACK')).toBe(true);
    expect(fake.calls.some((sql) => sql === 'COMMIT')).toBe(false);
    // The previously committed value is untouched.
    expect(await readStateRow('counter')).toEqual({ count: 5 });
  });
});
