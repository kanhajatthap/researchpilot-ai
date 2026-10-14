import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Message, Conversation } from '@/types/chat';

interface StoreState {
  conversations: Record<string, Conversation>;
}

// In-memory cache for performance (disabled when CONVERSATION_STORE_INMEMORY is not set)
let inMemory: StoreState | null = null;

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

async function readStore(): Promise<StoreState> {
  // Always read fresh to handle concurrent updates; in-memory is only an optimization
  if (inMemory) return inMemory;
  
  try {
    await ensureDataDir();
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed: StoreState = JSON.parse(raw);
    
    // Convert string dates back to Date objects from JSON serialization
    if (parsed.conversations) {
      for (const [id, conv] of Object.entries(parsed.conversations)) {
        if (conv.createdAt && typeof conv.createdAt === 'string') {
          parsed.conversations[id].createdAt = new Date(conv.createdAt);
        }
        if (conv.updatedAt && typeof conv.updatedAt === 'string') {
          parsed.conversations[id].updatedAt = new Date(conv.updatedAt);
        }
      }
    }
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object' || !parsed.conversations) {
      throw new Error('Invalid store structure');
    }
    
    return parsed;
  } catch {
    // File doesn't exist yet, create empty store
    const initialStore: StoreState = { conversations: {} };
    await writeStore(initialStore);
    return initialStore;
  }
}

async function writeStore(state: StoreState): Promise<void> {
  return enqueueWrite(async () => {
    await ensureDataDir();
    // Write to a temp file first, then rename for atomic write
    const tempPath = storePath() + '.tmp';
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tempPath, storePath());
    inMemory = state;
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
  const store = await readStore();
  const conversationId = randomUUID();  
  const conversation: Conversation = {
    id: conversationId,
    title: title || 'Untitled Research Conversation',
    messages: [...initialMessages],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  store.conversations[conversationId] = conversation;
  await writeStore(store);
  
  return conversationId;
}

export async function updateConversation(id: string, messages: Message[]): Promise<void> {
  const store = await readStore();
  if (store.conversations[id]) {
    store.conversations[id] = {
      ...store.conversations[id],
      messages,
      updatedAt: new Date(),
    };
    await writeStore(store);
  }
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
  
  const store = await readStore();
  if (!store.conversations[id]) return false;
  
  store.conversations[id] = {
    ...store.conversations[id],
    title: cleanTitle,
  };
  await writeStore(store);
  
  return true;
}

/**
 * Delete a conversation. Returns true if deleted, false if not found.
 */
export async function deleteConversation(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.conversations[id]) return false;
  
  delete store.conversations[id];
  await writeStore(store);
  
  return true;
}

/**
 * Update the last-modified timestamp for a conversation.
 */
export async function touchConversation(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.conversations[id]) return false;
  
  store.conversations[id] = {
    ...store.conversations[id],
    updatedAt: new Date(),
  };
  await writeStore(store);
  
  return true;
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