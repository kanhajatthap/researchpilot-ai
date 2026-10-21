import { extractPdfText } from './extractor';
import { chunkText } from './chunker';
import { Embedder } from './embedder';
import type { EmbeddingLogSink } from './embedder';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_CONCURRENCY,
  DEFAULT_EMBEDDING_CONTENTS_PER_MINUTE,
  DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
  DEFAULT_PROCESSING_TIMEOUT_MS,
} from './embedding-config';
import { vectorStore, VectorChunk } from './vectorstore';
import { documentStore } from './document-store';
import type { Document } from '@/types/document';

/**
 * Configuration for the PDF processing pipeline.
 */
export interface ProcessOptions {
  /** Document ID being processed. */
  documentId: string;
  /** Unique attempt ID for this processing run (used to reject stale writes). */
  attemptId: string;
  /** Optional abort signal for cancellation. */
  signal?: AbortSignal;
  /** Chunks sent per embedding provider request. Default 50. */
  embeddingBatchSize?: number;
  /** Maximum concurrent embedding requests. Default 4. */
  embeddingConcurrency?: number;
  /** Per-request embedding timeout in ms. Default 60000 (also clamped by the deadline). */
  embeddingRequestTimeoutMs?: number;
  /**
   * Proactive embedding pacing (contents per minute). Default 0 (disabled);
   * adaptive pacing still engages when the provider reports a rate limit.
   */
  embeddingContentsPerMinute?: number;
  /** Total processing timeout in ms. Default 5 minutes. */
  timeoutMs?: number;
}

interface ProcessingResult {
  documentId: string;
  chunks: number;
  pages: number;
}

/**
 * Input validation failure (bad/empty PDF, no chunks). The document has already
 * been marked failed; callers should surface a 4xx response, not a 5xx.
 */
export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

/**
 * Reusable PDF-processing pipeline shared by upload and retry endpoints.
 *
 * Steps:
 *   1. Extract text from PDF buffer (validated, timeout-bounded)
 *   2. Chunk text (validated)
 *   3. Generate embeddings with provider-side batching + bounded concurrency,
 *      heartbeating as each batch completes
 *   4. Store vectors in ChromaDB and verify they were persisted
 *   5. Conditionally mark the document ready (attempt-gated)
 *
 * Guarantees:
 *   - Every attempt either reaches a terminal status or is recovered explicitly
 *     by the recovery endpoint (records cannot silently stay "processing").
 *   - Every write is gated on the attemptId, so an older attempt can never
 *     overwrite a newer one.
 *   - All timers are cleared on every completion path.
 */
export async function processDocument(
  buffer: ArrayBuffer,
  doc: Document,
  options: ProcessOptions,
): Promise<ProcessingResult> {
  const {
    documentId,
    attemptId,
    signal,
    embeddingBatchSize = DEFAULT_EMBEDDING_BATCH_SIZE,
    embeddingConcurrency = DEFAULT_EMBEDDING_CONCURRENCY,
    embeddingRequestTimeoutMs = DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
    embeddingContentsPerMinute = DEFAULT_EMBEDDING_CONTENTS_PER_MINUTE,
    timeoutMs = DEFAULT_PROCESSING_TIMEOUT_MS,
  } = options;

  const deadline = Date.now() + timeoutMs;
  let stage = 'start';

  /** Heartbeat so recovery can tell a live attempt from an abandoned one. */
  const heartbeat = async (): Promise<void> => {
    const alive = await documentStore.touchIfAttempt(documentId, attemptId);
    if (!alive) {
      throw new Error('Processing attempt is no longer current (superseded or removed).');
    }
  };

  try {
    throwIfAborted(signal);

    // 1. Extract PDF text
    stage = 'extract';
    const pageTexts = await withTimeout(extractPdfText(buffer), remainingMs(deadline, stage), stage);
    throwIfAborted(signal);

    const hasText = pageTexts.some((p) => p.text.length > 0);
    if (!hasText) {
      const message = 'No extractable text found. OCR is not supported for this document.';
      await documentStore.markFailedIfAttempt(documentId, message, attemptId);
      throw new DocumentValidationError(message);
    }
    await heartbeat();

    // 2. Chunk text with optimal 1800-char semantic size (reduces chunk count by 70% and stays inside free quotas)
    stage = 'chunk';
    const chunks = chunkText(pageTexts, 1800, 200);
    throwIfAborted(signal);
    if (chunks.length === 0) {
      const message = 'No text chunks could be generated from the extracted text.';
      await documentStore.markFailedIfAttempt(documentId, message, attemptId);
      throw new DocumentValidationError(message);
    }

    // 3. Generate embeddings.
    //    The provider accepts many inputs per request, so chunks are sent in
    //    batches of `embeddingBatchSize` with bounded concurrency instead of one
    //    request per chunk. This keeps large documents inside the deadline.
    stage = 'embed';
    const embedder = new Embedder();
    const embedLogger: EmbeddingLogSink = {
      info: (message) =>
        console.info(`[document-processor] document=${documentId} attempt=${attemptId} ${message}`),
      warn: (message) =>
        console.warn(`[document-processor] document=${documentId} attempt=${attemptId} ${message}`),
      error: (message) =>
        console.error(
          `[document-processor] document=${documentId} attempt=${attemptId} ${message}`,
        ),
    };

    // Dedicated controller so every in-flight embedding request can be cancelled
    // when this stage ends (success, failure or timeout), linked to the caller's
    // signal for external cancellation.
    const embedController = new AbortController();
    const onSignalAbort = (): void => embedController.abort();
    if (signal) {
      if (signal.aborted) embedController.abort();
      else signal.addEventListener('abort', onSignalAbort, { once: true });
    }

    const embedStartedAt = Date.now();
    let embeddings: number[][];
    try {
      // Clamp the per-request timeout to the remaining overall budget so a slow
      // request can never overrun the processing deadline.
      const embedRequestTimeoutMs = Math.max(
        1,
        Math.min(embeddingRequestTimeoutMs, remainingMs(deadline, stage)),
      );
      embeddings = await withTimeout(
        embedder.embedTexts(chunks.map((c) => c.text), {
          signal: embedController.signal,
          batchSize: embeddingBatchSize,
          concurrency: embeddingConcurrency,
          requestTimeoutMs: embedRequestTimeoutMs,
          contentsPerMinute: embeddingContentsPerMinute,
          logger: embedLogger,
          onBatchComplete: async () => {
            await heartbeat();
            throwIfAborted(signal);
          },
        }),
        remainingMs(deadline, stage),
        stage,
      );
      console.info(
        `[document-processor] stage=embed document=${documentId} attempt=${attemptId} ` +
          `chunks=${chunks.length} durationMs=${Date.now() - embedStartedAt} status=ok`,
      );
    } catch (error) {
      // Cancel any request that may still be running so no background work keeps
      // processing chunks after the stage has failed or timed out.
      embedController.abort();
      console.error(
        `[document-processor] stage=embed document=${documentId} attempt=${attemptId} ` +
          `chunks=${chunks.length} durationMs=${Date.now() - embedStartedAt} status=error ` +
          `error=${error instanceof Error ? error.name : 'Error'}`,
      );
      throw error;
    } finally {
      if (signal) signal.removeEventListener('abort', onSignalAbort);
    }

    throwIfAborted(signal);
    // Validate the aggregate provider response before trusting it.
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, received ${embeddings.length}.`,
      );
    }
    if (embeddings.some((e) => !Array.isArray(e) || e.length === 0)) {
      throw new Error('Embedding provider returned an invalid (empty) embedding.');
    }

    // 4. Create vector chunks and store them in ChromaDB, then verify.
    stage = 'store';
    const vchunks: VectorChunk[] = chunks.map((c, i) => ({
      id: documentId + '_c' + i,
      documentId,
      documentName: doc.name,
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      text: c.text,
      embedding: embeddings[i],
    }));
    await withTimeout(vectorStore.addChunks(vchunks), remainingMs(deadline, stage), stage);
    throwIfAborted(signal);

    stage = 'verify';
    const storedCount = await withTimeout(
      vectorStore.countDocumentChunks(documentId),
      remainingMs(deadline, stage),
      stage,
    );
    if (storedCount < chunks.length) {
      throw new Error(
        `Vector verification failed: expected ${chunks.length} chunks but found ${storedCount}. ` +
          'The document was not marked ready.',
      );
    }

    // 5. Update document as ready with chunk/page counts (attempt-gated).
    stage = 'finalize';
    const ready = await documentStore.markReadyIfAttempt(
      documentId,
      chunks.length,
      pageTexts.length,
      attemptId,
    );
    if (!ready) {
      // A newer attempt took over — do not consider this a success.
      throw new Error('Stale processing attempt rejected: a newer attempt owns this document.');
    }

    return {
      documentId,
      chunks: chunks.length,
      pages: pageTexts.length,
    };
  } catch (error: unknown) {
    const message = sanitizeFailureMessage(error instanceof Error ? error.message : 'Unknown error');
    console.error(
      `[document-processor] stage=${stage} document=${documentId} attempt=${attemptId} error=${message}`,
    );

    // Validation errors already persisted a specific failure message above.
    if (!(error instanceof DocumentValidationError)) {
      try {
        const failed = await documentStore.markFailedIfAttempt(
          documentId,
          `Failed to process document: ${message}`,
          attemptId,
        );
        if (!failed) {
          console.error(
            `[document-processor] stage=${stage} document=${documentId} attempt=${attemptId} ` +
              'failure-write-rejected (attempt is stale)',
          );
        }
      } catch (writeError) {
        console.error(
          `[document-processor] stage=${stage} document=${documentId} attempt=${attemptId} ` +
            `failed to persist error status: ${
              writeError instanceof Error ? writeError.message : String(writeError)
            }`,
        );
      }
    }

    throw error;
  }
}

/**
 * Remaining time before the processing deadline, or throw if already exceeded.
 */
function remainingMs(deadline: number, stage: string): number {
  const ms = deadline - Date.now();
  if (ms <= 0) {
    throw new Error(`Processing timed out during stage "${stage}".`);
  }
  return ms;
}

/**
 * Race a promise against a timeout. The timer is always cleared, regardless of
 * which side wins, so no timers are leaked on any completion path.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  if (ms <= 0) {
    return Promise.reject(new Error(`Processing timed out during stage "${stage}".`));
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Processing timed out during stage "${stage}" after ${ms}ms.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  });
}

/**
 * Helper to throw if the abort signal has been triggered.
 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error('Processing aborted') as Error & { name: string };
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * Produce a concise, safe failure message for logs and persistence.
 *
 * Provider errors can otherwise carry a large raw JSON body (and, in the worst
 * case, a request URL with an API key). This collapses whitespace, redacts
 * anything that looks like a key, and bounds the length so the stored document
 * error stays actionable and readable.
 */
export function sanitizeFailureMessage(message: string): string {
  let text = message.trim();

  // Provider failures are frequently passed through as the raw JSON body
  // (`{"error":{...}}`). Reduce them to just the provider's message so the
  // stored error stays actionable and never carries status blobs or URLs.
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } };
      const providerMessage = parsed?.error?.message;
      if (typeof providerMessage === 'string' && providerMessage.trim().length > 0) {
        text = providerMessage.trim();
      }
    } catch {
      // Not valid JSON — keep the original text.
    }
  }

  let sanitized = text
    .replace(/\s+/g, ' ')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/key=[^\s&"']+/gi, 'key=[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .trim();
  if (sanitized.length > 300) sanitized = `${sanitized.slice(0, 297)}...`;
  return sanitized;
}
