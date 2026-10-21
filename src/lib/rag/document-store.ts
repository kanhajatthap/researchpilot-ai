import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Document, DocumentChunk, StatusTransition } from '@/types/document';
import { getStorageConfig } from '@/lib/storage/config';
import { readStateRow, withStateRow, writeStateRow } from '@/lib/storage/postgres';
import { createFileStore, type FileStore } from '@/lib/storage/file-store';

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
  contentHash?: string;
  /** ISO timestamp of the most recent processing heartbeat (internal). */
  lastActivityAt?: string;
}

interface StoreState {
  documents: Record<string, DocumentRecord>;
}

let inMemory: StoreState | null = null;

/**
 * In-process mutation mutex.
 *
 * Every mutating operation performs a read-modify-write cycle that spans
 * `await` points. Without serialization, two concurrent requests (for example
 * two uploads of the same PDF) can both pass a duplicate check before either
 * writes, producing duplicate records; a concurrent retry and upload can also
 * interleave their attempt claims.
 *
 * All mutations therefore run through this promise chain so each cycle is
 * atomic within this process. Read-only operations do not take the lock — they
 * only ever observe a consistent in-memory snapshot.
 *
 * NOTE: this is an in-process lock only. Multiple server processes sharing one
 * data directory are not supported by this store (documented limitation).
 */
let mutationChain: Promise<unknown> = Promise.resolve();

/**
 * Serialize in-process mutations (filesystem driver). Postgres uses a row lock
 * inside `mutateStore` instead.
 */
function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(fn);
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Atomic read-modify-write for one document-store mutation. The callback
 * receives the current state, mutates it in place (or reassigns records), and
 * returns the caller-facing result; persistence is handled here.
 */
function mutateStore<T>(fn: (state: StoreState) => Promise<T> | T): Promise<T> {
  if (isPostgresDriver()) {
    return withStateRow<StoreState, T>(POSTGRES_KEY, async (current) => {
      const state = current ? normalizeState(current) : { documents: {} };
      const result = await fn(state);
      return { value: state, result };
    });
  }
  return withStoreLock(async () => {
    const state = await readStore();
    const result = await fn(state);
    await writeStore(state);
    return result;
  });
}

function dataDir(): string {
  // Prefer explicit override from env so tests can point at a temp dir.
  return process.env.DOCUMENT_STORE_PATH || path.join(process.cwd(), 'data', 'documents');
}

const POSTGRES_KEY = 'documents';

function isPostgresDriver(): boolean {
  return getStorageConfig().driver === 'vercel';
}

let fileStoreInstance: FileStore | null = null;

/** Uploaded-file store for the configured driver (filesystem or Vercel Blob). */
function files(): FileStore {
  if (!fileStoreInstance) {
    fileStoreInstance = createFileStore(fileDir());
  }
  return fileStoreInstance;
}

function storePath(): string {
  return path.join(dataDir(), 'documents.json');
}

function fileDir(): string {
  return path.join(dataDir(), 'files');
}

const TRANSIENT_FS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'EEXIST']);

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read the store file, retrying transient Windows lock errors (EPERM/EBUSY).
 *
 * A missing file is a legitimate empty store. Any other failure must NOT be
 * treated as "no documents" — doing so would let the next write silently erase
 * every record. Instead we retry and, if the file is genuinely unreadable,
 * throw so the caller fails loudly.
 */
async function readStoreFile(): Promise<string | null> {
  const target = storePath();
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await fs.readFile(target, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null; // no store yet
      if (!TRANSIENT_FS_CODES.has(code || '')) throw error;
      await delay(20 * (attempt + 1));
    }
  }
  return fs.readFile(target, 'utf-8');
}

function normalizeState(parsed: StoreState): StoreState {
  if (!parsed.documents || typeof parsed.documents !== 'object') {
    parsed.documents = {};
  }
  // Re-hydrate Date objects from ISO strings.
  for (const doc of Object.values(parsed.documents)) {
    if (typeof doc.uploadedAt === 'string') {
      doc.uploadedAt = new Date(doc.uploadedAt);
    }
  }
  return parsed;
}

async function readStore(): Promise<StoreState> {
  if (isPostgresDriver()) {
    const stored = await readStateRow<StoreState>(POSTGRES_KEY);
    return stored ? normalizeState(stored) : { documents: {} };
  }

  if (inMemory) return inMemory;
  const raw = await readStoreFile();
  if (raw === null) {
    inMemory = { documents: {} };
    return inMemory;
  }
  let parsed: StoreState;
  try {
    parsed = JSON.parse(raw) as StoreState;
  } catch (error) {
    // Never silently discard an unreadable store — fail loudly instead.
    throw new Error(
      `Document store at ${storePath()} is corrupted and could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  inMemory = normalizeState(parsed);
  return inMemory;
}

/**
 * Atomically replace the store file (temp + rename).
 *
 * On Windows, renaming over a file that is momentarily open (a concurrent read,
 * an editor, or a file watcher) fails with EPERM/EBUSY. This used to fail
 * uploads intermittently, so the rename is retried with backoff before giving
 * up. On final failure the temp file is cleaned up and the error is propagated
 * (the operation is never reported as successful when the write did not land).
 */
async function writeStore(state: StoreState): Promise<void> {
  if (isPostgresDriver()) {
    await writeStateRow(POSTGRES_KEY, state);
    return;
  }

  inMemory = state;
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(fileDir(), { recursive: true });

  const serialized = JSON.stringify(state, null, 2);
  const dest = storePath();
  const tmp = dest + '.tmp.' + randomUUID();
  await fs.writeFile(tmp, serialized, 'utf-8');

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rename(tmp, dest);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!TRANSIENT_FS_CODES.has(code || '')) {
        await fs.unlink(tmp).catch(() => undefined);
        throw error;
      }
      await delay(20 * (attempt + 1));
    }
  }

  // Last resort: overwrite in place so the operation does not silently fail.
  try {
    await fs.writeFile(dest, serialized, 'utf-8');
    await fs.unlink(tmp).catch(() => undefined);
    return;
  } catch {
    await fs.unlink(tmp).catch(() => undefined);
    throw lastError;
  }
}

function stripInternal(doc: DocumentRecord): Document {
  const { chunks: _chunks, ...rest } = doc;
  return rest;
}

/**
 * Timestamp of the most recent meaningful activity for a record. Used to decide
 * whether an interrupted attempt is abandoned (stale) or possibly still live.
 */
function lastActivityOf(doc: DocumentRecord): number {
  if (doc.lastActivityAt) {
    const t = Date.parse(doc.lastActivityAt);
    if (!Number.isNaN(t)) return t;
  }
  const history = doc.statusHistory;
  if (history && history.length > 0) {
    const t = Date.parse(history[history.length - 1].timestamp);
    if (!Number.isNaN(t)) return t;
  }
  const uploaded = doc.uploadedAt instanceof Date ? doc.uploadedAt.getTime() : Date.parse(String(doc.uploadedAt));
  return Number.isNaN(uploaded) ? 0 : uploaded;
}

export interface RecoveryCandidate {
  id: string;
  name: string;
  status: Document['status'];
  attemptId?: string;
  lastActivityAt: string;
  ageMs: number;
  /** Vectors existed for this document at scan time (best effort). */
  hasVectorsRemoved?: 'ok' | 'failed' | 'skipped';
}

export interface RecoveryReport {
  mode: 'dry-run' | 'applied';
  minAgeMs: number;
  scanned: number;
  candidates: RecoveryCandidate[];
  recovered: RecoveryCandidate[];
  remaining: number;
}

/**
 * Re-queue a FAILED record for a new processing attempt: fresh attemptId,
 * error cleared, status `queued`, and a `queued` transition appended.
 *
 * Shared by the legacy (no content hash) adoption path and the identical-
 * content adoption path so both apply exactly the same duplicate policy.
 * The caller holds the mutation lock and persists the returned state.
 */
function adoptFailedRecord(
  state: StoreState,
  record: DocumentRecord,
  contentHash?: string,
): DocumentRecord {
  const now = new Date();
  const attemptId = randomUUID();
  const history = (record.statusHistory || []).slice();
  history.push({ status: 'queued', timestamp: now.toISOString(), attemptId });
  const adopted: DocumentRecord = {
    ...record,
    contentHash: contentHash || record.contentHash,
    status: 'queued',
    error: undefined,
    chunkCount: undefined,
    pageCount: undefined,
    attemptId,
    lastActivityAt: now.toISOString(),
    statusHistory: history,
  };
  state.documents[record.id] = adopted;
  return adopted;
}

export const documentStore = {
  async create(metadata: Omit<Document, 'id'>): Promise<Document> {
    return mutateStore(async (state) => {
      const now = new Date();
      const doc: Document = {
        ...metadata,
        id: randomUUID(),
        uploadedAt: now,
        attemptId: randomUUID(),
        statusHistory: [
          { status: metadata.status, timestamp: now.toISOString(), attemptId: metadata.attemptId },
        ],
      };
      state.documents[doc.id] = { ...doc };
      return doc;
    });
  },

  /**
   * Resolve an incoming upload against the stored documents atomically and
   * apply a clear duplicate policy:
   *
   *  - Identity is the SHA-256 content hash. Uploading the same bytes again is
   *    idempotent and returns the existing record (kind: 'existing'), except
   *    when the previous attempt FAILED: that record is adopted with a fresh
   *    attempt (kind: 'adopt') so a re-upload reprocesses instead of replaying
   *    a stale failure (e.g. a daily-quota error whose window has reset).
   *  - A legacy record (created before content hashing existed) that matches on
   *    file name + size but has no hash is *adopted* when it previously failed:
   *    the new upload's content and file replace its stale state, reusing the
   *    document id (kind: 'adopt').
   *  - Different content is always a separate document, even with an identical
   *    file name (kind: 'create').
   *
   * Runs under the mutation lock, so concurrent uploads of the same file cannot
   * both create records.
   */
  async beginUpload(input: {
    name: string;
    fileName: string;
    size: number;
    contentHash: string;
  }): Promise<{ kind: 'create' | 'adopt' | 'existing'; doc: Document }> {
    return mutateStore(async (state) => {
      const records = Object.values(state.documents);

      // 1. Strongest identity: identical content.
      if (input.contentHash) {
        const byHash = records.find((d) => d.contentHash === input.contentHash);
        if (byHash) {
          if (byHash.status !== 'error') {
            return { kind: 'existing' as const, doc: stripInternal(byHash) };
          }
          // Identical content that failed earlier: adopt it with a fresh
          // attempt so a re-upload reprocesses instead of replaying a stale
          // failure (which may come from a quota window that has since reset).
          const adopted = adoptFailedRecord(state, byHash, input.contentHash);
          return { kind: 'adopt' as const, doc: stripInternal(adopted) };
        }
      }

      // 2. Legacy fallback: same name + size, no content hash recorded.
      const legacyMatches = records
        .filter((d) => d.fileName === input.fileName && d.size === input.size && !d.contentHash)
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      const legacy = legacyMatches[0];
      if (legacy) {
        if (legacy.status !== 'error') {
          // Ready or in-flight legacy record: keep the original semantics and
          // do not create a duplicate.
          return { kind: 'existing' as const, doc: stripInternal(legacy) };
        }
        // Adopt the failed legacy record: reuse its id, claim a fresh attempt.
        const adopted = adoptFailedRecord(state, legacy, input.contentHash);
        return { kind: 'adopt' as const, doc: stripInternal(adopted) };
      }

      // 3. New document.
      const now = new Date();
      const attemptId = randomUUID();
      const created: DocumentRecord = {
        id: randomUUID(),
        name: input.name,
        fileName: input.fileName,
        fileType: 'pdf',
        size: input.size,
        status: 'queued',
        uploadedAt: now,
        contentHash: input.contentHash,
        attemptId,
        lastActivityAt: now.toISOString(),
        statusHistory: [{ status: 'queued', timestamp: now.toISOString(), attemptId }],
      };
      state.documents[created.id] = created;
      return { kind: 'create' as const, doc: stripInternal(created) };
    });
  },

  async update(id: string, patch: Partial<Document>): Promise<Document | null> {
    return mutateStore(async (state) => {
      const existing = state.documents[id];
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      state.documents[id] = updated;
      return updated;
    });
  },

  /**
   * Conditional update: only apply the patch if the document's current attemptId
   * matches the expectedAttemptId. This prevents stale processing attempts from
   * overwriting the status of newer attempts (optimistic concurrency).
   * Returns the updated document if the patch was applied, null if rejected.
   */
  async updateIfAttempt(
    id: string,
    patch: Partial<Document>,
    expectedAttemptId: string,
  ): Promise<Document | null> {
    return mutateStore(async (state) => {
      const existing = state.documents[id];
      if (!existing) return null;
      // Reject unless the caller can prove ownership of the current attempt.
      // (A legacy record without an attemptId cannot be written this way.)
      if (existing.attemptId !== expectedAttemptId) {
        return null;
      }
      const now = new Date();
      const updated = { ...existing, ...patch };
      // Append a status transition record when the status changes.
      if (patch.status && patch.status !== existing.status) {
        const history = (existing.statusHistory || []).slice();
        history.push({
          status: patch.status,
          timestamp: now.toISOString(),
          attemptId: existing.attemptId,
          ...(patch.error ? { error: patch.error } : {}),
        });
        updated.statusHistory = history;
      }
      state.documents[id] = updated;
      return updated;
    });
  },

  /**
   * Record a processing heartbeat for the current attempt. Used by the pipeline
   * so recovery can distinguish a live attempt from an abandoned one.
   * Returns null when the attempt is stale (a newer attempt owns the document).
   */
  async touchIfAttempt(id: string, attemptId: string): Promise<Document | null> {
    return mutateStore(async (state) => {
      const existing = state.documents[id];
      if (!existing) return null;
      if (existing.attemptId !== attemptId) return null;
      existing.lastActivityAt = new Date().toISOString();
      state.documents[id] = existing;
      return stripInternal(existing);
    });
  },

  async get(id: string): Promise<Document | null> {
    const state = await readStore();
    const doc = state.documents[id];
    if (!doc) return null;
    return stripInternal(doc);
  },

  /**
   * Get the full document record including internal fields (chunks, filePath).
   * Used internally for file access and retry cleanup.
   */
  async getRecord(id: string): Promise<DocumentRecord | null> {
    const state = await readStore();
    return state.documents[id] || null;
  },

  async list(): Promise<Document[]> {
    const state = await readStore();
    return Object.values(state.documents)
      .map(stripInternal)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  },

  async exists(id: string): Promise<boolean> {
    const state = await readStore();
    return !!state.documents[id];
  },

  async delete(id: string): Promise<boolean> {
    return mutateStore(async (state) => {
      if (!state.documents[id]) return false;

      // Remove the stored file if it exists
      const filePath = state.documents[id].filePath;
      if (filePath) {
        try {
          await files().remove(filePath);
        } catch (e) {
          console.error('File deletion error:', e);
        }
      }

      delete state.documents[id];
      return true;
    });
  },

  /**
   * Save an uploaded PDF and return the stored reference.
   * Filesystem: the file name under `data/documents/files`.
   * Blob: the private blob URL.
   */
  async saveFile(documentId: string, buffer: Buffer, originalName: string): Promise<string> {
    return files().save(documentId, buffer, originalName);
  },

  /**
   * Set the stored file path for a document (internal field).
   */
  async setFilePath(id: string, filePath: string): Promise<Document | null> {
    return mutateStore(async (state) => {
      const existing = state.documents[id];
      if (!existing) return null;
      existing.filePath = filePath;
      state.documents[id] = existing;
      return stripInternal(existing);
    });
  },

  /**
   * Read the stored PDF for a document. Driver-agnostic: works for both the
   * filesystem and Vercel Blob backends (unlike `getFilePath`, which only
   * returns a local absolute path).
   */
  async readFile(documentId: string): Promise<Buffer | null> {
    const record = await this.getRecord(documentId);
    if (!record || !record.filePath) return null;
    return files().read(record.filePath);
  },

  /**
   * Get the absolute local path to the stored PDF, if the filesystem driver is
   * in use. Returns null for remote (Blob) storage.
   */
  async getFilePath(documentId: string): Promise<string | null> {
    const record = await this.getRecord(documentId);
    if (!record || !record.filePath) return null;
    return files().localPath(record.filePath);
  },

  _resetForTests(): void {
    inMemory = { documents: {} };
  },

  /**
   * Check if a document with the same filename and size already exists.
   * Useful for idempotent upload handling (Phase 5 duplicate detection).
   */
  async findByFileNameAndSize(fileName: string, fileSize: number): Promise<Document | null> {
    const state = await readStore();
    for (const doc of Object.values(state.documents)) {
      if (doc.fileName === fileName && doc.size === fileSize) {
        return stripInternal(doc);
      }
    }
    return null;
  },

  /**
   * Find document by content hash (stronger identity).
   */
  async findByContentHash(hash: string): Promise<Document | null> {
    if (!hash) return null;
    const state = await readStore();
    for (const doc of Object.values(state.documents)) {
      if (doc.contentHash === hash) {
        return stripInternal(doc);
      }
    }
    return null;
  },

  /**
   * Find all documents with a given content hash.
   */
  async findAllByContentHash(hash: string): Promise<Document[]> {
    if (!hash) return [];
    const state = await readStore();
    return Object.values(state.documents)
      .filter((doc) => doc.contentHash === hash)
      .map(stripInternal);
  },

  /**
   * Find all documents with a given filename+size (used for duplicate detection across
   * content hashes in Phase 5).
   */
  async findAllByFileNameAndSize(fileName: string, fileSize: number): Promise<Document[]> {
    const state = await readStore();
    return Object.values(state.documents)
      .filter((doc) => doc.fileName === fileName && doc.size === fileSize)
      .map(stripInternal);
  },

  /**
   * Mark a document as failed with an error message.
   * This can be called from the API when processing fails.
   */
  async markFailed(id: string, errorMessage: string): Promise<Document | null> {
    return this.update(id, { status: 'error', error: errorMessage });
  },

  /**
   * Conditionally mark a document as failed only if the attempt matches.
   * Returns null if the attempt is stale.
   */
  async markFailedIfAttempt(
    id: string,
    errorMessage: string,
    attemptId: string,
  ): Promise<Document | null> {
    return this.updateIfAttempt(id, { status: 'error', error: errorMessage }, attemptId);
  },

  /**
   * Mark a document as queued (for batch processing or retry queuing).
   */
  async markQueued(id: string): Promise<Document | null> {
    return this.update(id, { status: 'queued' });
  },

  /**
   * Conditionally mark a document as processing (active job).
   * Returns null if the attempt is stale (i.e. a newer retry already started).
   */
  async markProcessingIfAttempt(id: string, attemptId: string): Promise<Document | null> {
    return this.updateIfAttempt(id, { status: 'processing' }, attemptId);
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

  /**
   * Conditionally mark a document as ready only if the attempt matches.
   * Returns null if the attempt is stale.
   */
  async markReadyIfAttempt(
    id: string,
    chunkCount: number,
    pageCount: number,
    attemptId: string,
  ): Promise<Document | null> {
    return this.updateIfAttempt(id, { status: 'ready', chunkCount, pageCount }, attemptId);
  },

  /**
   * Prepare a document for retry: reset status to queued, clear error and stale
   * attempt metadata, assign a new attemptId, and append a status transition.
   *
   * Only documents in the `error` state are eligible. Rejecting `processing`,
   * `queued` and `ready` (under the mutation lock) guarantees that two
   * concurrent retries cannot both claim the same document.
   */
  async prepareForRetry(id: string): Promise<{ attemptId: string; doc: Document } | null> {
    return mutateStore(async (state) => {
      const existing = state.documents[id];
      if (!existing) return null;
      if (existing.status !== 'error') {
        return null;
      }
      const now = new Date();
      const attemptId = randomUUID();
      const history = (existing.statusHistory || []).slice();
      history.push({
        status: 'queued',
        timestamp: now.toISOString(),
        attemptId,
      });
      const updated: DocumentRecord = {
        ...existing,
        status: 'queued',
        error: undefined,
        chunkCount: undefined,
        pageCount: undefined,
        attemptId,
        lastActivityAt: now.toISOString(),
        statusHistory: history,
      };
      state.documents[id] = updated;
      return { attemptId, doc: stripInternal(updated) };
    });
  },

  /**
   * Recover documents whose processing was interrupted (server restart, crash or
   * an attempt that stopped heartbeating).
   *
   * Safety rules:
   *  - Only `processing` / `queued` records are considered.
   *  - A record counts as abandoned only when its last heartbeat/status change is
   *    older than `minAgeMs` (a live attempt heartbeats between batches, so it is
   *    never treated as abandoned merely for being old).
   *  - `dryRun` (default) only reports; it never mutates state.
   *  - Applying assigns a fresh attemptId, so a still-running old attempt can
   *    never mark the document ready/failed afterwards.
   *  - Idempotent: records already in a terminal state are never touched again.
   *
   * This is never invoked automatically on startup — callers must opt in.
   */
  async recoverInterrupted(options?: {
    dryRun?: boolean;
    minAgeMs?: number;
    now?: number;
  }): Promise<RecoveryReport> {
    const dryRun = options?.dryRun ?? true;
    const minAgeMs = options?.minAgeMs ?? 10 * 60 * 1000;

    return mutateStore(async (state) => {
      const now = options?.now ?? Date.now();
      const candidates: RecoveryCandidate[] = [];

      for (const doc of Object.values(state.documents)) {
        if (doc.status !== 'processing' && doc.status !== 'queued') continue;
        const last = lastActivityOf(doc);
        const ageMs = now - last;
        if (ageMs <= minAgeMs) continue;
        candidates.push({
          id: doc.id,
          name: doc.name,
          status: doc.status,
          attemptId: doc.attemptId,
          lastActivityAt: new Date(last).toISOString(),
          ageMs,
        });
      }

      const report: RecoveryReport = {
        mode: dryRun ? 'dry-run' : 'applied',
        minAgeMs,
        scanned: Object.keys(state.documents).length,
        candidates,
        recovered: [],
        remaining: 0,
      };

      if (dryRun || candidates.length === 0) {
        report.remaining = candidates.length;
        return report;
      }

      const recoveredAt = new Date(now).toISOString();
      for (const candidate of candidates) {
        const doc = state.documents[candidate.id];
        if (!doc) continue;
        // Re-check inside the lock: the attempt must not have changed while we
        // were scanning, otherwise it is live/owned elsewhere.
        if (doc.attemptId !== candidate.attemptId) continue;
        if (doc.status !== 'processing' && doc.status !== 'queued') continue;

        const newAttemptId = randomUUID();
        // Only suggest retrying when the original file is still on disk; legacy
        // records from the ChromaDB/path bug have no stored file and must be
        // re-uploaded instead.
        let hasStoredFile = false;
        if (doc.filePath) {
          hasStoredFile = await files().exists(doc.filePath);
        }
        const nextStep = hasStoredFile
          ? 'retry to reprocess.'
          : 'the original file is no longer available, upload it again to reprocess.';
        const message =
          `Processing was interrupted (status "${doc.status}", no activity since ` +
          `${candidate.lastActivityAt}). Recovered automatically; ${nextStep}`;
        const history = (doc.statusHistory || []).slice();
        history.push({
          status: 'error',
          timestamp: recoveredAt,
          attemptId: newAttemptId,
          error: message,
        });
        state.documents[doc.id] = {
          ...doc,
          status: 'error',
          error: message,
          attemptId: newAttemptId,
          lastActivityAt: recoveredAt,
          statusHistory: history,
        };
        report.recovered.push({ ...candidate, attemptId: newAttemptId, status: 'error' });
      }

      report.remaining = 0;
      return report;
    });
  },
};
