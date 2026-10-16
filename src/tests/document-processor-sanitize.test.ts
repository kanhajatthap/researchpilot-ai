// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for the failure-message sanitizer used when persisting document
 * errors. Provider failures can arrive as a large raw JSON body; the stored
 * message must be concise, actionable and secret-free.
 *
 * The extractor/vectorstore dependencies of the processor are mocked so only
 * the pure helper is exercised.
 */

vi.mock('@/lib/rag/extractor', () => ({ extractPdfText: vi.fn() }));
vi.mock('@/lib/rag/vectorstore', () => ({ vectorStore: {} }));

import { sanitizeFailureMessage } from '@/lib/rag/document-processor';

describe('sanitizeFailureMessage', () => {
  it('reduces a raw provider JSON body to the provider message', () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message: 'You exceeded your current quota.',
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '46861s' }],
      },
    });

    expect(sanitizeFailureMessage(body)).toBe('You exceeded your current quota.');
  });

  it('redacts API keys embedded in request URLs', () => {
    const result = sanitizeFailureMessage('request to https://x/y?key=abc123&alt=json failed');
    expect(result).toBe('request to https://x/y?key=[redacted]&alt=json failed');
  });

  it('redacts Google-style API keys', () => {
    expect(sanitizeFailureMessage('key AIzaSyD-abcdefghijklmnop')).not.toContain('AIzaSy');
  });

  it('collapses whitespace and bounds the length', () => {
    const result = sanitizeFailureMessage(`a\n\nb   c ${'x'.repeat(500)}`);
    expect(result.startsWith('a b c x')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.endsWith('...')).toBe(true);
  });

  it('leaves plain messages intact', () => {
    expect(sanitizeFailureMessage('  No extractable text found.  ')).toBe(
      'No extractable text found.',
    );
  });

  it('keeps malformed JSON-looking text readable instead of throwing', () => {
    expect(sanitizeFailureMessage('{ not json at all')).toBe('{ not json at all');
  });
});
