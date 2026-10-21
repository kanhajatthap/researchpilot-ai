/**
 * Shared embedding / processing configuration.
 *
 * These constants live in their own module (not in `embedder.ts`) so that code
 * which imports the values — the processor and the upload/retry routes — keeps
 * working even when tests mock the `@/lib/rag/embedder` module.
 *
 * Rationale for provider-side batching:
 *   The Gemini `embedContent` endpoint accepts many `contents` per request and
 *   returns one embedding per input (in order). A large PDF (e.g. 954 chunks)
 *   therefore needs `ceil(chunks / batchSize)` requests instead of one request
 *   per chunk. Measured on a real 954-chunk document, one-request-per-chunk
 *   embedding took ~665-913s, which cannot fit the 5-minute processing budget;
 *   batching 50 per request reduces it to ~20 requests.
 */

/** Embedding model used for document chunks. */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/** Output dimensionality. Must match the ChromaDB collection dimension. */
export const EMBEDDING_DIMENSIONS = 768;

/** Number of chunks sent per embedding provider request. */
export const DEFAULT_EMBEDDING_BATCH_SIZE = 50;

/** Maximum number of embedding requests in flight at once. */
export const DEFAULT_EMBEDDING_CONCURRENCY = 4;

/** Per-request embedding timeout (ms). Also clamped by the overall deadline. */
export const DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS = 60_000;

/** Maximum attempts (including the first) for a retryable embedding request. */
export const DEFAULT_EMBEDDING_MAX_ATTEMPTS = 5;

/**
 * Longest provider-requested retry delay (from `RetryInfo`) we are willing to
 * honor. Longer delays (e.g. a daily quota that resets in hours) fail fast with
 * an actionable message instead of blocking the processing deadline.
 */
export const DEFAULT_EMBEDDING_MAX_RETRY_DELAY_MS = 60_000;

/** Proactive pacing: embedded contents per minute. `0` disables initial pacing. */
export const DEFAULT_EMBEDDING_CONTENTS_PER_MINUTE = 0;

/** Sliding-window size used by the embedding rate limiter. */
export const DEFAULT_EMBEDDING_RATE_LIMIT_WINDOW_MS = 60_000;

/** Default overall per-document processing timeout (ms). 25 minutes to accommodate large PDFs on free-tier rate limits. */
export const DEFAULT_PROCESSING_TIMEOUT_MS = 25 * 60 * 1000;

/**
 * Optional proactive pacing limit, from `EMBEDDINGS_CONTENTS_PER_MINUTE`.
 *
 * Leave unset on paid/high-quota tiers (adaptive pacing still kicks in when the
 * provider reports a limit). Set it on low-quota tiers to avoid the first 429.
 */
export function resolveEmbeddingContentsPerMinute(): number {
  return readPositiveIntEnv(
    'EMBEDDINGS_CONTENTS_PER_MINUTE',
    DEFAULT_EMBEDDING_CONTENTS_PER_MINUTE,
  );
}

/**
 * Overall per-document processing timeout, from `DOCUMENT_PROCESSING_TIMEOUT_MS`.
 *
 * The default is unchanged (5 minutes). Because the provider paces large
 * documents (quota-limited), a longer value may be set deliberately for large
 * PDFs on rate-limited plans.
 */
export function resolveProcessingTimeoutMs(): number {
  return readPositiveIntEnv('DOCUMENT_PROCESSING_TIMEOUT_MS', DEFAULT_PROCESSING_TIMEOUT_MS);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
