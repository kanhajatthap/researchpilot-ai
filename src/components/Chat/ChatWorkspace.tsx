'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChatMessage } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { SuggestedQuestions } from './SuggestedQuestions';
import { ConversationPanel } from './ConversationPanel';
import { SourcePanel } from '@/components/Sources/SourcePanel';
import { ErrorState } from '@/components/common';
import { cn } from '@/lib/utils';
import { useConversationStore } from '@/lib/chat-context';
import { generateTitleFromMessage } from '@/lib/rag/title-generator';
import type { Message, Citation } from '@/types/chat';
import type { Document } from '@/types/document';
import { FileText, History, Plus, Sparkles } from 'lucide-react';

interface StreamEvent {
  text?: string;
  done?: boolean;
  error?: string;
  conversationId?: string;
  citations?: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId: string;
  }>;
  trace?: Array<{ label: string; status: string; message: string }>;
}

export interface ChatWorkspaceProps {
  className?: string;
  onAgentTrace?: (trace: import('@/types/agent').AgentTrace) => void;
  autoFocusNew?: boolean;
}

export function ChatWorkspace({ className, onAgentTrace }: ChatWorkspaceProps) {
  const {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    loadingConversations,
    deleteConversation,
  } = useConversationStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  // Set of existing document IDs — used to validate citations (deflects stale citations after deletion)
  const existingDocumentIds = useMemo(() => new Set(documents.map((doc) => doc.id)), [documents]);

  // Fetch documents with proper loading state
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  // Fetch documents on mount - defer to avoid setState during render
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      // Synchronous in-flight guard. `isLoading` state is not committed until
      // the next render, so two rapid triggers (double-click, Enter + click,
      // two suggested-question taps) could otherwise both begin a send and each
      // create their own conversation.
      if (inFlightRef.current || isLoading) return;
      inFlightRef.current = true;
      setError(null);

      // Resolve the conversation id for THIS request into a local variable.
      // Re-reading `selectedConversationId` after the `await` below would still
      // see the stale (empty) value from this render, causing the server to
      // create a SECOND conversation and leave an empty duplicate behind.
      let conversationId = selectedConversationId;

      // Create a conversation only when a send explicitly needs one.
      if (!conversationId) {
        try {
          const title = generateTitleFromMessage(content);
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              messages: [],
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to create conversation');
          }

          const data = await res.json();
          conversationId = data.conversationId;
          setSelectedConversationId(conversationId);
        } catch (e) {
          const message = (e as Error).message || 'Failed to create conversation';
          setError(message);
          inFlightRef.current = false;
          return;
        }
      }

      const userMessage: Message = {
        id: 'msg-' + Date.now(),
        role: 'user',
        content,
        createdAt: new Date(),
      };
      const assistantId = 'msg-' + Date.now() + '-a';
      const history = messages.filter((m) => m.content.trim().length > 0);
      const payload = [...history, userMessage].map((m) => ({ role: m.role, content: m.content }));

      setMessages([
        ...messages,
        userMessage,
        { id: assistantId, role: 'assistant', content: '', createdAt: new Date() },
      ]);
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: payload,
            documentId: selectedDocumentId,
            conversationId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let detail = 'The assistant could not respond. Please try again.';
          try {
            const data = await res.json();
            if (data && typeof data.error === 'string') detail = data.error;
          } catch {
            // ignore non-json error bodies
          }
          throw new Error(detail);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError: string | null = null;
        let serverConversationId: string | undefined;
        let accumulatedCitations: Citation[] = [];
        const accumulatedTrace: Array<{ label: string; status: string; message: string }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(jsonStr) as StreamEvent;
            } catch {
              continue;
            }
            if (typeof event.text === 'string' && event.text.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: (m.content || '') + event.text } : m
                )
              );
            }
            if (event.citations && event.citations.length > 0) {
              // Use chunkId as stable citation ID, deduplicate by chunkId
              const newCitations = event.citations.map((c) => ({
                id: c.chunkId,
                documentId: c.documentId,
                documentName: c.documentName,
                pageNumber: c.pageNumber,
                chunkId: c.chunkId,
              }));
              // Deduplicate: keep first occurrence of each chunkId
              const seen = new Set<string>();
              accumulatedCitations = newCitations.filter((c) => {
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
              });
            }
            if (typeof event.conversationId === 'string' && event.conversationId.length > 0) {
              serverConversationId = event.conversationId;
            }
            if (event.trace && event.trace.length > 0) {
              // Accumulate agent trace
              accumulatedTrace.push(...event.trace);
            }
            if (typeof event.error === 'string') {
              streamError = event.error;
            }
          }
        }

        if (streamError) {
          throw new Error(streamError);
        }

        // Safety net: if the server persisted this exchange under a different
        // conversation id than we sent, adopt it so follow-up messages continue
        // the same thread instead of starting yet another conversation.
        if (serverConversationId && serverConversationId !== conversationId) {
          setSelectedConversationId(serverConversationId);
        }

        // Update the assistant message with citations
        if (accumulatedCitations.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, citations: accumulatedCitations } : m
            )
          );
        }

        // Build and deliver the agent trace to the dashboard
        if (accumulatedTrace.length > 0) {
          const now = new Date();
          const trace: import('@/types/agent').AgentTrace = {
            id: assistantId,
            steps: accumulatedTrace.map((t, idx) => ({
              id: `trace-${idx}`,
              label: t.label,
              status: t.status as import('@/types/agent').AgentStep['status'],
              timestamp: now,
              message: t.message,
            })),
            startedAt: now,
            completedAt: now,
            totalDurationMs: 0,
          };
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, agentTrace: trace } : m))
          );
          onAgentTrace?.(trace);
        }

        setMessages((prev) => {
          const assistant = prev.find((m) => m.id === assistantId);
          if (assistant && assistant.content.trim().length === 0) {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: 'The assistant returned an empty response. Please try again.' }
                : m
            );
          }
          return prev;
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.content.trim().length === 0
                ? { ...m, content: 'Response cancelled.' }
                : m
            )
          );
        } else {
          const message = (e as Error).message || 'Something went wrong.';
          setError(message);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        inFlightRef.current = false;
      }
    },
    [messages, isLoading, selectedDocumentId, selectedConversationId, onAgentTrace, setSelectedConversationId]
  );

  const handleDocumentSelect = useCallback(
    (docId: string) => {
      setSelectedDocumentId(docId === selectedDocumentId ? null : docId);
      // Clear any accumulated citations when switching documents to prevent stale citations
      setMessages((prev) => {
        if (prev.length >= 2) {
          const lastMessageIndex = prev.length - 1;
          if (prev[lastMessageIndex].role === 'assistant') {
            return [
              ...prev.slice(0, lastMessageIndex),
              { ...prev[lastMessageIndex], citations: [] },
            ];
          }
        }
        return prev;
      });
    },
    [selectedDocumentId]
  );

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setSelectedDocumentId(null);
    setSelectedConversationId('');
    setHistoryOpen(false);
  }, [setSelectedConversationId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setSelectedConversationId(id);
      setMessages([]);
      setError(null);
      setHistoryOpen(false);
    },
    [setSelectedConversationId]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('Delete this conversation? This cannot be undone.')
      ) {
        return;
      }
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const showThinking = isLoading && (!lastMessage || lastMessage.content.trim().length === 0);
  const lastMessageCitations =
    lastMessage && lastMessage.role === 'assistant' && lastMessage.citations && lastMessage.citations.length > 0
      ? lastMessage.citations
      : null;

  return (
    <Card
      className={cn(
        'relative flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0',
        className
      )}
    >
      {/* Header */}
      <header className='flex shrink-0 items-center gap-3 border-b border-border/70 px-3 py-2.5 sm:px-4'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background ring-1 ring-foreground/10'>
          <Sparkles className='size-4' />
        </span>
        <div className='min-w-0'>
          <h2 className='truncate font-heading text-sm font-semibold leading-tight'>
            Research Assistant
          </h2>
          <p className='truncate text-xs text-muted-foreground'>
            {selectedConversationId ? 'Continuing conversation' : 'New conversation'} · grounded &amp; cited
          </p>
        </div>

        <div className='ml-auto flex items-center gap-1.5'>
          <Badge variant='outline' className='hidden items-center gap-1.5 sm:inline-flex'>
            <span
              className={cn('size-1.5 rounded-full bg-success', isLoading && 'rp-dot')}
              aria-hidden
            />
            {isLoading ? 'Thinking' : 'Ready'}
          </Badge>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={handleNewConversation}
            aria-label='Start a new conversation'
            title='New conversation'
          >
            <Plus />
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5'
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-expanded={historyOpen}
          >
            <History />
            <span className='hidden sm:inline'>History</span>
            {conversations.length > 0 && (
              <span className='tabular-nums text-muted-foreground'>{conversations.length}</span>
            )}
          </Button>
        </div>
      </header>

      <ConversationPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        loading={loadingConversations}
        selectedId={selectedConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
      />

      {/* Messages */}
      <div ref={scrollAreaRef} className='relative min-h-0 flex-1'>
        <ScrollArea className='h-full'>
          <div className='mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6'>
            {hasMessages ? (
              messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onSourceClick={() => {}}
                  existingDocumentIds={existingDocumentIds}
                  isStreaming={
                    isLoading &&
                    message.role === 'assistant' &&
                    index === messages.length - 1 &&
                    !showThinking
                  }
                />
              ))
            ) : (
              <div className='flex flex-col items-center px-1 py-8 text-center sm:py-14'>
                <span className='flex size-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm ring-1 ring-foreground/10'>
                  <Sparkles className='size-5' />
                </span>
                <h3 className='mt-4 font-heading text-lg font-semibold tracking-tight'>
                  Ask anything about your research
                </h3>
                <p className='mt-1.5 max-w-md text-sm text-muted-foreground'>
                  {documents.length > 0
                    ? `Grounded in ${documents.length} document${
                        documents.length === 1 ? '' : 's'
                      }. Every answer cites the exact page it came from.`
                    : 'Upload a PDF from the knowledge base to ground your answers, or ask a general research question.'}
                </p>

                <div className='mt-6 w-full max-w-2xl text-left'>
                  <SuggestedQuestions onQuestionClick={handleSend} />
                </div>
              </div>
            )}

            {showThinking && (
              <div className='flex items-center gap-3'>
                <span className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background ring-1 ring-foreground/10'>
                  <Sparkles className='size-3.5' />
                </span>
                <span className='inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground'>
                  <span className='size-1.5 animate-pulse rounded-full bg-foreground/40' />
                  <span className='size-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:150ms]' />
                  <span className='size-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:300ms]' />
                  <span className='ml-1'>Thinking…</span>
                </span>
              </div>
            )}

            {error && (
              <ErrorState
                title='Response failed'
                description={error}
                action={
                  <Button variant='ghost' size='xs' className='mt-1' onClick={() => setError(null)}>
                    Dismiss
                  </Button>
                }
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Composer */}
      <footer className='shrink-0 border-t border-border/70 p-3 sm:p-4'>
        <div className='mx-auto w-full max-w-3xl space-y-3'>
          {documents.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='mr-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground'>
                Scope
              </span>
              {documents.map((doc) => {
                const isSelected = selectedDocumentId === doc.id;
                const isReady = doc.status === 'ready';
                return (
                  <button
                    key={doc.id}
                    type='button'
                    onClick={() => handleDocumentSelect(doc.id)}
                    disabled={!isReady}
                    title={isReady ? `Scope answers to ${doc.name}` : `${doc.name} is ${doc.status}`}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                      isSelected
                        ? 'border-foreground/20 bg-foreground text-background'
                        : 'border-border/70 bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                      !isReady && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        isReady ? 'bg-success' : doc.status === 'error' ? 'bg-destructive' : 'bg-warning'
                      )}
                      aria-hidden
                    />
                    <FileText className='size-3 shrink-0' />
                    <span className='truncate'>{doc.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {lastMessageCitations && lastMessageCitations.length > 0 && (
            <SourcePanel citations={lastMessageCitations} className='w-full' />
          )}

          <ChatComposer onSend={handleSend} isLoading={isLoading} />

          <p className='text-center text-[11px] text-muted-foreground'>
            Powered by Gemini · Verify important information before relying on it.
          </p>
        </div>
      </footer>
    </Card>
  );
}
