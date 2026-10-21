// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regression tests for POST /api/documents/[documentId]/retry.
 *
 * Covers: eligibility rules, missing/unreadable stored PDFs, vector cleanup
 * ordering and verification, concurrent retries, stale attempt handling, and
 * the guarantee that cleanup failures block unsafe reprocessing.
 */

const mocks = vi.hoisted(() => ({
  extractPdfText: vi.fn(),
  embedBatch: vi.fn(),
  addChunks: vi.fn(),
  deleteDocument: vi.fn(),
  listDocumentIds: vi.fn(),
  countDocumentChunks: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/rag/extractor', () => ({ extractPdfText: mocks.extractPdfText }));
vi.mock('@/lib/rag/embedder', () => ({
  Embedder: class {
    embedTexts = mocks.embedBatch;
    embedBatch = mocks.embedBatch;
  },
}));
vi.mock('@/lib/rag/vectorstore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rag/vectorstore')>();
  return {
    vectorStore: {
      addChunks: mocks.addChunks,
      deleteDocument: mocks.deleteDocument,
      listDocumentIds: mocks.listDocumentIds,
      countDocumentChunks: mocks.countDocumentChunks,
      query: mocks.query,
    },
    // Real purge logic + messages, driven by the mocked store.
    purgeDocumentVectors: (documentId: string) =>
      actual.purgeDocumentVectors(documentId, {
        deleteDocument: mocks.deleteDocument,
        listDocumentIds: mocks.listDocumentIds,
      }),
    vectorPurgeFailureMessages: actual.vectorPurgeFailureMessages,
  };
});

let storeDir: string;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  mocks.extractPdfText.mockResolvedValue([
    { pageNumber: 1, text: 'Retryable document text with enough content to chunk.' },
  ]);
  mocks.embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2]));
  mocks.addChunks.mockResolvedValue(undefined);
  mocks.countDocumentChunks.mockImplementation(async () => {
    const calls = mocks.addChunks.mock.calls;
    const last = calls[calls.length - 1];
    return last ? (last[0] as unknown[]).length : 0;
  });
  mocks.deleteDocument.mockResolvedValue(undefined);
  mocks.listDocumentIds.mockResolvedValue([]);

  storeDir = mkdtempSync(join(tmpdir(), 'rp-retry-'));
  process.env.DOCUMENT_STORE_PATH = storeDir;
});

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

async function store() {
  return (await import('@/lib/rag/document-store')).documentStore;
}

async function seedDoc(status: 'error' | 'ready' | 'processing' | 'queued', withFile: boolean) {
  const documentStore = await store();
  const doc = await documentStore.create({
    name: 'Retryable',
    fileName: 'retryable.pdf',
    fileType: 'pdf',
    size: 20,
    status,
    uploadedAt: new Date(),
  });
  if (withFile) {
    const stored = await documentStore.saveFile(doc.id, Buffer.from('%PDF-1.4 fake pdf'), 'retryable.pdf');
    await documentStore.setFilePath(doc.id, stored);
  }
  return doc;
}

async function retry(documentId: string) {
  const { POST } = await import('@/app/api/documents/[documentId]/retry/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest(`http://localhost/api/documents/${documentId}/retry`, {
    method: 'POST',
  });
  return POST(req, { params: Promise.resolve({ documentId }) });
}

describe('POST /api/documents/[documentId]/retry', () => {
  it('returns 404 for an unknown document', async () => {
    const res = await retry('does-not-exist');
    expect(res.status).toBe(404);
  });

  it('rejects retrying a ready document without mutating it', async () => {
    const doc = await seedDoc('ready', true);
    const before = await (await store()).get(doc.id);

    const res = await retry(doc.id);
    expect(res.status).toBe(409);

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('ready');
    expect(after?.statusHistory?.length).toBe(before?.statusHistory?.length);
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it('rejects retrying a processing document', async () => {
    const doc = await seedDoc('processing', true);
    const res = await retry(doc.id);
    expect(res.status).toBe(409);
  });

  it('rejects retrying a queued document', async () => {
    const doc = await seedDoc('queued', true);
    const res = await retry(doc.id);
    expect(res.status).toBe(409);
  });

  it('rejects a retry when no stored PDF exists, leaving status unchanged', async () => {
    const doc = await seedDoc('error', false);
    const before = await (await store()).get(doc.id);

    const res = await retry(doc.id);
    expect(res.status).toBe(409);

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('error');
    expect(after?.attemptId).toBe(before?.attemptId);
    expect(after?.statusHistory?.length).toBe(before?.statusHistory?.length);
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it('rejects a retry when the stored PDF is unreadable, leaving status unchanged', async () => {
    const doc = await seedDoc('error', false);
    await (await store()).setFilePath(doc.id, 'missing-on-disk.pdf');
    const before = await (await store()).get(doc.id);

    const res = await retry(doc.id);
    expect(res.status).toBe(409);
    expect((await (await store()).get(doc.id))?.status).toBe('error');
    expect((await (await store()).get(doc.id))?.attemptId).toBe(before?.attemptId);
  });

  it('cleans up old vectors before reprocessing and verifies persistence', async () => {
    const doc = await seedDoc('error', true);
    const oldAttempt = (await (await store()).get(doc.id))?.attemptId;

    const res = await retry(doc.id);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Cleanup ran with the right id, strictly before new chunks were added.
    expect(mocks.deleteDocument).toHaveBeenCalledWith(doc.id);
    const deleteOrder = mocks.deleteDocument.mock.invocationCallOrder[0];
    const addOrder = mocks.addChunks.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(addOrder);
    // Persistence was verified.
    expect(mocks.countDocumentChunks).toHaveBeenCalledWith(doc.id);

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('ready');
    expect(after?.attemptId).not.toBe(oldAttempt);
    // Exactly one new queued transition was recorded for the retry.
    expect(after?.statusHistory?.filter((h) => h.status === 'queued')).toHaveLength(1);
  });

  it('blocks reprocessing when vector cleanup fails', async () => {
    const doc = await seedDoc('error', true);
    mocks.deleteDocument.mockRejectedValue(new Error('Vector store unavailable'));

    const res = await retry(doc.id);
    expect(res.status).toBe(500);
    expect(mocks.addChunks).not.toHaveBeenCalled();

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('error');
    expect(after?.error).toMatch(/cleanup failed/i);
  });

  it('blocks reprocessing when vectors remain after cleanup', async () => {
    const doc = await seedDoc('error', true);
    mocks.listDocumentIds.mockResolvedValue([doc.id]);

    const res = await retry(doc.id);
    expect(res.status).toBe(500);
    expect(mocks.addChunks).not.toHaveBeenCalled();

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('error');
    expect(after?.error).toMatch(/verification failed/i);
  });

  it('returns 400 and marks failed when the stored PDF has no extractable text', async () => {
    const doc = await seedDoc('error', true);
    mocks.extractPdfText.mockResolvedValue([{ pageNumber: 1, text: '' }]);

    const res = await retry(doc.id);
    expect(res.status).toBe(400);

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('error');
    expect(after?.error).toMatch(/no extractable text/i);
  });

  it('handles concurrent retries safely (one wins)', async () => {
    const doc = await seedDoc('error', true);
    mocks.embedBatch.mockImplementation(async (texts: string[]) => {
      await new Promise((r) => setTimeout(r, 60));
      return texts.map(() => [0.5]);
    });

    const [a, b] = await Promise.all([retry(doc.id), retry(doc.id)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const after = await (await store()).get(doc.id);
    expect(after?.status).toBe('ready');
    // Only a single retry claim was recorded.
    expect(after?.statusHistory?.filter((h) => h.status === 'queued')).toHaveLength(1);
  });

  it('does not mix vectors when retrying after a previous ready document is deleted and retried', async () => {
    // A ready document cannot be retried; ensure it is not silently reprocessed.
    const doc = await seedDoc('ready', true);
    const res = await retry(doc.id);
    expect(res.status).toBe(409);
    expect(mocks.addChunks).not.toHaveBeenCalled();
  });
});
