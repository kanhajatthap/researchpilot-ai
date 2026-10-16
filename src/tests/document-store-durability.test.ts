import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Store durability regression tests.
 *
 * The original store treated ANY read failure as "no documents yet" and reset
 * its in-memory state to empty. A single transient error (EPERM/EBUSY on
 * Windows, or a corrupt file) would then cause the next write to overwrite
 * documents.json with an empty store — silently destroying every record.
 *
 * It also wrote via temp-file + rename, which fails intermittently on Windows
 * with EPERM and used to fail uploads. These tests pin the safe behaviour.
 */

let storeDir: string;

beforeEach(() => {
  vi.resetModules();
  storeDir = mkdtempSync(join(tmpdir(), 'rp-store-durable-'));
  process.env.DOCUMENT_STORE_PATH = storeDir;
});

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

const storeFile = () => join(storeDir, 'documents.json');

describe('document store durability', () => {
  it('treats a missing store file as an empty store', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    expect(await documentStore.list()).toEqual([]);
  });

  it('does not silently discard a corrupted store', async () => {
    writeFileSync(storeFile(), '{ this is not valid json', 'utf-8');
    const { documentStore } = await import('@/lib/rag/document-store');

    await expect(documentStore.list()).rejects.toThrow(/corrupted/i);
    // The damaged file is preserved (never overwritten with an empty store).
    expect(readFileSync(storeFile(), 'utf-8')).toBe('{ this is not valid json');
  });

  it('throws instead of returning an empty store when the store path is unreadable', async () => {
    // A directory where the file should be cannot be read as a file.
    mkdirSync(storeFile(), { recursive: true });
    const { documentStore } = await import('@/lib/rag/document-store');

    await expect(documentStore.list()).rejects.toThrow();
  });

  it('persists records durably across module instances (simulated restart)', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'Durable',
      fileName: 'durable.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'queued',
      uploadedAt: new Date(),
    });

    vi.resetModules();
    const { documentStore: reloaded } = await import('@/lib/rag/document-store');
    const docs = await reloaded.list();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(created.id);
  });

  it('keeps documents.json valid JSON under many concurrent writes', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');

    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        documentStore.create({
          name: `Doc ${i}`,
          fileName: `doc-${i}.pdf`,
          fileType: 'pdf',
          size: 10,
          status: 'queued',
          contentHash: `hash-${i}`,
          uploadedAt: new Date(),
        }),
      ),
    );

    const docs = await documentStore.list();
    expect(docs).toHaveLength(25);
    // The file must still parse and contain every record.
    const raw = JSON.parse(readFileSync(storeFile(), 'utf-8'));
    expect(Object.keys(raw.documents)).toHaveLength(25);
    // No temp files left behind.
    const leftovers = readdirSync(storeDir).filter((f) => f.includes('.tmp.'));
    expect(leftovers).toHaveLength(0);
  });
});
