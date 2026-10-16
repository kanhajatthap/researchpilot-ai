import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Store-level regression tests for the production bugs:
 *  - concurrent uploads creating duplicate records
 *  - concurrent retries both claiming the same document
 *  - stale processing attempts overwriting newer ones
 */

let storeDir: string;

beforeEach(() => {
  vi.resetModules();
  storeDir = mkdtempSync(join(tmpdir(), 'rp-store-conc-'));
  process.env.DOCUMENT_STORE_PATH = storeDir;
});

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

function seedDocuments(documents: Record<string, Record<string, unknown>>) {
  writeFileSync(join(storeDir, 'documents.json'), JSON.stringify({ documents }, null, 2), 'utf-8');
}

const baseInput = {
  name: 'Holiday Calendar 2026',
  fileName: 'Holiday Calendar 2026.pdf',
  size: 1000,
  contentHash: 'hash-a',
};

describe('document store: duplicate upload prevention', () => {
  it('concurrent uploads of identical content create exactly one record', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');

    const [a, b] = await Promise.all([
      documentStore.beginUpload({ ...baseInput }),
      documentStore.beginUpload({ ...baseInput }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['create', 'existing']);

    const all = await documentStore.list();
    expect(all).toHaveLength(1);
    expect(all[0].fileName).toBe('Holiday Calendar 2026.pdf');
    expect(all[0].contentHash).toBe('hash-a');
  });

  it('sequential re-upload of identical content is idempotent', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');

    const first = await documentStore.beginUpload({ ...baseInput });
    expect(first.kind).toBe('create');
    await documentStore.markReadyIfAttempt(first.doc.id, 3, 1, first.doc.attemptId!);

    const second = await documentStore.beginUpload({ ...baseInput });
    expect(second.kind).toBe('existing');
    expect(second.doc.id).toBe(first.doc.id);
    expect(second.doc.status).toBe('ready');

    expect(await documentStore.list()).toHaveLength(1);
  });

  it('concurrent uploads of different content create two records', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');

    const [a, b] = await Promise.all([
      documentStore.beginUpload({ ...baseInput, contentHash: 'hash-a' }),
      documentStore.beginUpload({ ...baseInput, contentHash: 'hash-b' }),
    ]);

    expect(a.kind).toBe('create');
    expect(b.kind).toBe('create');
    expect(await documentStore.list()).toHaveLength(2);
  });

  it('different content with the same file name is a separate document', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');

    const first = await documentStore.beginUpload({ ...baseInput, contentHash: 'hash-a' });
    await documentStore.markReadyIfAttempt(first.doc.id, 1, 1, first.doc.attemptId!);

    const second = await documentStore.beginUpload({ ...baseInput, contentHash: 'hash-b' });
    expect(second.kind).toBe('create');
    expect(second.doc.id).not.toBe(first.doc.id);
    expect(await documentStore.list()).toHaveLength(2);
  });

  it('adopts a failed legacy record (no hash) instead of creating a duplicate', async () => {
    seedDocuments({
      'legacy-1': {
        id: 'legacy-1',
        name: 'Holiday Calendar 2026',
        fileName: 'Holiday Calendar 2026.pdf',
        fileType: 'pdf',
        size: 1000,
        status: 'error',
        error: 'Invalid URL: ./data/chroma',
        uploadedAt: '2026-10-15T11:36:05.354Z',
      },
    });
    const { documentStore } = await import('@/lib/rag/document-store');

    const result = await documentStore.beginUpload({ ...baseInput, contentHash: 'hash-new' });
    expect(result.kind).toBe('adopt');
    expect(result.doc.id).toBe('legacy-1');
    expect(result.doc.status).toBe('queued');
    expect(result.doc.contentHash).toBe('hash-new');
    expect(result.doc.error).toBeUndefined();

    expect(await documentStore.list()).toHaveLength(1);
  });

  it('does not create a duplicate when a matching legacy record is still in flight', async () => {
    seedDocuments({
      'legacy-2': {
        id: 'legacy-2',
        name: 'Holiday Calendar 2026',
        fileName: 'Holiday Calendar 2026.pdf',
        fileType: 'pdf',
        size: 1000,
        status: 'processing',
        uploadedAt: '2026-10-15T11:36:05.354Z',
      },
    });
    const { documentStore } = await import('@/lib/rag/document-store');

    const result = await documentStore.beginUpload({ ...baseInput, contentHash: 'hash-new' });
    expect(result.kind).toBe('existing');
    expect(result.doc.status).toBe('processing');
    expect(await documentStore.list()).toHaveLength(1);
  });
});

describe('document store: attempt concurrency', () => {
  it('only one of two concurrent retries claims the document', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'broken',
      fileName: 'broken.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'error',
      uploadedAt: new Date(),
    });

    const results = await Promise.all([
      documentStore.prepareForRetry(created.id),
      documentStore.prepareForRetry(created.id),
    ]);

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const doc = await documentStore.get(created.id);
    expect(doc?.status).toBe('queued');
  });

  it('prepareForRetry rejects non-error documents', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'x',
      fileName: 'x.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'queued',
      uploadedAt: new Date(),
    });

    // queued (fresh upload / already claimed)
    expect(await documentStore.prepareForRetry(created.id)).toBeNull();

    await documentStore.markProcessingIfAttempt(created.id, created.attemptId!);
    expect(await documentStore.prepareForRetry(created.id)).toBeNull();

    await documentStore.markReadyIfAttempt(created.id, 1, 1, created.attemptId!);
    expect(await documentStore.prepareForRetry(created.id)).toBeNull();
  });

  it('a stale attempt cannot write status', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'x',
      fileName: 'x.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'queued',
      uploadedAt: new Date(),
    });

    const rejected = await documentStore.updateIfAttempt(
      created.id,
      { status: 'ready' },
      'not-the-current-attempt',
    );
    expect(rejected).toBeNull();
    expect((await documentStore.get(created.id))?.status).toBe('queued');
  });

  it('a legacy record without an attemptId cannot be written with an arbitrary attempt', async () => {
    seedDocuments({
      legacy: {
        id: 'legacy',
        name: 'legacy',
        fileName: 'legacy.pdf',
        fileType: 'pdf',
        size: 10,
        status: 'processing',
        uploadedAt: '2026-10-14T12:49:11.308Z',
      },
    });
    const { documentStore } = await import('@/lib/rag/document-store');

    const rejected = await documentStore.updateIfAttempt('legacy', { status: 'ready' }, 'any-attempt');
    expect(rejected).toBeNull();
    expect((await documentStore.get('legacy'))?.status).toBe('processing');
  });

  it('an older attempt cannot overwrite a newer attempt', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'x',
      fileName: 'x.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'queued',
      uploadedAt: new Date(),
    });
    const oldAttempt = created.attemptId!;
    await documentStore.markProcessingIfAttempt(created.id, oldAttempt);
    await documentStore.markFailedIfAttempt(created.id, 'boom', oldAttempt);

    const claim = await documentStore.prepareForRetry(created.id);
    expect(claim).not.toBeNull();
    const newAttempt = claim!.attemptId;
    expect(newAttempt).not.toBe(oldAttempt);

    // The old (stale) attempt must not be able to mark the document ready…
    expect(await documentStore.markReadyIfAttempt(created.id, 9, 9, oldAttempt)).toBeNull();
    expect((await documentStore.get(created.id))?.status).toBe('queued');
    // …while the new attempt can.
    expect(await documentStore.markReadyIfAttempt(created.id, 9, 9, newAttempt)).not.toBeNull();
    expect((await documentStore.get(created.id))?.status).toBe('ready');
  });

  it('heartbeats only apply to the current attempt', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    const created = await documentStore.create({
      name: 'x',
      fileName: 'x.pdf',
      fileType: 'pdf',
      size: 10,
      status: 'queued',
      uploadedAt: new Date(),
    });

    expect(await documentStore.touchIfAttempt(created.id, created.attemptId!)).not.toBeNull();
    expect(await documentStore.touchIfAttempt(created.id, 'stale-attempt')).toBeNull();
  });
});
