import { describe, it, expect } from 'vitest';
import { getStorageConfig } from '@/lib/storage/config';

describe('storage config', () => {
  it('defaults to the filesystem driver when nothing is configured', () => {
    const config = getStorageConfig({} as NodeJS.ProcessEnv);
    expect(config.driver).toBe('fs');
  });

  it('auto-detects the managed driver when Postgres and Blob are configured', () => {
    const config = getStorageConfig({
      DATABASE_URL: 'postgres://example',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test',
    } as NodeJS.ProcessEnv);
    expect(config.driver).toBe('vercel');
    expect(config.databaseUrl).toBe('postgres://example');
    expect(config.blobToken).toBe('vercel_blob_rw_test');
  });

  it('does not switch drivers with only a partial configuration', () => {
    expect(getStorageConfig({ DATABASE_URL: 'postgres://example' } as NodeJS.ProcessEnv).driver).toBe('fs');
    expect(
      getStorageConfig({ BLOB_READ_WRITE_TOKEN: 'token' } as NodeJS.ProcessEnv).driver,
    ).toBe('fs');
  });

  it('honours an explicit STORAGE_DRIVER override', () => {
    expect(
      getStorageConfig({
        STORAGE_DRIVER: 'vercel',
        DATABASE_URL: 'postgres://example',
        BLOB_READ_WRITE_TOKEN: 'token',
      } as NodeJS.ProcessEnv).driver,
    ).toBe('vercel');
    expect(
      getStorageConfig({
        STORAGE_DRIVER: 'fs',
        DATABASE_URL: 'postgres://example',
        BLOB_READ_WRITE_TOKEN: 'token',
      } as NodeJS.ProcessEnv).driver,
    ).toBe('fs');
  });

  it('accepts POSTGRES_URL as an alias for DATABASE_URL', () => {
    const config = getStorageConfig({
      POSTGRES_URL: 'postgres://neon',
      BLOB_READ_WRITE_TOKEN: 'token',
    } as NodeJS.ProcessEnv);
    expect(config.databaseUrl).toBe('postgres://neon');
  });
});
