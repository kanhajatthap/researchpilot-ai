/**
 * Storage configuration.
 *
 * The app supports two storage drivers:
 *  - `fs`     — local filesystem (development, tests, and hosts with a writable
 *               persistent disk such as Railway/Render).
 *  - `vercel` — Vercel-managed storage: Postgres for document/conversation state
 *               and Vercel Blob for uploaded PDFs.
 *
 * Selection is explicit via `STORAGE_DRIVER`, otherwise auto-detected: when both
 * a Postgres connection string and a Blob read/write token are present we use
 * the `vercel` driver, else we fall back to `fs`.
 */

export type StorageDriver = 'fs' | 'vercel';

export interface StorageConfig {
  driver: StorageDriver;
  /** Postgres connection string (DATABASE_URL / POSTGRES_URL / ...). */
  databaseUrl?: string;
  /** Vercel Blob read/write token. */
  blobToken?: string;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function getStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const databaseUrl = firstNonEmpty(
    env.DATABASE_URL,
    env.POSTGRES_URL,
    env.VERCEL_POSTGRES_URL,
    env.POSTGRES_PRISMA_URL,
  );
  const blobToken = firstNonEmpty(env.BLOB_READ_WRITE_TOKEN);

  const explicit = env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === 'fs' || explicit === 'vercel') {
    return { driver: explicit, databaseUrl, blobToken };
  }

  // Auto-detect: only switch to managed storage when it is fully configured.
  if (databaseUrl && blobToken) {
    return { driver: 'vercel', databaseUrl, blobToken };
  }

  return { driver: 'fs', databaseUrl, blobToken };
}

/**
 * Throws a descriptive error when the managed driver is selected without its
 * required credentials. Callers should surface this as a configuration error
 * rather than an opaque crash.
 */
export function assertManagedStorageReady(config: StorageConfig): void {
  if (config.driver !== 'vercel') return;
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL (or POSTGRES_URL)');
  if (!config.blobToken) missing.push('BLOB_READ_WRITE_TOKEN');
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=vercel requires ${missing.join(' and ')}. ` +
        'Set them in the deployment environment, or set STORAGE_DRIVER=fs on a host with a writable disk.',
    );
  }
}
