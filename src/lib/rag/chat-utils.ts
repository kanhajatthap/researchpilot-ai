import type { Conversation } from '@/types/chat';

/**
 * Pure helpers used by the chat route (`src/app/api/chat/route.ts`).
 *
 * These live outside the route file for two reasons:
 *  1. Route modules may only export HTTP method handlers (plus route config),
 *     so helpers cannot be exported from there for testing.
 *  2. Importing the route in a unit test would pull in the Gemini SDK, the
 *     agent manager and the vector store. Keeping the pure helpers here lets
 *     tests exercise them without those side effects.
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface IncomingMessage {
  role: ChatRole;
  content: string;
}

export const MAX_MESSAGES = 50;
export const MAX_CHARS_PER_MESSAGE = 4000;
export const VALID_ROLES: readonly ChatRole[] = ['user', 'assistant', 'system'];
export const CONTEXT_WINDOW_MESSAGES = 10; // Limit context window to last 10 messages

export function validateMessages(input: unknown): IncomingMessage[] {
  if (!Array.isArray(input)) {
    throw new Error('Messages must be an array');
  }
  if (input.length === 0) {
    throw new Error('No messages provided');
  }
  if (input.length > MAX_MESSAGES) {
    throw new Error('Too many messages');
  }
  return input.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid message at index ${idx}`);
    }
    const { role, content } = raw as Record<string, unknown>;
    if (typeof role !== 'string' || !VALID_ROLES.includes(role as ChatRole)) {
      throw new Error(`Invalid role at index ${idx}`);
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(`Invalid content at index ${idx}`);
    }
    if (content.length > MAX_CHARS_PER_MESSAGE) {
      throw new Error(`Message too long at index ${idx}`);
    }
    return { role: role as ChatRole, content: content.trim() };
  });
}

export function buildContextPrompt(conversation: Conversation, currentQuestion: string): string {
  // Build a contextual prompt that includes relevant conversation history
  const recentMessages = conversation.messages.slice(-CONTEXT_WINDOW_MESSAGES);

  let contextPrompt = 'Conversation context:\n';

  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      contextPrompt += `User: ${msg.content}\n`;
    } else if (msg.role === 'assistant') {
      // Include assistant responses but mark them as context, not evidence
      contextPrompt += `Assistant (context only): ${msg.content.substring(0, 500)}\n`;
    }
  }

  contextPrompt += `\nCurrent question: ${currentQuestion}\n`;
  contextPrompt += '\nAnswer the current question using the conversation context above to resolve references. ';
  contextPrompt += 'If the question references previous topics (e.g., "that company", "the previous report"), use the context to understand the reference. ';
  contextPrompt += 'When citing sources, only use information from the retrieved document chunks, not from previous assistant responses.';

  return contextPrompt;
}
