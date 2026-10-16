// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end regression tests for the upload endpoint.
 *
 * These cover the reported production bugs: duplicate records, documents stuck
 * in Processing, and unreliable uploads. The PDF extractor, embedder and vector
 * store are mocked so the tests exercise the real route + store + processor
 * logic deterministically.
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
vi.mock('@/lib/rag/vectorstore', () => ({
  vectorStore: {
    addChunks: mocks.addChunks,
    deleteDocument: mocks.deleteDocument,
    listDocumentIds: mocks.listDocumentIds,
    countDocumentChunks: mocks.countDocumentChunks,
    query: mocks.query,
  },
}));

let storeDir: string;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  mocks.extractPdfText.mockResolvedValue([
    { pageNumber: 1, text: 'Holiday calendar 2026 with Q1 planning notes and important dates.' },
  ]);
  mocks.embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
  mocks.addChunks.mockResolvedValue(undefined);
  mocks.countDocumentChunks.mockImplementation(async () => {
    const calls = mocks.addChunks.mock.calls;
    const last = calls[calls.length - 1];
    return last ? (last[0] as unknown[]).length : 0;
  });
  mocks.deleteDocument.mockResolvedValue(undefined);
  mocks.listDocumentIds.mockResolvedValue([]);

  storeDir = mkdtempSync(join(tmpdir(), 'rp-upload-'));
  process.env.DOCUMENT_STORE_PATH = storeDir;
});

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

function makePdf(content: string, name = 'Holiday Calendar 2026.pdf'): File {
  const bytes = new TextEncoder().encode(content);
  return new File([bytes], name, { type: 'application/pdf' });
}

async function upload(file: File) {
  const { POST } = await import('@/app/api/documents/route');
  const { NextRequest } = await import('next/server');
  const form = new FormData();
  form.append('file', file);
  const req = new NextRequest('http://localhost/api/documents', { method: 'POST', body: form });
  return POST(req);
}

async function listDocuments() {
  const { documentStore } = await import('@/lib/rag/document-store');
  return documentStore.list();
}

describe('POST /api/documents', () => {
  it('processes a valid PDF to ready (one record, file persisted)', async () => {
    const res = await upload(makePdf('unique-content-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.chunks).toBe(1);
    expect(body.pages).toBe(1);

    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('ready');
    expect(docs[0].chunkCount).toBe(1);
    expect(docs[0].contentHash).toBeTruthy();
    expect(docs[0].statusHistory?.map((h) => h.status)).toEqual(
      expect.arrayContaining(['queued', 'processing', 'ready']),
    );

    // The PDF was persisted for future retries.
    const { documentStore } = await import('@/lib/rag/document-store');
    const filePath = await documentStore.getFilePath(docs[0].id);
    expect(filePath).toBeTruthy();
    expect(existsSync(filePath!)).toBe(true);
  });

  it('does not create a duplicate record for the same content', async () => {
    const first = await upload(makePdf('same-bytes'));
    expect(first.status).toBe(200);

    const second = await upload(makePdf('same-bytes'));
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.message).toBe('Document already processed');
    expect(await listDocuments()).toHaveLength(1);
  });

  it('handles concurrent uploads of the same file (one winner, one 409)', async () => {
    // Make processing slow enough that both requests overlap.
    mocks.embedBatch.mockImplementation(async (texts: string[]) => {
      await new Promise((r) => setTimeout(r, 60));
      return texts.map(() => [0.1]);
    });

    const [a, b] = await Promise.all([upload(makePdf('race-bytes')), upload(makePdf('race-bytes'))]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await listDocuments()).toHaveLength(1);
  });

  it('handles concurrent uploads of different documents (two records)', async () => {
    mocks.embedBatch.mockImplementation(async (texts: string[]) => {
      await new Promise((r) => setTimeout(r, 30));
      return texts.map(() => [0.2]);
    });

    const [a, b] = await Promise.all([
      upload(makePdf('doc-alpha', 'alpha.pdf')),
      upload(makePdf('doc-beta', 'beta.pdf')),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await listDocuments()).toHaveLength(2);
  });

  it('marks the document failed (not processing) when embedding fails', async () => {
    mocks.embedBatch.mockRejectedValue(new Error('embedding quota exceeded'));

    const res = await upload(makePdf('embed-fail'));
    expect(res.status).toBe(500);

    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/embedding quota exceeded/i);
    expect(docs.filter((d) => d.status === 'processing' || d.status === 'queued')).toHaveLength(0);
  });

  it('persists a concise, sanitized error instead of the raw provider body', async () => {
    const rawBody = JSON.stringify({
      error: {
        code: 429,
        message:
          'You exceeded your current quota, please check your plan and billing details. ' +
          'See https://example.com/billing?key=SECRET-KEY-123 for details.',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '46861s',
          },
        ],
      },
    });
    mocks.embedBatch.mockRejectedValue(Object.assign(new Error(rawBody), { status: 429 }));

    const res = await upload(makePdf('raw-provider-error'));
    expect(res.status).toBe(500);

    const docs = await listDocuments();
    const error = docs[0].error ?? '';
    // Bounded length, no raw provider JSON/status blob, no secrets.
    expect(error.length).toBeLessThanOrEqual(340);
    expect(error).not.toContain('RESOURCE_EXHAUSTED');
    expect(error).not.toContain('"error"');
    expect(error).not.toContain('SECRET-KEY-123');
    expect(error).toContain('key=[redacted]');
    expect(error).toMatch(/quota/i);
  });

  it('does not report ready when the vector store add fails', async () => {
    mocks.addChunks.mockRejectedValue(new Error('Vector store unavailable (chroma)'));

    const res = await upload(makePdf('chroma-fail'));
    expect(res.status).toBe(500);

    const docs = await listDocuments();
    expect(docs[0].status).toBe('error');
    expect(docs[0].status).not.toBe('ready');
    expect(docs[0].error).toMatch(/vector store unavailable/i);
  });

  it('does not report ready when vector persistence verification fails', async () => {
    mocks.countDocumentChunks.mockResolvedValue(0);

    const res = await upload(makePdf('verify-fail'));
    expect(res.status).toBe(500);

    const docs = await listDocuments();
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/verification failed/i);
  });

  it('embeds each document through a single batched provider call with concurrency', async () => {
    mocks.extractPdfText.mockResolvedValue([{ pageNumber: 1, text: 'A'.repeat(5000) }]);

    const res = await upload(makePdf('batched-embed'));
    expect(res.status).toBe(200);

    // One call for the whole document (provider-side batching), not one per chunk.
    expect(mocks.embedBatch).toHaveBeenCalledTimes(1);
    const call = mocks.embedBatch.mock.calls[0] as [
      string[],
      { batchSize: number; concurrency: number; signal: AbortSignal; onBatchComplete: unknown },
    ];
    expect(call[0].length).toBeGreaterThan(1);
    expect(call[1].batchSize).toBe(50);
    expect(call[1].concurrency).toBe(4);
    expect(call[1].signal).toBeInstanceOf(AbortSignal);
    expect(typeof call[1].onBatchComplete).toBe('function');
  });

  it('does not report ready when the embedding response is invalid', async () => {
    // Fewer embeddings than chunks: the processor must fail, never report ready.
    mocks.embedBatch.mockResolvedValue([]);

    const res = await upload(makePdf('invalid-embed'));
    expect(res.status).toBe(500);

    const docs = await listDocuments();
    expect(docs[0].status).toBe('error');
    expect(docs[0].status).not.toBe('ready');
    expect(docs[0].error).toMatch(/count mismatch|invalid/i);
  });

  it('rejects a PDF with no extractable text with an actionable 400', async () => {
    mocks.extractPdfText.mockResolvedValue([{ pageNumber: 1, text: '' }]);

    const res = await upload(makePdf('empty-pdf'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no extractable text/i);

    const docs = await listDocuments();
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/no extractable text/i);
  });

  it('rejects non-PDF uploads without creating a record', async () => {
    const file = new File([new TextEncoder().encode('not a pdf')], 'notes.txt', {
      type: 'text/plain',
    });
    const res = await upload(file);
    expect(res.status).toBe(400);
    expect(await listDocuments()).toHaveLength(0);
  });

  it('adopts a failed legacy record instead of creating a duplicate', async () => {
    const file = makePdf('holiday re-upload');
    writeFileSync(
      join(storeDir, 'documents.json'),
      JSON.stringify({
        documents: {
          'legacy-holiday': {
            id: 'legacy-holiday',
            name: 'Holiday Calendar 2026',
            fileName: file.name,
            fileType: 'pdf',
            size: file.size,
            status: 'error',
            error: 'Invalid URL: ./data/chroma',
            uploadedAt: '2026-10-15T11:36:05.354Z',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const res = await upload(file);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.adopted).toBe(true);
    expect(body.documentId).toBe('legacy-holiday');

    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('legacy-holiday');
    expect(docs[0].status).toBe('ready');
    expect(docs[0].contentHash).toBeTruthy();
  });

  it('returns 409 for a matching legacy record that is still in flight', async () => {
    const file = makePdf('in-flight');
    writeFileSync(
      join(storeDir, 'documents.json'),
      JSON.stringify({
        documents: {
          'legacy-inflight': {
            id: 'legacy-inflight',
            name: 'Holiday Calendar 2026',
            fileName: file.name,
            fileType: 'pdf',
            size: file.size,
            status: 'processing',
            uploadedAt: '2026-10-15T11:36:05.354Z',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const res = await upload(file);
    expect(res.status).toBe(409);
    expect(await listDocuments()).toHaveLength(1);
  });
});
