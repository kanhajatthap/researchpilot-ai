// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Chroma Cloud support in the vector store.
 *
 * Verified against the live API:
 *   - `CloudClient({ apiKey, tenant, database })` is the hosted entry point.
 *   - A single `add` of more than 300 records fails with
 *     `ChromaQuotaExceededError` ("current usage of 305 exceeds limit of 300"),
 *     so large documents must be written in bounded batches.
 */

const mocks = vi.hoisted(() => ({
  cloudCtor: vi.fn(),
  chromaCtor: vi.fn(),
  getOrCreateCollection: vi.fn(),
}));

vi.mock('chromadb', () => {
  class ChromaClient {
    constructor(args: unknown) {
      mocks.chromaCtor(args);
    }
    getOrCreateCollection(args: unknown) {
      return mocks.getOrCreateCollection(args);
    }
    heartbeat() {
      return Promise.resolve(1);
    }
  }
  class CloudClient {
    constructor(args: unknown) {
      mocks.cloudCtor(args);
    }
    getOrCreateCollection(args: unknown) {
      return mocks.getOrCreateCollection(args);
    }
    heartbeat() {
      return Promise.resolve(1);
    }
  }
  return { ChromaClient, CloudClient };
});

const ENV_KEYS = [
  'CHROMA_API_KEY',
  'CHROMA_HOST',
  'CHROMA_PORT',
  'CHROMA_SSL',
  'CHROMA_URL',
  'CHROMA_DB_PATH',
  'CHROMA_TENANT',
  'CHROMA_DATABASE',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  mocks.cloudCtor.mockClear();
  mocks.chromaCtor.mockClear();
  mocks.getOrCreateCollection.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** Load a fresh vector-store module so the singleton does not leak between tests. */
async function loadStore() {
  return import('@/lib/rag/vectorstore');
}

function makeChunk(index: number) {
  return {
    id: `doc_c${index}`,
    documentId: 'doc',
    documentName: 'research.pdf',
    pageNumber: 1,
    chunkIndex: index,
    text: `text ${index}`,
    embedding: [0.1, 0.2],
  };
}

describe('createChromaClient', () => {
  it('uses CloudClient when CHROMA_API_KEY is set', async () => {
    process.env.CHROMA_API_KEY = 'ck-test-key';
    process.env.CHROMA_HOST = 'api.trychroma.com';
    process.env.CHROMA_TENANT = 'tenant-1';
    process.env.CHROMA_DATABASE = 'researchpilot';
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn() });

    const { vectorStore } = await loadStore();
    await vectorStore.ensureCollection();

    expect(mocks.cloudCtor).toHaveBeenCalledTimes(1);
    expect(mocks.chromaCtor).not.toHaveBeenCalled();
    expect(mocks.cloudCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'ck-test-key',
        host: 'api.trychroma.com',
        tenant: 'tenant-1',
        database: 'researchpilot',
      }),
    );
  });

  it('falls back to a self-hosted ChromaClient when no API key is set', async () => {
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn() });

    const { vectorStore } = await loadStore();
    await vectorStore.ensureCollection();

    expect(mocks.chromaCtor).toHaveBeenCalledTimes(1);
    expect(mocks.cloudCtor).not.toHaveBeenCalled();
    expect(mocks.chromaCtor).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 8000, ssl: false }),
    );
  });

  it('opts out of the default embedding function (we always send embeddings)', async () => {
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn() });

    const { vectorStore } = await loadStore();
    await vectorStore.ensureCollection();

    expect(mocks.getOrCreateCollection).toHaveBeenCalledWith({
      name: 'researchpilot_documents',
      embeddingFunction: null,
    });
  });
});

describe('addChunks batching (Chroma Cloud 300-record write limit)', () => {
  it('splits a large document into <=300-record writes, preserving order', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add });

    const { vectorStore, CHROMA_MAX_RECORDS_PER_WRITE } = await loadStore();
    expect(CHROMA_MAX_RECORDS_PER_WRITE).toBe(300);

    const chunks = Array.from({ length: 650 }, (_, i) => makeChunk(i));
    await vectorStore.addChunks(chunks);

    expect(add).toHaveBeenCalledTimes(3);
    expect(add.mock.calls.map((c) => c[0].ids.length)).toEqual([300, 300, 50]);
    expect(add.mock.calls.flatMap((c) => c[0].ids)).toEqual(chunks.map((c) => c.id));
  });

  it('performs a single write for documents at or below the limit', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add });

    const { vectorStore } = await loadStore();
    await vectorStore.addChunks([makeChunk(0), makeChunk(1)]);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0].ids).toEqual(['doc_c0', 'doc_c1']);
  });

  it('does nothing for an empty document', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add });

    const { vectorStore } = await loadStore();
    await vectorStore.addChunks([]);

    expect(add).not.toHaveBeenCalled();
  });

  it('surfaces write failures with the resolved backend in the message', async () => {
    process.env.CHROMA_API_KEY = 'ck-test-key';
    process.env.CHROMA_DATABASE = 'researchpilot';
    const add = vi.fn().mockRejectedValue(new Error('boom'));
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add });

    const { vectorStore } = await loadStore();
    await expect(vectorStore.addChunks([makeChunk(0)])).rejects.toThrow(
      /addChunks failed against Chroma Cloud/,
    );
  });
});

describe('read pagination (Chroma Cloud 300-result read cap)', () => {
  it('counts a document by paging past the 300-result cap', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({ ids: Array.from({ length: 300 }, () => 'id') });
    get.mockResolvedValueOnce({ ids: Array.from({ length: 300 }, () => 'id') });
    get.mockResolvedValueOnce({ ids: Array.from({ length: 50 }, () => 'id') });
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn(), get });

    const { vectorStore, CHROMA_MAX_RESULTS_PER_READ } = await loadStore();
    expect(CHROMA_MAX_RESULTS_PER_READ).toBe(300);

    const count = await vectorStore.countDocumentChunks('doc');

    expect(count).toBe(650);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls.map((c) => c[0].offset)).toEqual([0, 300, 600]);
    expect(get.mock.calls.every((c) => c[0].limit === 300)).toBe(true);
    expect(get.mock.calls.every((c) => c[0].where)).toEqual(true);

    // An exact multiple of the page size must not be under-counted.
    const exact = vi.fn();
    exact.mockResolvedValueOnce({ ids: Array.from({ length: 300 }, () => 'id') });
    exact.mockResolvedValueOnce({ ids: [] });
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn(), get: exact });
    vi.resetModules();
    const { vectorStore: store2 } = await loadStore();
    expect(await store2.countDocumentChunks('doc')).toBe(300);
  });

  it('lists distinct document ids across pages', async () => {
    const get = vi.fn();
    get.mockResolvedValueOnce({
      ids: Array.from({ length: 300 }, (_, i) => `a_${i}`),
      metadatas: Array.from({ length: 300 }, () => ({ documentId: 'doc-a' })),
    });
    get.mockResolvedValueOnce({
      ids: ['b_0'],
      metadatas: [{ documentId: 'doc-a' }, { documentId: 'doc-b' }],
    });
    mocks.getOrCreateCollection.mockResolvedValue({ name: 'c', add: vi.fn(), get });

    const { vectorStore } = await loadStore();
    const ids = await vectorStore.listDocumentIds();

    expect(ids.sort()).toEqual(['doc-a', 'doc-b']);
    expect(get.mock.calls.map((c) => c[0].offset)).toEqual([0, 300]);
  });
});
