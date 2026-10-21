// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from '@/lib/storage/file-store';

let dir: string;
const ENV_KEYS = ['STORAGE_DRIVER', 'DATABASE_URL', 'POSTGRES_URL', 'BLOB_READ_WRITE_TOKEN'] as const;
const previous: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  dir = mkdtempSync(join(tmpdir(), 'rp-file-store-'));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('filesystem file store', () => {
  it('saves, reads, checks and removes a PDF', async () => {
    const store = createFileStore(dir);
    const buffer = Buffer.from('%PDF-1.4 test');

    const ref = await store.save('doc-1', buffer, 'My Paper (final).pdf');
    expect(ref).toBe('doc-1_My_Paper__final_.pdf');
    expect(store.localPath(ref)).toBe(join(dir, ref));

    expect(await store.exists(ref)).toBe(true);
    expect((await store.read(ref)).toString()).toBe('%PDF-1.4 test');

    await store.remove(ref);
    expect(await store.exists(ref)).toBe(false);
  });

  it('removing a missing file is a no-op', async () => {
    const store = createFileStore(dir);
    await expect(store.remove('missing.pdf')).resolves.toBeUndefined();
  });

  it('overwrites the deterministic path instead of leaking files', async () => {
    const store = createFileStore(dir);
    const first = await store.save('doc-1', Buffer.from('one'), 'paper.pdf');
    const second = await store.save('doc-1', Buffer.from('two'), 'paper.pdf');
    expect(second).toBe(first);
    expect((await store.read(first)).toString()).toBe('two');
  });
});
