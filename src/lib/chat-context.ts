import { useState, useCallback, useEffect } from 'react';
import { generateTitleFromMessage } from '@/lib/rag/title-generator';

/**
 * Conversation summary returned by the store/API.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Client-side conversation store state.
 *
 * This hook manages the conversation list and selected conversation state
 * for the ChatWorkspace component. It fetches conversations from the API
 * rather than storing full message histories client-side.
 *
 * Security note: In a multi-user deployment, this must be backed by
 * server-side session authentication so that each user only sees
 * their own conversations. Currently, the API returns all conversations
 * visible to the server. See the conversation-store.ts documentation for
 * the ownership model.
 */
export function useConversationStore() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationIdState] = useState<string>('');
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [loadingConversation, setLoadingConversation] = useState<boolean>(false);

  /**
   * Load the list of conversations from the API.
   */
  const loadConversations = useCallback(async () => {
    if (loadingConversations) return;
    setLoadingConversations(true);
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) {
        throw new Error('Failed to load conversations');
      }
      const data: { conversations: ConversationSummary[] } = await res.json();
      // Sort by updatedAt at the client as well to ensure consistent ordering
      const sorted = (data.conversations || []).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setConversations(sorted);
    } catch (e) {
      console.error('[useConversationStore] Failed to load conversations:', e);
      // Leave conversations as-is; the UI can show an empty state
    } finally {
      setLoadingConversations(false);
    }
  }, [loadingConversations]);

  // Load conversations on mount - inline the logic to avoid setState-in-effect lint rule
  useEffect(() => {
    const load = async () => {
      setLoadingConversations(true);
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) throw new Error('Failed to load conversations');
        const data: { conversations: ConversationSummary[] } = await res.json();
        const sorted = (data.conversations || []).sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setConversations(sorted);
      } catch (e) {
        console.error('[useConversationStore] Failed to load conversations:', e);
      } finally {
        setLoadingConversations(false);
      }
    };
    load();
  }, []);

  /**
   * Rename a conversation via the API.
   */
  const renameConversation = useCallback(async (id: string, title: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to rename conversation');
      }
      const data = await res.json();
      // Update local state
      if (data.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c))
        );
        return true;
      }
      return false;
    } catch (e) {
      console.error('[useConversationStore] Failed to rename conversation:', e);
      return false;
    }
  }, []);

  /**
   * Delete a conversation via the API.
   * Confirmation is handled by the caller before calling this.
   */
  const deleteConversation = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete conversation');
      }
      // Remove from local state
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If the deleted conversation was selected, reset selection
      setSelectedConversationIdState((current) => (current === id ? '' : current));
      return true;
    } catch (e) {
      console.error('[useConversationStore] Failed to delete conversation:', e);
      return false;
    }
  }, []);

  /**
   * Wrapper to set the selected conversation ID.
   */
  const setSelectedConversationId = useCallback((id: string) => {
    setSelectedConversationIdState(id);
  }, []);

  return {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    loadConversations,
    loadingConversations,
    loadingConversation,
    renameConversation,
    deleteConversation,
    hasUnsavedChanges: false,
    generateTitleFromMessage: generateTitleFromMessage,
  };
}

export type { ConversationSummary as ConversationMetadata };
