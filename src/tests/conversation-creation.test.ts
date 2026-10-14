import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message } from '@/types/chat';

/**
 * Regression tests for automatic / duplicate conversation creation.
 *
 * Background: the chat workspace used to read `selectedConversationId` *after*
 * awaiting the conversation-creation call. The value was stale (empty), so the
 * follow-up `/api/chat` request also carried an empty id and the server created
 * a SECOND conversation. The result was two conversations per new chat: the
 * titled one stayed empty and an "Untitled" one held the messages.
 *
 * These tests pin the storage-layer contract the client relies on, and cover
 * the scenarios called out in the bug report: page reloads, multiple tabs and
 * duplicate requests.
 */

type ConversationStore = typeof import('@/lib/rag/conversation-store');

let testStoreDir: string;
let store: ConversationStore;

beforeEach(async () => {
  // Fresh module registry + fresh data directory per test => an empty store.
  vi.resetModules();
  testStoreDir = mkdtempSync(join(tmpdir(), 'rp-conversation-creation-'));
  process.env.CONVERSATION_STORE_PATH = testStoreDir;
  store = await import('@/lib/rag/conversation-store');
});

afterEach(() => {
  if (testStoreDir) rmSync(testStoreDir, { recursive: true, force: true });
});

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: `m-${role}-${content}`, role, content, createdAt: new Date() };
}

describe('Conversation creation is explicit and de-duplicated', () => {
  it('does not create a conversation when the request already carries an id', async () => {
    const id = await store.createConversation('Existing thread');
    const before = (await store.listConversations()).length;

    const resolved = await store.getConversationIdFromRequest({ conversationId: id });

    expect(resolved).toBe(id);
    expect((await store.listConversations()).length).toBe(before);
  });

  it('creates exactly one conversation when no id is supplied', async () => {
    expect((await store.listConversations()).length).toBe(0);

    const id = await store.getConversationIdFromRequest({ messages: [] });

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect((await store.listConversations()).length).toBe(1);
  });

  it('documents the contract: an empty/absent id creates a new conversation', async () => {
    // This is exactly why the client must pass the id it just created.
    expect((await store.listConversations()).length).toBe(0);

    const id = await store.getConversationIdFromRequest({ conversationId: '' });

    expect(id).toBeTruthy();
    expect((await store.listConversations()).length).toBe(1);
  });

  it('regression: sending the created id stores the exchange in ONE conversation', async () => {
    // Mirrors the fixed client flow: create the (titled) conversation, then
    // send that id to /api/chat. Previously the stale empty id was sent, which
    // produced an extra untitled conversation and left the titled one empty.
    const title = 'Regression single conversation';
    const id = await store.createConversation(title, []);
    expect((await store.listConversations()).length).toBe(1);

    const resolvedId = await store.getConversationIdFromRequest({ conversationId: id });
    await store.updateConversation(resolvedId, [
      msg('user', 'What is RAG?'),
      msg('assistant', 'Retrieval-augmented generation.'),
    ]);

    const all = await store.listConversations();
    expect(all.length).toBe(1);

    const stored = await store.getConversation(resolvedId);
    expect(stored?.title).toBe(title);
    expect(stored?.messages).toHaveLength(2);

    // No orphaned, empty conversation should be left behind.
    expect(all.filter((c) => c.messageCount === 0)).toHaveLength(0);
  });

  it('page reload (listing conversations) never creates conversations', async () => {
    // A reload only performs a GET, which must be side-effect free.
    expect((await store.listConversations()).length).toBe(0);
    await store.listConversations();
    await store.listConversations();
    expect((await store.listConversations()).length).toBe(0);
  });

  it('multiple tabs: two independent new chats stay separate', async () => {
    const tabA = await store.getConversationIdFromRequest({});
    const tabB = await store.getConversationIdFromRequest({});

    expect(tabA).not.toBe(tabB);

    await store.updateConversation(tabA, [msg('user', 'tab A question')]);
    await store.updateConversation(tabB, [msg('user', 'tab B question')]);

    expect((await store.getConversation(tabA))?.messages[0].content).toBe('tab A question');
    expect((await store.getConversation(tabB))?.messages[0].content).toBe('tab B question');
    expect((await store.listConversations()).length).toBe(2);
  });

  it('duplicate requests reusing the same id do not spawn duplicates', async () => {
    const id = await store.createConversation('Duplicate requests');
    expect((await store.listConversations()).length).toBe(1);

    const [a, b, c] = await Promise.all([
      store.getConversationIdFromRequest({ conversationId: id }),
      store.getConversationIdFromRequest({ conversationId: id }),
      store.getConversationIdFromRequest({ conversationId: id }),
    ]);

    expect([a, b, c]).toEqual([id, id, id]);
    expect((await store.listConversations()).length).toBe(1);
  });
});
