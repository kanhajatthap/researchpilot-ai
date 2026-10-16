import { GoogleGenAI } from '@google/genai';
import { getServerEnv } from '@/lib/config';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_CONCURRENCY,
  DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
  DEFAULT_EMBEDDING_MAX_ATTEMPTS,
  DEFAULT_EMBEDDING_MAX_RETRY_DELAY_MS,
  DEFAULT_EMBEDDING_RATE_LIMIT_WINDOW_MS,
} from './embedding-config';

/** Minimal logging surface so tests can capture output without touching console. */
export interface EmbeddingLogSink {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Progress emitted after each embedding batch completes. */
export interface EmbedBatchProgress {
  /** Zero-based index of the batch that just completed. */
  batchIndex: number;
  /** Total number of batches for this call. */
  totalBatches: number;
  /** Number of inputs in the completed batch. */
  batchSize: number;
  /** Number of batches completed so far. */
  completedBatches: number;
  /** Milliseconds elapsed since the whole `embedTexts` call started. */
  durationMs: number;
}

export interface EmbedTextsOptions {
  /** Cancels outstanding and not-yet-started requests. */
  signal?: AbortSignal;
  /** Inputs per provider request. Default 50. */
  batchSize?: number;
  /** Maximum concurrent provider requests. Default 4. */
  concurrency?: number;
  /** Per-request timeout in ms. Default 60000. `0` disables the per-request timer. */
  requestTimeoutMs?: number;
  /** Max attempts (including the first) for retryable failures. Default 5. */
  maxAttempts?: number;
  /**
   * Proactive pacing: embedded contents per minute. `0` (default) disables
   * proactive pacing; adaptive pacing still engages once the provider reports a
   * limit via a 429.
   */
  contentsPerMinute?: number;
  /**
   * Longest provider-requested retry delay (from `RetryInfo`) to honor before
   * failing with an actionable quota message. Default 60000ms.
   */
  maxRetryDelayMs?: number;
  /** Advanced: sliding-window size (ms) used by the rate limiter. Default 60000. */
  rateLimitWindowMs?: number;
  /** Called after each successful batch (e.g. for heartbeats). May be async. */
  onBatchComplete?: (progress: EmbedBatchProgress) => void | Promise<void>;
  /** Log sink. Defaults to `console`. */
  logger?: EmbeddingLogSink;
}

/** Raised when a single embedding request exceeds its per-request timeout. */
export class EmbeddingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingTimeoutError';
  }
}

/**
 * A sanitized, actionable provider failure. `message` is safe to persist and to
 * show to users: it never contains raw provider JSON, request URLs or API keys.
 */
export class EmbeddingProviderError extends Error {
  /** Sanitized code, e.g. "429", "503", "network", "timeout", "quota_exceeded". */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EmbeddingProviderError';
    this.code = code;
  }
}

const defaultLogger: EmbeddingLogSink = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;

/**
 * Sliding-window limiter that caps how many embedded contents are sent per
 * window, so we stay under the provider's documented requests-per-minute quota
 * instead of triggering 429s. `acquire` is safe to call concurrently because the
 * check-and-reserve step runs synchronously (no `await` in between).
 */
export class ProviderRateLimiter {
  private timestamps: number[] = [];
  private limit: number;

  constructor(limit: number, private readonly windowMs: number) {
    this.limit = limit > 0 ? Math.floor(limit) : 0;
  }

  get enabled(): boolean {
    return this.limit > 0;
  }

  get currentLimit(): number {
    return this.limit;
  }

  /** Enable or raise the limit (used when the provider reports its quota). */
  setLimit(limit: number): void {
    if (limit > 0) this.limit = Math.floor(limit);
  }

  async acquire(count: number, signal?: AbortSignal): Promise<void> {
    if (!this.enabled || count <= 0) return;

    for (;;) {
      if (signal?.aborted) throw makeAbortError('Rate-limit wait aborted.');
      const now = Date.now();
      this.prune(now);

      if (this.timestamps.length + count <= this.limit) {
        this.reserve(count, now);
        return;
      }
      if (this.timestamps.length === 0) {
        // A single batch larger than the whole window: allow it rather than
        // deadlocking, and let the next window drain normally.
        this.reserve(count, now);
        return;
      }

      const waitMs = Math.max(1, this.timestamps[0] + this.windowMs - now);
      await abortableDelay(waitMs, signal);
    }
  }

  private reserve(count: number, now: number): void {
    for (let i = 0; i < count; i += 1) this.timestamps.push(now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let drop = 0;
    while (drop < this.timestamps.length && this.timestamps[drop] <= cutoff) drop += 1;
    if (drop > 0) this.timestamps.splice(0, drop);
  }
}

export class Embedder {
  private client: GoogleGenAI;
  /** Retained only to redact it from provider error messages. Never logged. */
  private readonly apiKey: string;

  constructor() {
    const { geminiApiKey } = getServerEnv();
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');
    this.apiKey = geminiApiKey;
    this.client = new GoogleGenAI({ apiKey: geminiApiKey });
  }

  /** Embed a single string. */
  async embedText(text: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([text]);
    return embedding;
  }

  /**
   * Backwards-compatible alias that embeds a set of strings with the default
   * batching/concurrency policy.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.embedTexts(texts);
  }

  /**
   * Embed many strings using provider-side batching with bounded concurrency.
   *
   * Guarantees:
   *   - Results are returned in the same order as the input `texts`.
   *   - At most `batchSize` inputs per provider request and at most
   *     `concurrency` requests in flight.
   *   - Every embedding is validated (count, dimensionality, finite values)
   *     before it is returned.
   *   - Rate limits are handled gracefully: provider `RetryInfo` delays are
   *     honored (up to `maxRetryDelayMs`) and a learned per-minute quota enables
   *     pacing so later batches stay under the limit. Daily quotas fail fast
   *     with an actionable message instead of blocking until the deadline.
   *   - An aborted `signal` (or the first error) cancels every in-flight request
   *     and stops workers from starting new batches — no background processing
   *     continues after a failure or timeout.
   *   - All timers and abort listeners are removed on every completion path.
   */
  async embedTexts(texts: string[], options: EmbedTextsOptions = {}): Promise<number[][]> {
    const {
      signal,
      batchSize = DEFAULT_EMBEDDING_BATCH_SIZE,
      concurrency = DEFAULT_EMBEDDING_CONCURRENCY,
      requestTimeoutMs = DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
      maxAttempts = DEFAULT_EMBEDDING_MAX_ATTEMPTS,
      contentsPerMinute = 0,
      maxRetryDelayMs = DEFAULT_EMBEDDING_MAX_RETRY_DELAY_MS,
      rateLimitWindowMs = DEFAULT_EMBEDDING_RATE_LIMIT_WINDOW_MS,
      onBatchComplete,
      logger = defaultLogger,
    } = options;

    if (texts.length === 0) return [];
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error(`embedTexts: batchSize must be a positive integer (received ${batchSize}).`);
    }
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(
        `embedTexts: concurrency must be a positive integer (received ${concurrency}).`,
      );
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error(`embedTexts: maxAttempts must be a positive integer (received ${maxAttempts}).`);
    }
    if (contentsPerMinute < 0) {
      throw new Error(`embedTexts: contentsPerMinute must be >= 0 (received ${contentsPerMinute}).`);
    }
    if (maxRetryDelayMs < 0) {
      throw new Error(`embedTexts: maxRetryDelayMs must be >= 0 (received ${maxRetryDelayMs}).`);
    }

    const totalBatches = Math.ceil(texts.length / batchSize);
    const results: number[][] = new Array(texts.length);
    const controller = new AbortController();
    const limiter = new ProviderRateLimiter(contentsPerMinute, rateLimitWindowMs);

    // Link the caller's signal so external cancellation reaches every request.
    const unlinkSignal = (() => {
      if (!signal) return () => {};
      if (signal.aborted) {
        controller.abort();
        return () => {};
      }
      const onAbort = (): void => controller.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      return () => signal.removeEventListener('abort', onAbort);
    })();

    const startedAt = Date.now();
    const workerCount = Math.min(concurrency, totalBatches);
    logger.info(
      `[embed] start chunks=${texts.length} batches=${totalBatches} batchSize=${batchSize} ` +
        `concurrency=${workerCount} requestTimeoutMs=${requestTimeoutMs}`,
    );
    if (limiter.enabled) {
      logger.info(`[embed] proactive pacing at ${contentsPerMinute}/min`);
    }

    let nextBatch = 0;
    let completedBatches = 0;
    let firstError: unknown = null;

    const runWorker = async (): Promise<void> => {
      for (;;) {
        if (firstError !== null || controller.signal.aborted) return;
        const batchIndex = nextBatch;
        nextBatch += 1;
        if (batchIndex >= totalBatches) return;

        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, texts.length);
        const batchTexts = texts.slice(start, end);

        try {
          const embeddings = await this.embedOneBatchWithRetry(batchTexts, {
            batchIndex,
            totalBatches,
            controller,
            requestTimeoutMs,
            maxAttempts,
            maxRetryDelayMs,
            limiter,
            logger,
          });

          // Preserve original order by writing to absolute offsets.
          for (let i = 0; i < embeddings.length; i += 1) {
            results[start + i] = embeddings[i];
          }

          completedBatches += 1;
          if (onBatchComplete) {
            await onBatchComplete({
              batchIndex,
              totalBatches,
              batchSize: batchTexts.length,
              completedBatches,
              durationMs: Date.now() - startedAt,
            });
          }
        } catch (error) {
          if (firstError === null) firstError = error;
          // Cancel sibling workers and any in-flight request immediately.
          controller.abort();
          return;
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    } finally {
      unlinkSignal();
    }

    if (firstError !== null) throw firstError;

    // `Array.prototype.some` skips holes, so check explicitly.
    for (let i = 0; i < texts.length; i += 1) {
      if (!Array.isArray(results[i])) {
        throw new Error(
          `Embedding pipeline returned an incomplete result set (missing embedding ${i} of ${texts.length}).`,
        );
      }
    }

    logger.info(
      `[embed] done chunks=${texts.length} batches=${totalBatches} ` +
        `durationMs=${Date.now() - startedAt} status=ok`,
    );
    return results;
  }

  /**
   * Send one batch, with pacing and retries. Retries are performed here (and
   * logged) instead of relying on the SDK's silent retries, so transient
   * failures and provider rate limits are observable.
   */
  private async embedOneBatchWithRetry(
    texts: string[],
    ctx: {
      batchIndex: number;
      totalBatches: number;
      controller: AbortController;
      requestTimeoutMs: number;
      maxAttempts: number;
      maxRetryDelayMs: number;
      limiter: ProviderRateLimiter;
      logger: EmbeddingLogSink;
    },
  ): Promise<number[][]> {
    const {
      batchIndex,
      totalBatches,
      controller,
      requestTimeoutMs,
      maxAttempts,
      maxRetryDelayMs,
      limiter,
      logger,
    } = ctx;
    let attempt = 0;

    for (;;) {
      if (controller.signal.aborted) {
        throw makeAbortError('Embedding aborted before a request could be sent.');
      }
      attempt += 1;

      // Proactive pacing: reserve quota before sending.
      await limiter.acquire(texts.length, controller.signal);

      const attemptStartedAt = Date.now();
      try {
        const embeddings = await this.embedOneBatch(texts, controller, requestTimeoutMs);
        logger.info(
          `[embed] batch=${batchIndex + 1}/${totalBatches} size=${texts.length} attempt=${attempt} ` +
            `durationMs=${Date.now() - attemptStartedAt} status=ok`,
        );
        return embeddings;
      } catch (error) {
        const quota = parseQuotaInfo(error);
        const aborted = controller.signal.aborted;

        // A per-request timeout is a hard failure: fail fast rather than burn
        // more of the deadline retrying a pathologically slow request.
        if (error instanceof EmbeddingTimeoutError) {
          logger.warn(
            `[embed] batch=${batchIndex + 1}/${totalBatches} size=${texts.length} attempt=${attempt} ` +
              `durationMs=${Date.now() - attemptStartedAt} status=error code=timeout retryable=false ` +
              `message=${error.message}`,
          );
          throw error;
        }

        const classified = classifyProviderError(error, this.apiKey);

        // Learn the provider's per-minute allowance so later batches are paced.
        if (quota.perMinuteQuota !== null && quota.perMinuteQuota > 0) {
          const target = Math.max(1, Math.floor(quota.perMinuteQuota * 0.9));
          if (target !== limiter.currentLimit) {
            limiter.setLimit(target);
            logger.info(
              `[embed] learned provider rate limit ${quota.perMinuteQuota}/min; pacing at ${target}/min`,
            );
          }
        }

        logger.warn(
          `[embed] batch=${batchIndex + 1}/${totalBatches} size=${texts.length} attempt=${attempt} ` +
            `durationMs=${Date.now() - attemptStartedAt} status=error code=${classified.code} ` +
            `retryable=${classified.retryable} aborted=${aborted} message=${classified.message}`,
        );

        if (aborted) throw error;
        if (!classified.retryable || attempt >= maxAttempts) {
          if (!classified.provider) throw error;
          throw this.toProviderError(classified);
        }

        // Daily quotas reset far beyond the processing deadline — fail fast
        // with a clear message instead of blocking.
        if (quota.perDayQuota !== null) {
          throw this.toQuotaExhaustedError(quota, 'daily');
        }
        if (quota.retryDelayMs !== null && quota.retryDelayMs > maxRetryDelayMs) {
          throw this.toQuotaExhaustedError(quota, 'rate limit');
        }

        const backoffMs =
          quota.retryDelayMs !== null
            ? Math.max(1, quota.retryDelayMs)
            : Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));

        logger.info(
          `[embed] batch=${batchIndex + 1}/${totalBatches} retrying in ${backoffMs}ms ` +
            `(attempt ${attempt + 1}/${maxAttempts})`,
        );
        await abortableDelay(backoffMs, controller.signal);
      }
    }
  }

  /**
   * Perform a single `embedContent` call for one batch, wiring cancellation and
   * a per-request timeout into the SDK request.
   */
  private async embedOneBatch(
    texts: string[],
    sharedController: AbortController,
    requestTimeoutMs: number,
  ): Promise<number[][]> {
    const controller = new AbortController();
    const onSharedAbort = (): void => controller.abort();
    if (sharedController.signal.aborted) {
      controller.abort();
    } else {
      sharedController.signal.addEventListener('abort', onSharedAbort, { once: true });
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    if (requestTimeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);
    }

    try {
      const response = await this.client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts.map((text) => ({ role: 'user', parts: [{ text }] })),
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          abortSignal: controller.signal,
          httpOptions: {
            timeout: requestTimeoutMs > 0 ? requestTimeoutMs : undefined,
            // Disable the SDK's silent retries (attempts <= 1 means no retries);
            // retries are handled explicitly and observably in embedOneBatchWithRetry.
            retryOptions: { attempts: 1 },
          },
        },
      });

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(
          `Embedding provider returned ${embeddings.length} embeddings for ${texts.length} inputs.`,
        );
      }
      return embeddings.map((embedding, index) => validateEmbedding(embedding?.values, index));
    } catch (error) {
      if (timedOut) {
        throw new EmbeddingTimeoutError(
          `Embedding request timed out after ${requestTimeoutMs}ms.`,
        );
      }
      if (controller.signal.aborted) {
        throw makeAbortError('Embedding request aborted.');
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
      sharedController.signal.removeEventListener('abort', onSharedAbort);
    }
  }

  /** Build a concise, sanitized provider error from a classified failure. */
  private toProviderError(classified: ClassifiedProviderError): Error {
    switch (classified.code) {
      case '429':
        return new EmbeddingProviderError(
          '429',
          'Embedding provider rate limit exceeded (HTTP 429). The document can be retried shortly.',
        );
      case 'timeout':
        return new EmbeddingProviderError('timeout', classified.message);
      case 'network':
        return new EmbeddingProviderError(
          'network',
          `Embedding provider network error: ${classified.message}`,
        );
      default:
        if (/^\d{3}$/.test(classified.code)) {
          return new EmbeddingProviderError(
            classified.code,
            `Embedding provider error (HTTP ${classified.code}): ${classified.message}`,
          );
        }
        return new EmbeddingProviderError(classified.code, classified.message);
    }
  }

  /** Build an actionable message for exhausted quota / over-long retry delays. */
  private toQuotaExhaustedError(
    quota: ProviderQuotaInfo,
    kind: 'daily' | 'rate limit',
  ): Error {
    const reset =
      quota.retryDelayMs !== null ? ` Resets in ~${formatDuration(quota.retryDelayMs)}.` : '';
    return new EmbeddingProviderError(
      kind === 'daily' ? 'quota_exceeded_daily' : 'quota_exceeded',
      `Embedding provider ${kind} quota exceeded (HTTP 429).${reset} ` +
        'The document can be retried after the quota resets.',
    );
  }
}

/** Validate a single embedding's shape before it is trusted. */
function validateEmbedding(values: unknown, index: number): number[] {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    const received = Array.isArray(values) ? String(values.length) : 'a non-array value';
    throw new Error(
      `Embedding ${index} has invalid dimensionality (expected ${EMBEDDING_DIMENSIONS}, received ${received}).`,
    );
  }
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Embedding ${index} contains a non-finite value.`);
    }
  }
  return values as number[];
}

interface ClassifiedProviderError {
  /** Sanitized code, e.g. "429", "500", "timeout", "aborted", "network", "unknown". */
  code: string;
  retryable: boolean;
  /** True when the failure came from the provider (not a local validation error). */
  provider: boolean;
  /** Sanitized, length-bounded message safe to log. */
  message: string;
}

/** Classify a provider error into a sanitized log code and retryability. */
function classifyProviderError(error: unknown, apiKey: string): ClassifiedProviderError {
  if (isAbortError(error)) {
    return { code: 'aborted', retryable: false, provider: true, message: 'request aborted' };
  }
  if (error instanceof EmbeddingTimeoutError) {
    return {
      code: 'timeout',
      retryable: false,
      provider: true,
      message: sanitizeMessage(error.message, apiKey),
    };
  }
  if (error instanceof EmbeddingProviderError) {
    return {
      code: error.code,
      retryable: false,
      provider: true,
      message: sanitizeMessage(error.message, apiKey),
    };
  }

  const status = extractStatusCode(error);
  const message = sanitizeMessage(error instanceof Error ? error.message : String(error), apiKey);
  const transient = isTransientMessage(message);
  const retryable =
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (status <= 0 && transient);
  const code = status > 0 ? String(status) : transient ? 'network' : 'unknown';

  return { code, retryable, provider: status > 0 || transient, message };
}

function isTransientMessage(message: string): boolean {
  return /timeout|timed out|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(
    message,
  );
}

interface ProviderQuotaInfo {
  /** Delay requested by `RetryInfo.retryDelay`, in ms. */
  retryDelayMs: number | null;
  /** Per-minute allowance reported by `QuotaFailure` (contents/minute). */
  perMinuteQuota: number | null;
  /** Per-day allowance reported by `QuotaFailure` (contents/day). */
  perDayQuota: number | null;
  /** The violated quota metric, if any. */
  metric: string | null;
}

/**
 * Parse `google.rpc.RetryInfo` and `google.rpc.QuotaFailure` details out of a
 * provider error. The SDK's `ApiError` only exposes `status`/`message`, and the
 * message is the raw JSON body, so details are read from there as a fallback.
 */
function parseQuotaInfo(error: unknown): ProviderQuotaInfo {
  const info: ProviderQuotaInfo = {
    retryDelayMs: null,
    perMinuteQuota: null,
    perDayQuota: null,
    metric: null,
  };

  for (const detail of extractErrorDetails(error)) {
    const type = typeof detail['@type'] === 'string' ? (detail['@type'] as string) : '';

    if (type.endsWith('google.rpc.RetryInfo')) {
      const delay = detail.retryDelay;
      if (typeof delay === 'string') {
        const ms = parseDurationMs(delay);
        if (ms !== null) info.retryDelayMs = ms;
      }
      continue;
    }

    if (type.endsWith('google.rpc.QuotaFailure') && Array.isArray(detail.violations)) {
      for (const violation of detail.violations) {
        if (typeof violation !== 'object' || violation === null) continue;
        const record = violation as Record<string, unknown>;
        const metric = typeof record.quotaMetric === 'string' ? record.quotaMetric : null;
        const quotaId = typeof record.quotaId === 'string' ? record.quotaId : null;
        const value = record.quotaValue;
        const numeric =
          typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
        // The per-minute/per-day distinction is carried by `quotaId`
        // (e.g. `...PerMinutePerUser...`), so consider both fields.
        const label = [metric, quotaId].filter(Boolean).join(' ');
        if (!label || !Number.isFinite(numeric) || numeric <= 0) continue;

        info.metric = label;
        if (/PerMinute/i.test(label)) info.perMinuteQuota = numeric;
        if (/PerDay/i.test(label)) info.perDayQuota = numeric;
      }
    }
  }

  return info;
}

function extractErrorDetails(error: unknown): Array<Record<string, unknown>> {
  if (typeof error !== 'object' || error === null) return [];

  const direct = (error as { details?: unknown }).details;
  if (Array.isArray(direct)) {
    return direct.filter(
      (detail): detail is Record<string, unknown> =>
        typeof detail === 'object' && detail !== null,
    );
  }

  const message = error instanceof Error ? error.message : '';
  const parsed = tryParseJsonObject(message);
  if (parsed) {
    const errorObject = (parsed as { error?: unknown }).error;
    const details =
      typeof errorObject === 'object' && errorObject !== null
        ? (errorObject as { details?: unknown }).details
        : (parsed as { details?: unknown }).details;
    if (Array.isArray(details)) {
      return details.filter(
        (detail): detail is Record<string, unknown> =>
          typeof detail === 'object' && detail !== null,
      );
    }
  }
  return [];
}

/** Parse a protobuf `Duration` string such as "26.314s" or "1s" into ms. */
function parseDurationMs(value: string): number | null {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function formatDuration(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

function tryParseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Extract an HTTP-ish status code from a provider error, or -1 if unknown. */
function extractStatusCode(error: unknown): number {
  if (typeof error !== 'object' || error === null) return -1;
  const record = error as Record<string, unknown>;
  for (const candidate of [record.status, record.statusCode, record.code]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && /^\d{3}$/.test(candidate)) return Number(candidate);
  }
  return -1;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
  );
}

function makeAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Redact anything that could carry a secret. Messages are the only place a
 * provider key could leak (e.g. `...?key=AIza...`); document text is never
 * included in these messages.
 */
function sanitizeMessage(message: string, apiKey: string): string {
  let sanitized = message;
  if (apiKey) sanitized = sanitized.split(apiKey).join('[redacted]');
  sanitized = sanitized.replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
  sanitized = sanitized.replace(/key=[^\s&"']+/gi, 'key=[redacted]');
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]');
  return sanitized.slice(0, 300);
}

/** Abortable sleep used for retry backoff and rate-limit pacing. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError('Delay aborted.'));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = (): void => {
      if (timer !== null) clearTimeout(timer);
      reject(makeAbortError('Delay aborted.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}
