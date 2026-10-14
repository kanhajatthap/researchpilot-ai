import { ChromaClient, Collection, Metadata } from 'chromadb';

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

class VectorStore {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private collectionName = 'researchpilot_documents';

  private getClient(): ChromaClient {
    if (!this.client) {
      const path = process.env.CHROMA_DB_PATH || './data/chroma';
      this.client = new ChromaClient({ path });
    }
    return this.client;
  }

  async ensureCollection(): Promise<Collection> {
    if (this.collection) return this.collection;
    this.collection = await this.getClient().getOrCreateCollection({
      name: this.collectionName,
    });
    return this.collection;
  }

  async addChunks(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const collection = await this.ensureCollection();
    const ids = chunks.map((c) => c.id);
    const texts = chunks.map((c) => c.text);
    const embeddings = chunks.map((c) => c.embedding || []);
    const metadatas: Metadata[] = chunks.map((c) => {
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
    await collection.add({ ids, documents: texts, embeddings, metadatas });
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
    const collection = await this.ensureCollection();
    await collection.delete({ where: { documentId: documentId } });
  }

  async listDocumentIds(): Promise<string[]> {
    const collection = await this.ensureCollection();
    const results = await collection.get({ include: ['metadatas'] });
    const ids = new Set<string>();
    (results.metadatas || []).forEach((m) => {
      if (m && typeof m.documentId === 'string') ids.add(m.documentId);
    });
    return Array.from(ids);
  }
}

export const vectorStore = new VectorStore();