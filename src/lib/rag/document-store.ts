import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Document, DocumentChunk } from '@/types/document';

/**
 * Local file-based storage for document metadata and chunk manifest.
 * Keeps document records consistent with ChromaDB vector records.
 * Stored as a single JSON file that is read-modified-written atomically.
 * Also stores uploaded PDF files in a dedicated directory.
 */

export interface DocumentRecord extends Omit<Document, 'metadata'> {
  chunks?: DocumentChunk[];
  metadata?: Record<string, unknown>;
  filePath?: string; // Path to stored PDF file (relative to data dir)
}

interface StoreState {
  documents: Record<string, DocumentRecord>;
}

let inMemory: StoreState | null = null;

function dataDir(): string {
  // Prefer explicit override from env so tests can point at a temp dir.
  return process.env.DOCUMENT_STORE_PATH || path.join(process.cwd(), 'data', 'documents');
}

function storePath(): string {
  return path.join(dataDir(), 'documents.json');
}

function fileDir(): string {
  return path.join(dataDir(), 'files');
}

async function readStore(): Promise<StoreState> {
  if (inMemory) return inMemory;
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw) as StoreState;
    // Re-hydrate Date objects from ISO strings.
    for (const doc of Object.values(parsed.documents)) {
      if (typeof doc.uploadedAt === 'string') {
        doc.uploadedAt = new Date(doc.uploadedAt);
      }
    }
    inMemory = parsed;
    return parsed;
  } catch {
    inMemory = { documents: {} };
    return inMemory;
  }
}

async function writeStore(state: StoreState): Promise<void> {
  inMemory = state;
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(fileDir(), { recursive: true });
  // Atomic write via temp + rename.
  const tmp = storePath() + '.tmp.' + randomUUID();
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tmp, storePath());
}

export const documentStore = {
  async create(metadata: Omit<Document, 'id'>): Promise<Document> {
    const state = await readStore();
    const doc: Document = {
      ...metadata,
      id: randomUUID(),
      uploadedAt: new Date(),
    };
    state.documents[doc.id] = { ...doc };
    await writeStore(state);
    return doc;
  },

  async update(id: string, patch: Partial<Document>): Promise<Document | null> {
    const state = await readStore();
    const existing = state.documents[id];
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    state.documents[id] = updated;
    await writeStore(state);
    return updated;
  },

  async get(id: string): Promise<Document | null> {
    const state = await readStore();
    const doc = state.documents[id];
    if (!doc) return null;
    // Strip the internal `chunks` field before returning to callers.
    const { chunks: _chunks, ...rest } = doc;
    return rest;
  },

  async list(): Promise<Document[]> {
    const state = await readStore();
    return Object.values(state.documents)
      .map((doc) => {
        const { chunks: _chunks, ...rest } = doc;
        return rest;
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  },

  async exists(id: string): Promise<boolean> {
    const state = await readStore();
    return !!state.documents[id];
  },

  async delete(id: string): Promise<boolean> {
    const state = await readStore();
    if (!state.documents[id]) return false;
    
    // Remove the stored file if it exists
    const filePath = state.documents[id].filePath;
    if (filePath) {
      const fullPath = path.join(fileDir(), filePath);
      try {
        await fs.unlink(fullPath);
      } catch (e) {
        console.error('File deletion error:', e);
      }
    }
    
    delete state.documents[id];
    await writeStore(state);
    return true;
  },

  _resetForTests(): void {
    inMemory = { documents: {} };
  },

  /**
   * Check if a document with the same filename and size already exists.
   * Useful for idempotent upload handling.
   */
  async findByFileNameAndSize(fileName: string, fileSize: number): Promise<Document | null> {
    const state = await readStore();
    for (const doc of Object.values(state.documents)) {
      if (doc.fileName === fileName && doc.size === fileSize) {
        return doc;
      }
    }
    return null;
  },

  /**
   * Mark a document as failed with an error message.
   * This can be called from the API when processing fails.
   */
  async markFailed(id: string, errorMessage: string): Promise<Document | null> {
    return this.update(id, { status: 'error', error: errorMessage });
  },

  /**
   * Mark a document as queued (for batch processing or retry queuing).
   */
  async markQueued(id: string): Promise<Document | null> {
    return this.update(id, { status: 'queued' });
  },

  /**
   * Mark a document as processing (active job).
   */
  async markProcessing(id: string): Promise<Document | null> {
    return this.update(id, { status: 'processing' });
  },

  /**
   * Mark a document as ready with chunk/page counts.
   */
  async markReady(id: string, chunkCount: number, pageCount: number): Promise<Document | null> {
    return this.update(id, { status: 'ready', chunkCount, pageCount });
  },
};