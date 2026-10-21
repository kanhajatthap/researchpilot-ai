import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Message, Conversation } from '@/types/chat';
import { getStorageConfig } from '@/lib/storage/config';
import { readStateRow, withStateRow, writeStateRow } from '@/lib/storage/postgres';

interface StoreState {
  conversations: Record<string, Conversation>;
}

const POSTGRES_KEY = 'conversations';

// In-memory cache for the filesystem driver only. It is unsafe for the Postgres
// driver, where other serverless invocations may update the row concurrently.
let inMemory: StoreState | null = null;

function isPostgresDriver(): boolean {
  return getStorageConfig().driver === 'vercel';
}

function dataDir(): string {
  // Prefer explicit override from env so tests can point at a temp dir.
  return process.env.CONVERSATION_STORE_PATH || path.join(process.cwd(), 'data', 'conversations');
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(dataDir(), { recursive: true });
  } catch (error) {
    console.error('Failed to create data directory:', error);
    throw error;
  }
}

function storePath(): string {
  return path.join(dataDir(), 'conversations.json');
}

/** Maximum number of conversations to return per page when listing. */
const CONVERSATION_LIST_LIMIT = 100;

/**
 * Serializes writes to avoid data loss from concurrent read-modify-write cycles.
 * Only used by the filesystem driver; Postgres uses row-level locking.
 */
function enqueueWrite<T>(writeOp: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(writeOp);
  writeQueue = (async () => {
    try {
      await result;
    } catch {
      // Ignore write failures for queue purposes
    }
  })();
  return result;
}

let writeQueue: Promise<void> = Promise.resolve();

function hydrate(state: StoreState): StoreState {
  if (state.conversations) {
    for (const [id, conv] of Object.entries(state.conversations)) {
      if (conv.createdAt && typeof conv.createdAt === 'string') {
        state.conversations[id].createdAt = new Date(conv.createdAt);
      }
      if (conv.updatedAt && typeof conv.updatedAt === 'string') {
        state.conversations[id].updatedAt = new Date(conv.updatedAt);
      }
    }
  }
  return state;
}

function assertStoreShape(parsed: unknown): StoreState {
  if (!parsed || typeof parsed !== 'object' || !(parsed as StoreState).conversations) {
    throw new Error('Invalid conversation store structure');
  }
  return parsed as StoreState;
}

async function readStore(): Promise<StoreState> {
  if (isPostgresDriver()) {
    const stored = await readStateRow<StoreState>(POSTGRES_KEY);
    return stored ? hydrate(assertStoreShape(stored)) : { conversations: {} };
  }

  if (inMemory) return inMemory;

  try {
    await ensureDataDir();
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = hydrate(JSON.parse(raw) as StoreState);
    inMemory = assertStoreShape(parsed);
    return inMemory;
  } catch (error) {
    // A missing file is a legitimate empty store. Every other failure (corrupt
    // JSON, permissions, read-only filesystem) must propagate: silently
    // resetting would destroy data or hide a misconfiguration.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initialStore: StoreState = { conversations: {} };
    await writeStore(initialStore);
    return initialStore;
  }
}

async function writeStore(state: StoreState): Promise<void> {
  if (isPostgresDriver()) {
    await writeStateRow(POSTGRES_KEY, state);
    return;
  }
  await ensureDataDir();
  // Write to a temp file first, then rename for atomic write
  const tempPath = storePath() + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tempPath, storePath());
  inMemory = state;
}

/**
 * Atomic read-modify-write. On Postgres the row is locked for the duration of
 * the mutation; on the filesystem writes are serialized in-process.
 */
async function mutateStore<T>(fn: (state: StoreState) => Promise<T> | T): Promise<T> {
  if (isPostgresDriver()) {
    return withStateRow<StoreState, T>(POSTGRES_KEY, async (current) => {
      const state = current ? hydrate(assertStoreShape(current)) : { conversations: {} };
      const result = await fn(state);
      return { value: state, result };
    });
  }
  return enqueueWrite(async () => {
    const state = await readStore();
    const result = await fn(state);
    await writeStore(state);
    return result;
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const store = await readStore();
  return store.conversations[id] || null;
}

export async function createConversation(
  title: string,
  initialMessages: Message[] = []
): Promise<string> {
  const conversationId = randomUUID();
  await mutateStore((store) => {
    const conversation: Conversation = {
      id: conversationId,
      title: title || 'Untitled Research Conversation',
      messages: [...initialMessages],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.conversations[conversationId] = conversation;
  });
  return conversationId;
}

export async function updateConversation(id: string, messages: Message[]): Promise<void> {
  await mutateStore((store) => {
    if (!store.conversations[id]) return;
    store.conversations[id] = {
      ...store.conversations[id],
      messages,
      updatedAt: new Date(),
    };
  });
}

export async function getConversationIdFromRequest(requestBody: Record<string, unknown>): Promise<string | null> {
  // Check if conversation ID is provided in request
  if (requestBody?.conversationId && typeof requestBody.conversationId === 'string') {
    return requestBody.conversationId;
  }

  // Otherwise, create a new conversation
  return await createConversation('Untitled Research Conversation');
}

/**
 * List all conversations sorted by most recently updated first.
 * Returns only metadata (no message contents).
 */
export async function listConversations(limit: number = CONVERSATION_LIST_LIMIT): Promise<Array<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}>> {
  const store = await readStore();
  let conversations = Object.values(store.conversations);

  // Sort by most recently updated first
  conversations.sort((a, b) => {
    const timeA = new Date(b.updatedAt).getTime();
    const timeB = new Date(a.updatedAt).getTime();
    return timeA - timeB;
  });

  // Apply limit
  conversations = conversations.slice(0, limit);

  // Return only metadata (no message contents)
  return conversations.map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messageCount: c.messages.length,
  }));
}

/**
 * Get conversation metadata only (no message contents).
 */
export async function getConversationMetadata(id: string): Promise<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
} | null> {
  const store = await readStore();
  const conversation = store.conversations[id];
  if (!conversation) return null;

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation.messages.length,
  };
}

/**
 * Rename a conversation. Preserves message history and timestamps.
 */
export async function renameConversation(id: string, newTitle: string): Promise<boolean> {
  const cleanTitle = sanitizeTitle(newTitle);
  if (!cleanTitle) return false;

  return mutateStore((store) => {
    if (!store.conversations[id]) return false;
    store.conversations[id] = {
      ...store.conversations[id],
      title: cleanTitle,
    };
    return true;
  });
}

/**
 * Delete a conversation. Returns true if deleted, false if not found.
 */
export async function deleteConversation(id: string): Promise<boolean> {
  return mutateStore((store) => {
    if (!store.conversations[id]) return false;
    delete store.conversations[id];
    return true;
  });
}

/**
 * Update the last-modified timestamp for a conversation.
 */
export async function touchConversation(id: string): Promise<boolean> {
  return mutateStore((store) => {
    if (!store.conversations[id]) return false;
    store.conversations[id] = {
      ...store.conversations[id],
      updatedAt: new Date(),
    };
    return true;
  });
}

/**
 * Sanitize a title to remove unsafe characters and limit length.
 */
function sanitizeTitle(title: string): string {
  if (!title || typeof title !== 'string') return '';

  // Remove control characters and newlines
  let clean = title.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();

  // Limit to 100 characters
  if (clean.length > 100) {
    clean = clean.substring(0, 100).replace(/\s+$/, '');
  }

  return clean;
}

export { CONVERSATION_LIST_LIMIT as LIST_LIMIT };
