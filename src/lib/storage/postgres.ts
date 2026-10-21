/**
 * Postgres-backed state storage for serverless deployments.
 *
 * The document and conversation stores serialize their entire state to JSON.
 * Instead of rewriting every store operation as SQL, the state is persisted as
 * a single JSONB row per store key. Mutations run inside a transaction that
 * locks the row (`SELECT ... FOR UPDATE`), which makes read-modify-write safe
 * across concurrent serverless invocations — the in-process mutex used by the
 * filesystem driver cannot do that.
 */

import { assertManagedStorageReady, getStorageConfig } from './config';

type PgPool = import('pg').Pool;
type PgClient = import('pg').PoolClient;

let poolPromise: Promise<PgPool> | null = null;
let schemaPromise: Promise<void> | null = null;

async function getPool(): Promise<PgPool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const config = getStorageConfig();
      assertManagedStorageReady(config);
      const pg = await import('pg');
      const PoolCtor =
        (pg as unknown as { Pool?: new (options: object) => PgPool }).Pool ??
        (pg as unknown as { default: { Pool: new (options: object) => PgPool } }).default.Pool;
      const needsSsl = config.databaseUrl ? !/localhost|127\.0\.0\.1/.test(config.databaseUrl) : false;
      return new PoolCtor({
        connectionString: config.databaseUrl,
        max: 3,
        idleTimeoutMillis: 30_000,
        ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      });
    })().catch((error) => {
      // Allow a later call to retry with corrected configuration.
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = await getPool();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS app_state (
           key text PRIMARY KEY,
           value jsonb NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export interface MutateOutcome<T, R> {
  /** The full state to persist. */
  value: T;
  /** The value returned to the caller. */
  result: R;
}

/** Read a state row, or `null` when it has never been written. */
export async function readStateRow<T>(key: string): Promise<T | null> {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.query<{ value: T }>(
    'SELECT value FROM app_state WHERE key = $1',
    [key],
  );
  return result.rows[0]?.value ?? null;
}

/** Overwrite a state row unconditionally. */
export async function writeStateRow<T>(key: string, value: T): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/**
 * Atomically read-modify-write a state row.
 *
 * A placeholder row is inserted first so that `SELECT ... FOR UPDATE` has a row
 * to lock even on the very first write; concurrent transactions serialize on
 * the primary key instead of racing to insert.
 */
export async function withStateRow<T, R>(
  key: string,
  fn: (current: T | null) => Promise<MutateOutcome<T, R>> | MutateOutcome<T, R>,
): Promise<R> {
  await ensureSchema();
  const pool = await getPool();
  const client: PgClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO app_state (key, value) VALUES ($1, '{}'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key],
    );

    const selected = await client.query<{ value: T }>(
      'SELECT value FROM app_state WHERE key = $1 FOR UPDATE',
      [key],
    );
    const existed = inserted.rowCount === 0;
    const current = existed ? (selected.rows[0]?.value ?? null) : null;

    const outcome = await fn(current);

    await client.query(
      `UPDATE app_state SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
      [key, JSON.stringify(outcome.value)],
    );
    await client.query('COMMIT');
    return outcome.result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Test helper: drop cached pool/schema state. */
export function _resetPostgresForTests(): void {
  poolPromise = null;
  schemaPromise = null;
}
