import { ChromaClient, CloudClient, Collection, Metadata } from 'chromadb';

export interface VectorChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface QueryResult {
  chunks: VectorChunk[];
  distances: number[];
}

interface ChromaQueryParams {
  queryEmbeddings: number[][];
  nResults: number;
  where?: Record<string, string>;
}

export interface ChromaConnection {
  host: string;
  port: number;
  ssl: boolean;
}

/**
 * Resolve the ChromaDB server connection settings.
 *
 * The chromadb JS client is an HTTP client — it does NOT embed a local database.
 * The old code passed `{ path: './data/chroma' }`, which the client parses with
 * `new URL(path)` and rejects, throwing `ChromaValueError: Invalid URL` for the
 * default configuration. Every vector operation then failed, so no document
 * could ever finish processing.
 *
 * Resolution order:
 *   1. CHROMA_HOST / CHROMA_PORT (optionally CHROMA_SSL)
 *   2. CHROMA_URL or CHROMA_DB_PATH when it is a real URL (http/https)
 *   3. Default server: http://localhost:8000
 *
 * A filesystem-looking value (e.g. './data/chroma') is treated as a hint that is
 * not a server URL and falls back to the default server instead of crashing.
 */
export function resolveChromaConnection(env: NodeJS.ProcessEnv = process.env): ChromaConnection {
  if (env.CHROMA_HOST || env.CHROMA_PORT) {
    return {
      host: env.CHROMA_HOST || 'localhost',
      port: Number(env.CHROMA_PORT || '8000'),
      ssl: env.CHROMA_SSL === 'true',
    };
  }

  const configured = env.CHROMA_URL || env.CHROMA_DB_PATH;
  if (configured) {
    try {
      const url = new URL(configured);
      return {
        host: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? '443' : '8000')),
        ssl: url.protocol === 'https:',
      };
    } catch {
      // Not a URL (e.g. legacy filesystem path) — use the default server.
    }
  }

  return { host: 'localhost', port: 8000, ssl: false };
}

/**
 * Chroma Cloud rejects a single `add` of more than 300 records with a
 * `ChromaQuotaExceededError` (verified against the live API). Larger documents
 * are therefore written in multiple bounded batches.
 */
export const CHROMA_MAX_RECORDS_PER_WRITE = 300;

/**
 * Chroma Cloud also caps the number of records returned by a single read
 * (`get`) at 300. Reads that must see every matching record have to page with
 * `limit`/`offset`, otherwise counts and listings silently truncate (which
 * would break the "did every chunk persist?" verification).
 */
export const CHROMA_MAX_RESULTS_PER_READ = 300;

/**
 * Build the Chroma client for the current environment.
 *
 *   - When `CHROMA_API_KEY` is set we connect to Chroma Cloud (hosted,
 *     serverless) with `CloudClient`. `CHROMA_TENANT` / `CHROMA_DATABASE`
 *     select the target, and `CHROMA_HOST` overrides the default
 *     `api.trychroma.com` endpoint.
 *   - Otherwise we fall back to a self-hosted Chroma server (local dev or a
 *     Docker container) resolved from CHROMA_HOST/PORT/URL.
 *
 * The same collection API is used in both modes, so callers are unaffected.
 */
export function createChromaClient(env: NodeJS.ProcessEnv = process.env): ChromaClient {
  const apiKey = env.CHROMA_API_KEY?.trim();
  if (apiKey) {
    return new CloudClient({
      apiKey,
      host: env.CHROMA_HOST?.trim() || undefined,
      tenant: env.CHROMA_TENANT || undefined,
      database: env.CHROMA_DATABASE || undefined,
    });
  }

  const { host, port, ssl } = resolveChromaConnection(env);
  return new ChromaClient({
    host,
    port,
    ssl,
    tenant: env.CHROMA_TENANT,
    database: env.CHROMA_DATABASE,
  });
}

class VectorStore {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private collectionName = 'researchpilot_documents';

  private getClient(): ChromaClient {
    if (!this.client) {
      this.client = createChromaClient();
    }
    return this.client;
  }

  private serverHint(): string {
    if (process.env.CHROMA_API_KEY?.trim()) {
      const host = process.env.CHROMA_HOST?.trim() || 'api.trychroma.com';
      const db = process.env.CHROMA_DATABASE || 'default';
      return `Chroma Cloud (${host}, database=${db})`;
    }
    const { host, port, ssl } = resolveChromaConnection();
    return `${ssl ? 'https' : 'http'}://${host}:${port}`;
  }

  /** Re-throw Chroma errors with an actionable connection hint. */
  private wrapError(operation: string, error: unknown): never {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Vector store unavailable (${operation} failed against ${this.serverHint()}): ${detail}`,
    );
  }

  async ensureCollection(): Promise<Collection> {
    if (this.collection) return this.collection;
    try {
      this.collection = await this.getClient().getOrCreateCollection({
        name: this.collectionName,
        // We always supply pre-computed embeddings, so opt out of the default
        // embedding function. This keeps the collection configuration explicit
        // and avoids the noisy "DefaultEmbeddingFunction" warning.
        embeddingFunction: null,
      });
    } catch (error) {
      this.wrapError('getOrCreateCollection', error);
    }
    return this.collection;
  }

  async addChunks(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    let collection: Collection;
    try {
      collection = await this.ensureCollection();
    } catch (error) {
      this.wrapError('addChunks (collection)', error);
    }

    // Chroma Cloud caps a single add at 300 records, so a large document is
    // split into multiple bounded writes. Writes are sequential to stay within
    // the per-collection concurrent-write limit and to keep failures easy to
    // reason about (a partial document is detected by the count verification).
    for (let start = 0; start < chunks.length; start += CHROMA_MAX_RECORDS_PER_WRITE) {
      const batch = chunks.slice(start, start + CHROMA_MAX_RECORDS_PER_WRITE);
      const ids = batch.map((c) => c.id);
      const texts = batch.map((c) => c.text);
      const embeddings = batch.map((c) => c.embedding || []);
      const metadatas: Metadata[] = batch.map((c) => {
        const meta: Record<string, unknown> = {
          documentId: c.documentId,
          documentName: c.documentName,
          chunkIndex: c.chunkIndex,
          ...(c.metadata || {}),
        };
        // Only include pageNumber if it's a valid positive integer
        if (typeof c.pageNumber === 'number' && Number.isInteger(c.pageNumber) && c.pageNumber > 0) {
          meta.pageNumber = c.pageNumber;
        }
        return meta as Metadata;
      });
      try {
        await collection.add({ ids, documents: texts, embeddings, metadatas });
      } catch (error) {
        this.wrapError('addChunks', error);
      }
    }
  }

  /**
   * Count stored chunks for a document, used to verify persistence.
   *
   * Paged because a single read only returns up to 300 records on Chroma Cloud;
   * an unpaged read would under-count large documents and make a fully-stored
   * document look incomplete.
   */
  async countDocumentChunks(documentId: string): Promise<number> {
    try {
      const collection = await this.ensureCollection();
      let total = 0;
      let offset = 0;
      for (;;) {
        const page = await collection.get({
          where: { documentId },
          limit: CHROMA_MAX_RESULTS_PER_READ,
          offset,
        });
        const pageCount = (page.ids || []).length;
        total += pageCount;
        if (pageCount < CHROMA_MAX_RESULTS_PER_READ) break;
        offset += pageCount;
      }
      return total;
    } catch (error) {
      this.wrapError('countDocumentChunks', error);
    }
  }

  async query(queryEmbedding: number[], topK = 5, documentId?: string): Promise<QueryResult> {
    const collection = await this.ensureCollection();
    const queryParams: ChromaQueryParams = {
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
    };
    if (documentId) {
      queryParams.where = { documentId: documentId };
    }
    const results = await collection.query(queryParams);
    const ids = results.ids[0] || [];
    const docs = results.documents[0] || [];
    const metas = results.metadatas[0] || [];
    const dists = results.distances?.[0] || [];
    const chunks: VectorChunk[] = ids.map((id, i) => ({
      id: String(id),
      documentId: String((metas[i]?.documentId as string) || ''),
      documentName: String((metas[i]?.documentName as string) || ''),
      pageNumber: (() => {
        const raw = metas[i]?.pageNumber;
        if (raw === undefined || raw === null) return undefined;
        const num = Number(raw);
        if (Number.isInteger(num) && num > 0) return num;
        // Invalid page number
        return undefined;
      })(),
      chunkIndex: Number((metas[i]?.chunkIndex as number) || 0),
      text: String((docs[i] as string) || ''),
      // Prepare metadata for ChromaDB: convert undefined to null
      metadata: (() => {
        const meta = metas[i] as Record<string, unknown>;
        if (!meta) return {};
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(meta)) {
          if (value !== undefined) {
            cleaned[key] = value;
          }
        }
        return cleaned;
      })(),
    }));
    return { chunks, distances: dists as number[] };
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      const collection = await this.ensureCollection();
      await collection.delete({ where: { documentId: documentId } });
    } catch (error) {
      this.wrapError('deleteDocument', error);
    }
  }

  async listDocumentIds(): Promise<string[]> {
    try {
      const collection = await this.ensureCollection();
      const ids = new Set<string>();
      let offset = 0;
      // Paged: a single read returns at most 300 records on Chroma Cloud.
      for (;;) {
        const page = await collection.get({
          include: ['metadatas'],
          limit: CHROMA_MAX_RESULTS_PER_READ,
          offset,
        });
        (page.metadatas || []).forEach((m) => {
          if (m && typeof m.documentId === 'string') ids.add(m.documentId);
        });
        const pageCount = (page.ids || []).length || (page.metadatas || []).length;
        if (pageCount < CHROMA_MAX_RESULTS_PER_READ) break;
        offset += pageCount;
      }
      return Array.from(ids);
    } catch (error) {
      this.wrapError('listDocumentIds', error);
    }
  }
}

export const vectorStore = new VectorStore();