// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regression tests for POST /api/chat when the conversation store cannot be
 * written (for example a read-only filesystem on a serverless host).
 *
 * Before the fix, `getConversationIdFromRequest` was awaited outside any
 * try/catch. An fs error therefore escaped the handler and the client got an
 * empty 500 response with no explanation. It must now return a JSON 503.
 */

vi.mock('@/lib/llm/gemini', () => ({
  createGeminiClient: () => ({
    models: {
      generateContentStream: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { text: 'ok' };
        },
      }),
    },
  }),
  toGeminiContents: () => [],
}));

vi.mock('@/lib/rag/retrieval', () => ({
  generateQueryEmbedding: vi.fn(),
  retrieveChunks: vi.fn(),
  constructRagPrompt: vi.fn(),
  validateCitations: vi.fn(),
}));

vi.mock('@/lib/agents', () => ({
  agentManager: {
    createAgent: () => ({ id: 'test-agent' }),
  },
}));

let tmpRoot: string;

beforeEach(() => {
  vi.resetModules();
  tmpRoot = mkdtempSync(join(tmpdir(), 'rp-chat-route-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function postChat(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/chat/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return POST(req);
}

describe('POST /api/chat when the conversation store is unavailable', () => {
  it('returns a JSON 503 instead of an empty 500', async () => {
    // A regular file as a parent directory makes mkdir fail on every platform
    // (ENOTDIR / ENOENT), which simulates a non-writable store location.
    const blocker = join(tmpRoot, 'not-a-directory');
    writeFileSync(blocker, 'x');
    process.env.CONVERSATION_STORE_PATH = join(blocker, 'conversations');

    const res = await postChat({
      messages: [{ role: 'user', content: 'Hello there' }],
    });

    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(typeof payload.error).toBe('string');
    expect(payload.error.length).toBeGreaterThan(0);
    expect(payload.error).toMatch(/conversation store/i);
  });

  it('still streams a response when the store is writable', async () => {
    process.env.CONVERSATION_STORE_PATH = join(tmpRoot, 'conversations');

    const res = await postChat({
      messages: [{ role: 'user', content: 'Hello there' }],
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"done":true');
    expect(text).toContain('"text":"ok"');
  });
});
