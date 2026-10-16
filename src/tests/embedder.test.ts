// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regression tests for the embedding pipeline.
 *
 * These cover the production incident where a 954-chunk PDF timed out in the
 * "embed" stage because one provider request was issued per chunk with an
 * artificial 50ms/1s delay. The SDK is mocked so batching, concurrency,
 * cancellation, retries, validation and log sanitization can be asserted
 * deterministically without touching the network.
 */

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: mocks.embedContent };
  },
}));

vi.mock('@/lib/config', () => ({
  getServerEnv: () => ({ geminiApiKey: 'test-api-key-SECRET', geminiModel: 'test-model' }),
}));

import { Embedder, EmbeddingTimeoutError, EmbeddingProviderError, ProviderRateLimiter } from '@/lib/rag/embedder';
import { EMBEDDING_DIMENSIONS } from '@/lib/rag/embedding-config';

interface EmbedCallArg {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  config: {
    outputDimensionality: number;
    abortSignal?: AbortSignal;
    httpOptions?: { timeout?: number; retryOptions?: { attempts?: number } };
  };
}

/** A valid 768-dim vector whose first element encodes the input index. */
function vec(marker: number): number[] {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  values[0] = marker;
  return values;
}

function markersFromContents(contents: EmbedCallArg['contents']): number[] {
  return contents.map((c) => Number(c.parts[0].text.replace('chunk-', '')));
}

function makeTexts(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `chunk-${i}`);
}

let logs: string[];
let logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };

beforeEach(() => {
  vi.resetAllMocks();
  logs = [];
  logger = {
    info: (m) => logs.push(m),
    warn: (m) => logs.push(m),
    error: (m) => logs.push(m),
  };
  mocks.embedContent.mockImplementation(async ({ contents }: EmbedCallArg) => ({
    embeddings: markersFromContents(contents).map((marker) => ({ values: vec(marker) })),
  }));
});

describe('Embedder.embedTexts — provider-side batching', () => {
  it('sends inputs in provider-side batches and preserves original order', async () => {
    const result = await new Embedder().embedTexts(makeTexts(120), {
      batchSize: 50,
      concurrency: 2,
      requestTimeoutMs: 1000,
      logger,
    });

    expect(mocks.embedContent).toHaveBeenCalledTimes(3);
    const sizes = mocks.embedContent.mock.calls.map(
      (call) => (call[0] as EmbedCallArg).contents.length,
    );
    expect(sizes).toEqual([50, 50, 20]);

    expect(result).toHaveLength(120);
    expect(result.map((embedding) => embedding[0])).toEqual(makeTexts(120).map((_, i) => i));
  });

  it('reduces 954 chunks to 20 provider requests at batch size 50', async () => {
    const result = await new Embedder().embedTexts(makeTexts(954), {
      batchSize: 50,
      concurrency: 4,
      requestTimeoutMs: 1000,
      logger,
    });

    expect(mocks.embedContent).toHaveBeenCalledTimes(20);
    expect(result).toHaveLength(954);
  });

  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mocks.embedContent.mockImplementation(async ({ contents }: EmbedCallArg) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return { embeddings: contents.map((c) => ({ values: vec(Number(c.parts[0].text.split('-')[1])) })) };
    });

    await new Embedder().embedTexts(makeTexts(200), {
      batchSize: 50,
      concurrency: 3,
      requestTimeoutMs: 1000,
      logger,
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('returns an empty array for empty input without calling the provider', async () => {
    const result = await new Embedder().embedTexts([], { logger });
    expect(result).toEqual([]);
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('reports per-batch progress', async () => {
    const completed: number[] = [];
    await new Embedder().embedTexts(makeTexts(120), {
      batchSize: 50,
      concurrency: 2,
      requestTimeoutMs: 1000,
      logger,
      onBatchComplete: (progress) => {
        completed.push(progress.completedBatches);
      },
    });
    expect(completed.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('rejects invalid batchSize / concurrency', async () => {
    await expect(new Embedder().embedTexts(['chunk-0'], { batchSize: 0 })).rejects.toThrow(
      /batchSize/,
    );
    await expect(new Embedder().embedTexts(['chunk-0'], { concurrency: 0 })).rejects.toThrow(
      /concurrency/,
    );
  });
});

describe('Embedder.embedTexts — cancellation and timeouts', () => {
  it('aborts in-flight requests and stops launching new batches on abort', async () => {
    const started: number[] = [];
    mocks.embedContent.mockImplementation(({ contents, config }: EmbedCallArg) => {
      started.push(Number(contents[0].parts[0].text.split('-')[1]));
      return new Promise((_resolve, reject) => {
        const signal = config.abortSignal;
        const onAbort = () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    });

    const controller = new AbortController();
    const promise = new Embedder().embedTexts(makeTexts(1000), {
      batchSize: 50,
      concurrency: 2,
      requestTimeoutMs: 0,
      logger,
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    const startedAtAbort = started.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    // No new batches are launched after the abort, and only the concurrency
    // window was ever started.
    expect(started.length).toBe(startedAtAbort);
    expect(startedAtAbort).toBeLessThanOrEqual(2);
  });

  it('fails with an EmbeddingTimeoutError when a request exceeds its timeout', async () => {
    mocks.embedContent.mockImplementation(({ config }: EmbedCallArg) => {
      return new Promise((_resolve, reject) => {
        const signal = config.abortSignal;
        const onAbort = () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    });

    await expect(
      new Embedder().embedTexts(['chunk-0'], { requestTimeoutMs: 30, maxAttempts: 1, logger }),
    ).rejects.toBeInstanceOf(EmbeddingTimeoutError);
  });

  it('disables silent SDK retries and forwards the request timeout', async () => {
    await new Embedder().embedTexts(['chunk-0'], { requestTimeoutMs: 1234, logger });

    const arg = mocks.embedContent.mock.calls[0][0] as EmbedCallArg;
    expect(arg.config.httpOptions?.retryOptions).toEqual({ attempts: 1 });
    expect(arg.config.httpOptions?.timeout).toBe(1234);
    expect(arg.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(arg.config.outputDimensionality).toBe(EMBEDDING_DIMENSIONS);
  });
});

describe('Embedder.embedTexts — provider failures', () => {
  it('retries retryable 429 errors and eventually succeeds', async () => {
    let attempts = 0;
    mocks.embedContent.mockImplementation(async ({ contents }: EmbedCallArg) => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('rate limited'), { status: 429 });
      return { embeddings: contents.map((c) => ({ values: vec(Number(c.parts[0].text.split('-')[1])) })) };
    });

    const result = await new Embedder().embedTexts(['chunk-7'], { maxAttempts: 3, logger });

    expect(attempts).toBe(3);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe(7);
    expect(logs.join('\n')).toMatch(/code=429/);
    expect(logs.join('\n')).toMatch(/retrying/);
  });

  it('fails after exhausting attempts on persistent 5xx errors', async () => {
    mocks.embedContent.mockRejectedValue(Object.assign(new Error('server exploded'), { status: 503 }));

    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 2, logger }),
    ).rejects.toThrow(/server exploded/);
    expect(mocks.embedContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable 4xx errors', async () => {
    mocks.embedContent.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));

    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 5, logger }),
    ).rejects.toThrow(/bad request/);
    expect(mocks.embedContent).toHaveBeenCalledTimes(1);
  });
});

describe('Embedder.embedTexts — response validation', () => {
  it('rejects when the provider returns the wrong number of embeddings', async () => {
    mocks.embedContent.mockResolvedValue({ embeddings: [] });
    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger }),
    ).rejects.toThrow(/returned 0 embeddings for 1 inputs/);
  });

  it('rejects embeddings with the wrong dimensionality', async () => {
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [0.1, 0.2, 0.3] }] });
    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger }),
    ).rejects.toThrow(/invalid dimensionality/);
  });

  it('rejects embeddings containing non-finite values', async () => {
    const values = vec(1);
    values[10] = Number.NaN;
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values }] });
    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger }),
    ).rejects.toThrow(/non-finite/);
  });
});

describe('Embedder.embedTexts — observability', () => {
  it('never logs the API key, secrets or document content', async () => {
    mocks.embedContent.mockRejectedValue(
      Object.assign(
        new Error(
          'Request failed: https://generativelanguage.googleapis.com/v1beta/models/' +
            'gemini-embedding-001:embedContent?key=test-api-key-SECRET&alt=json failed',
        ),
        { status: 500 },
      ),
    );

    await expect(
      new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger }),
    ).rejects.toThrow();

    const all = logs.join('\n');
    expect(all).not.toContain('test-api-key-SECRET');
    expect(all).not.toContain('AIza');
    expect(all).toContain('[redacted]');
    expect(all).toMatch(/code=500/);
    // The chunk text must never be logged.
    expect(all).not.toContain('chunk-0');
  });

  it('logs embedding start and completion summary', async () => {
    await new Embedder().embedTexts(makeTexts(120), {
      batchSize: 50,
      concurrency: 2,
      requestTimeoutMs: 1000,
      logger,
    });
    const all = logs.join('\n');
    expect(all).toMatch(/\[embed\] start chunks=120 batches=3/);
    expect(all).toMatch(/\[embed\] done chunks=120 batches=3 .*status=ok/);
  });
});

/** Build an ApiError-shaped error: `status` + JSON body in `message`. */
function providerError(status: number, body: unknown): Error {
  return Object.assign(new Error(JSON.stringify(body)), { status });
}

/**
 * A provider 429 body carrying RetryInfo and/or QuotaFailure details.
 *
 * The per-minute/per-day distinction lives in `quotaId` (matching the real
 * provider), while `quotaMetric` identifies the quota family.
 */
function rateLimitBody(options: {
  retryDelay?: string;
  period?: 'PerMinute' | 'PerDay';
  quotaValue?: string;
}): unknown {
  const details: unknown[] = [];
  if (options.retryDelay) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.RetryInfo',
      retryDelay: options.retryDelay,
    });
  }
  if (options.period) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          quotaMetric: 'generativelanguage.googleapis.com/embed_content_free_tier_requests',
          quotaId: `EmbedContentRequests${options.period}PerUserPerProjectPerModel-FreeTier`,
          quotaValue: options.quotaValue,
        },
      ],
    });
  }
  return {
    error: {
      code: 429,
      message: 'You exceeded your current quota, please check your plan and billing details.',
      status: 'RESOURCE_EXHAUSTED',
      details,
    },
  };
}

/**
 * The exact 429 body captured from the live Gemini API during this incident.
 * Locked in as a regression fixture so a change in the provider's error shape
 * (e.g. moving the per-minute/per-day hint out of `quotaId`) is caught.
 */
const REAL_429_BODY =
  '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and ' +
  'billing details. For more information on this error, head to: ' +
  'https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: ' +
  'https://ai.dev/rate-limit. \\n* Quota exceeded for metric: ' +
  'generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 100, model: ' +
  'gemini-embedding-1.0\\nPlease retry in 26.31484053s.","status":"RESOURCE_EXHAUSTED","details":' +
  '[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about ' +
  'Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},' +
  '{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":' +
  '"generativelanguage.googleapis.com/embed_content_free_tier_requests","quotaId":' +
  '"EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier","quotaDimensions":' +
  '{"location":"global","model":"gemini-embedding-1.0"},"quotaValue":"100"}]},' +
  '{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"26s"}]}}';

describe('Embedder.embedTexts — quota-aware pacing and RetryInfo', () => {
  it('honors RetryInfo.retryDelay from a 429 and succeeds on retry', async () => {
    let attempts = 0;
    mocks.embedContent.mockImplementation(async ({ contents }: EmbedCallArg) => {
      attempts += 1;
      if (attempts === 1) {
        throw providerError(
          429,
          rateLimitBody({
            retryDelay: '0.05s',
            period: 'PerMinute',
            quotaValue: '100',
          }),
        );
      }
      return { embeddings: contents.map((c) => ({ values: vec(Number(c.parts[0].text.split('-')[1])) })) };
    });

    const result = await new Embedder().embedTexts(['chunk-7'], { logger });

    expect(attempts).toBe(2);
    expect(result[0][0]).toBe(7);
    const all = logs.join('\n');
    // Waited the provider-requested delay, not a fixed exponential backoff.
    expect(all).toMatch(/retrying in 50ms/);
    // Learned the per-minute quota and paced below it (10% safety margin).
    expect(all).toMatch(/learned provider rate limit 100\/min/);
    expect(all).toMatch(/pacing at 90\/min/);
  });

  it('paces proactively when a contents-per-minute limit is configured', async () => {
    const startedAt = Date.now();
    const result = await new Embedder().embedTexts(makeTexts(100), {
      batchSize: 25,
      concurrency: 4,
      requestTimeoutMs: 1000,
      contentsPerMinute: 50,
      rateLimitWindowMs: 80,
      logger,
    });
    const elapsed = Date.now() - startedAt;

    // 100 contents at 50 per 80ms window cannot all be sent at once.
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(result).toHaveLength(100);
    expect(logs.join('\n')).toMatch(/proactive pacing at 50\/min/);
  });

  it('fails fast (no long wait) when the daily quota is exhausted', async () => {
    mocks.embedContent.mockImplementation(() => {
      throw providerError(
        429,
        rateLimitBody({
          retryDelay: '46861s',
          period: 'PerDay',
          quotaValue: '1000',
        }),
      );
    });

    const startedAt = Date.now();
    await expect(new Embedder().embedTexts(['chunk-0'], { logger })).rejects.toThrow(
      /quota exceeded/i,
    );
    // Did not block for the 13h provider delay.
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('aborts a RetryInfo wait immediately when the signal is aborted', async () => {
    mocks.embedContent.mockImplementation(() => {
      throw providerError(429, rateLimitBody({ retryDelay: '5s' }));
    });

    const controller = new AbortController();
    const startedAt = Date.now();
    const promise = new Embedder().embedTexts(['chunk-0'], {
      logger,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('parses the real captured 429 payload: learns the per-minute quota and honors RetryInfo', async () => {
    mocks.embedContent.mockRejectedValue(Object.assign(new Error(REAL_429_BODY), { status: 429 }));

    const controller = new AbortController();
    const promise = new Embedder().embedTexts(['chunk-0'], { logger, signal: controller.signal });
    // Abort during the honored wait so the test stays fast.
    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    const all = logs.join('\n');
    // Per-minute quota (100) learned from the real `quotaId`, paced 10% below it.
    expect(all).toMatch(/learned provider rate limit 100\/min/);
    expect(all).toMatch(/pacing at 90\/min/);
    // RetryInfo.retryDelay "26s" honored (not an exponential-backoff value).
    expect(all).toMatch(/retrying in 26000ms/);
  });
});

describe('Embedder.embedTexts — sanitized provider errors', () => {
  it('throws a concise EmbeddingProviderError instead of the raw provider body', async () => {
    mocks.embedContent.mockRejectedValue(
      providerError(
        429,
        rateLimitBody({ period: 'PerMinute' }),
      ),
    );

    let caught: unknown;
    try {
      await new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EmbeddingProviderError);
    const message = (caught as Error).message;
    expect(message).toMatch(/rate limit exceeded \(HTTP 429\)/);
    expect(message).not.toContain('RESOURCE_EXHAUSTED');
    expect(message).not.toContain('{"error"');
    expect((caught as EmbeddingProviderError).code).toBe('429');
  });

  it('redacts request URLs containing the API key', async () => {
    mocks.embedContent.mockRejectedValue(
      Object.assign(
        new Error(
          'Request failed: https://generativelanguage.googleapis.com/v1beta/models/' +
            'gemini-embedding-001:embedContent?key=test-api-key-SECRET&alt=json failed',
        ),
        { status: 503 },
      ),
    );

    let caught: unknown;
    try {
      await new Embedder().embedTexts(['chunk-0'], { maxAttempts: 1, logger });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EmbeddingProviderError);
    expect((caught as Error).message).not.toContain('test-api-key-SECRET');
    expect((caught as Error).message).not.toContain('AIza');
  });
});

describe('ProviderRateLimiter', () => {
  it('allows up to the limit immediately and then waits for the window', async () => {
    const limiter = new ProviderRateLimiter(2, 90);

    await limiter.acquire(2);
    expect(limiter.currentLimit).toBe(2);

    const startedAt = Date.now();
    await limiter.acquire(1);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60);
  });

  it('is disabled when the limit is 0 and can be enabled later', async () => {
    const limiter = new ProviderRateLimiter(0, 1000);
    expect(limiter.enabled).toBe(false);
    await limiter.acquire(9999); // no limit -> returns immediately

    limiter.setLimit(5);
    expect(limiter.enabled).toBe(true);
    expect(limiter.currentLimit).toBe(5);
  });

  it('rejects an acquire when the signal is already aborted', async () => {
    const limiter = new ProviderRateLimiter(1, 1000);
    await limiter.acquire(1);
    const controller = new AbortController();
    controller.abort();
    await expect(limiter.acquire(1, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
