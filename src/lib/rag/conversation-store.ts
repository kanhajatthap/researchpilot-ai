/**
 * Conversation store for server-side use.
 *
 * This module uses Node.js fs/promises for persistent storage of conversation data.
 * It is intended for server-side use (API routes, server components) and should not
 * be imported directly in client components due to the fs import.
 *
 * For client-side conversation management, use the hook provided by chat-context.ts
 * which fetches data from the API endpoints.
 *
 * Security note: Conversation IDs are not tied to authenticated user identities in
 * this implementation. In production, ensure the API routes validate ownership
 * before performing operations on conversations.
 */

// Re-export everything from the server module for API route usage
export * from './conversation-store.server';

// Export the title generator for client use
export { generateTitleFromMessage } from '@/lib/rag/title-generator';