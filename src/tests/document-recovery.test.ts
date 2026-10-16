// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regression tests for interrupted-processing recovery.
 *
 * The production records were stuck in `processing` forever because an attempt
 * that was interrupted (server restart/crash) never wrote a terminal status and
 * nothing ever recovered it. Recovery must be safe, explicit and idempotent.
 */

const mocks = vi.hoisted(() => ({
  deleteDocument: vi.fn(async () => undefined),
  listDocumentIds: vi.fn(async () => [] as string[]),
}));

vi.mock('@/lib/rag/vectorstore', () => ({
  vectorStore: {
    deleteDocument: mocks.deleteDocument,
    listDocumentIds: mocks.listDocumentIds,
  },
}));

let storeDir: string;

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function seed(documents: Record<string, Record<string, unknown>>) {
  writeFileSync(join(storeDir, 'documents.json'), JSON.stringify({ documents }, null, 2), 'utf-8');
}

beforeEach(() => {
  vi.resetModules();
  mocks.deleteDocument.mockClear();
  mocks.deleteDocument.mockResolvedValue(undefined);
  mocks.listDocumentIds.mockClear();
  storeDir = mkdtempSync(join(tmpdir(), 'rp-recovery-'));
  process.env.DOCUMENT_STORE_PATH = storeDir;
});

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

const STALE_MS = 30 * 60 * 1000; // 30 minutes
const MIN_AGE_MS = 10 * 60 * 1000; // 10 minutes

function seedMixed() {
  seed({
    'stale-processing': {
      id: 'stale-processing',
      name: 'Stuck Tesla Report',
      fileName: 'tsla.pdf',
      fileType: 'pdf',
      size: 100,
      status: 'processing',
      attemptId: 'att-old',
      lastActivityAt: iso(STALE_MS),
      uploadedAt: iso(2 * 60 * 60 * 1000),
      statusHistory: [{ status: 'processing', timestamp: iso(STALE_MS), attemptId: 'att-old' }],
    },
    'fresh-processing': {
      id: 'fresh-processing',
      name: 'Live Document',
      fileName: 'live.pdf',
      fileType: 'pdf',
      size: 100,
      status: 'processing',
      attemptId: 'att-live',
      lastActivityAt: iso(1000),
      uploadedAt: iso(60 * 60 * 1000),
    },
    'stale-legacy-queued': {
      id: 'stale-legacy-queued',
      name: 'Legacy Queued',
      fileName: 'legacy.pdf',
      fileType: 'pdf',
      size: 100,
      status: 'queued',
      uploadedAt: iso(3 * 24 * 60 * 60 * 1000),
    },
    'ready-doc': {
      id: 'ready-doc',
      name: 'Ready Document',
      fileName: 'ready.pdf',
      fileType: 'pdf',
      size: 100,
      status: 'ready',
      attemptId: 'att-ready',
      chunkCount: 5,
      pageCount: 1,
      uploadedAt: iso(60 * 60 * 1000),
    },
    'error-doc': {
      id: 'error-doc',
      name: 'Failed Document',
      fileName: 'failed.pdf',
      fileType: 'pdf',
      size: 100,
      status: 'error',
      error: 'previous failure',
      attemptId: 'att-error',
      uploadedAt: iso(60 * 60 * 1000),
    },
  });
}

describe('recoverInterrupted (store)', () => {
  it('dry-run reports stale records without mutating state', async () => {
    seedMixed();
    const before = readFileSync(join(storeDir, 'documents.json'), 'utf-8');
    const { documentStore } = await import('@/lib/rag/document-store');

    const report = await documentStore.recoverInterrupted({ dryRun: true, minAgeMs: MIN_AGE_MS });

    expect(report.mode).toBe('dry-run');
    expect(report.candidates.map((c) => c.id).sort()).toEqual([
      'stale-legacy-queued',
      'stale-processing',
    ]);
    // Nothing was written.
    expect(readFileSync(join(storeDir, 'documents.json'), 'utf-8')).toBe(before);
  });

  it('does not touch fresh in-flight attempts or terminal documents', async () => {
    seedMixed();
    const { documentStore } = await import('@/lib/rag/document-store');

    const report = await documentStore.recoverInterrupted({ dryRun: true, minAgeMs: MIN_AGE_MS });
    const ids = report.candidates.map((c) => c.id);
    expect(ids).not.toContain('fresh-processing');
    expect(ids).not.toContain('ready-doc');
    expect(ids).not.toContain('error-doc');
  });

  it('apply marks stale records as error and leaves others untouched', async () => {
    seedMixed();
    const { documentStore } = await import('@/lib/rag/document-store');

    const report = await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });
    expect(report.mode).toBe('applied');
    expect(report.recovered).toHaveLength(2);

    const stale = await documentStore.get('stale-processing');
    expect(stale?.status).toBe('error');
    expect(stale?.error).toMatch(/interrupted/i);
    expect(stale?.attemptId).not.toBe('att-old');
    expect(stale?.statusHistory?.some((h) => h.status === 'error')).toBe(true);

    const fresh = await documentStore.get('fresh-processing');
    expect(fresh?.status).toBe('processing');
    expect(fresh?.attemptId).toBe('att-live');

    expect((await documentStore.get('ready-doc'))?.status).toBe('ready');
    expect((await documentStore.get('error-doc'))?.status).toBe('error');
  });

  it('is idempotent — a second apply recovers nothing', async () => {
    seedMixed();
    const { documentStore } = await import('@/lib/rag/document-store');

    await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });
    const second = await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });
    expect(second.recovered).toHaveLength(0);
    expect(second.candidates).toHaveLength(0);
  });

  it('prevents the interrupted attempt from writing after recovery', async () => {
    seedMixed();
    const { documentStore } = await import('@/lib/rag/document-store');

    await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });

    // The old attempt (att-old) must no longer be able to write status.
    expect(await documentStore.markReadyIfAttempt('stale-processing', 9, 9, 'att-old')).toBeNull();
    expect(await documentStore.touchIfAttempt('stale-processing', 'att-old')).toBeNull();
    expect((await documentStore.get('stale-processing'))?.status).toBe('error');
  });

  it('recovers persisted records after a simulated restart (fresh module instance)', async () => {
    seedMixed();
    // Simulate a process restart by dropping the module cache.
    vi.resetModules();
    const { documentStore } = await import('@/lib/rag/document-store');

    const report = await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });
    expect(report.recovered.map((r) => r.id).sort()).toEqual([
      'stale-legacy-queued',
      'stale-processing',
    ]);
  });

  it('gives an actionable next step: retry when the file exists, re-upload when it does not', async () => {
    mkdirSync(join(storeDir, 'files'), { recursive: true });
    writeFileSync(join(storeDir, 'files', 'present.pdf'), '%PDF-1.4');
    seed({
      'with-file': {
        id: 'with-file',
        name: 'With File',
        fileName: 'present.pdf',
        fileType: 'pdf',
        size: 5,
        status: 'processing',
        attemptId: 'atts',
        filePath: 'present.pdf',
        lastActivityAt: iso(STALE_MS),
      },
      'without-file': {
        id: 'without-file',
        name: 'Without File',
        fileName: 'gone.pdf',
        fileType: 'pdf',
        size: 5,
        status: 'processing',
        attemptId: 'atts2',
        filePath: 'gone.pdf',
        lastActivityAt: iso(STALE_MS),
      },
    });

    const { documentStore } = await import('@/lib/rag/document-store');
    await documentStore.recoverInterrupted({ dryRun: false, minAgeMs: MIN_AGE_MS });

    expect((await documentStore.get('with-file'))?.error).toMatch(/retry to reprocess/i);
    expect((await documentStore.get('without-file'))?.error).toMatch(/upload it again/i);
  });
});

describe('recovery endpoint', () => {
  async function callGet() {
    const { GET } = await import('@/app/api/documents/recovery/route');
    return GET();
  }

  async function callPost(body: unknown) {
    const { POST } = await import('@/app/api/documents/recovery/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/documents/recovery', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
    return POST(req);
  }

  it('GET performs a dry-run and never mutates state', async () => {
    seedMixed();
    const before = readFileSync(join(storeDir, 'documents.json'), 'utf-8');

    const res = await callGet();
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.mode).toBe('dry-run');
    expect(report.candidates.length).toBeGreaterThan(0);
    expect(readFileSync(join(storeDir, 'documents.json'), 'utf-8')).toBe(before);
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it('POST without apply is treated as a dry-run', async () => {
    seedMixed();
    const res = await callPost({});
    const report = await res.json();
    expect(report.mode).toBe('dry-run');
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it('POST apply recovers records and reconciles vectors', async () => {
    seedMixed();
    const { documentStore } = await import('@/lib/rag/document-store');
    const res = await callPost({ apply: true, minAgeMs: MIN_AGE_MS });
    const report = await res.json();

    expect(report.mode).toBe('applied');
    expect(report.recovered).toHaveLength(2);
    expect(mocks.deleteDocument).toHaveBeenCalledWith('stale-processing');
    expect(mocks.deleteDocument).toHaveBeenCalledWith('stale-legacy-queued');
    expect(report.recovered.every((c: { hasVectorsRemoved: string }) => c.hasVectorsRemoved === 'ok')).toBe(true);
    expect((await documentStore.get('stale-processing'))?.status).toBe('error');
  });

  it('still recovers records when vector cleanup fails, and reports the failure', async () => {
    seedMixed();
    mocks.deleteDocument.mockRejectedValue(new Error('chroma down'));

    const res = await callPost({ apply: true, minAgeMs: MIN_AGE_MS });
    const report = await res.json();
    expect(report.recovered).toHaveLength(2);
    expect(report.recovered.every((c: { hasVectorsRemoved: string }) => c.hasVectorsRemoved === 'failed')).toBe(true);

    const { documentStore } = await import('@/lib/rag/document-store');
    expect((await documentStore.get('stale-processing'))?.status).toBe('error');
  });
});
