'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Citation, Message } from '@/types/chat';
import { Check, Copy, FileText, Sparkles, User } from 'lucide-react';

export interface ChatMessageProps {
  message: Message;
  onSourceClick?: (citation: Citation) => void;
  className?: string;
  /** Set of document IDs that currently exist. Citations for missing documents are filtered out. */
  existingDocumentIds?: Set<string>;
  /** Renders a blinking caret while the assistant response is still streaming. */
  isStreaming?: boolean;
}

function formatTime(createdAt: Message['createdAt']): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({
  message,
  onSourceClick,
  className,
  existingDocumentIds,
  isStreaming = false,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const visibleCitations =
    isAssistant && message.citations && message.citations.length > 0
      ? message.citations.filter(
          (citation) => !existingDocumentIds || existingDocumentIds.has(citation.documentId)
        )
      : [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; fail silently.
    }
  };

  if (isUser) {
    return (
      <div className={cn('rp-fade-up flex w-full justify-end gap-2.5 sm:gap-3', className)}>
        <div className='flex max-w-[85%] flex-col items-end gap-1.5 sm:max-w-[75%]'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span className='tabular-nums'>{formatTime(message.createdAt)}</span>
            <span className='font-medium text-foreground'>You</span>
          </div>
          <div className='rounded-2xl rounded-tr-md border border-border/70 bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground'>
            <p className='whitespace-pre-wrap break-words'>{message.content}</p>
          </div>
        </div>
        <span className='mt-6 hidden size-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground sm:flex'>
          <User className='size-3.5' />
        </span>
      </div>
    );
  }

  return (
    <div className={cn('rp-fade-up group flex w-full gap-2.5 sm:gap-3', className)}>
      <span className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background ring-1 ring-foreground/10'>
        <Sparkles className='size-3.5' />
      </span>

      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-center gap-2 text-xs'>
          <span className='font-medium text-foreground'>ResearchPilot</span>
          <span className='tabular-nums text-muted-foreground'>{formatTime(message.createdAt)}</span>
          <Button
            variant='ghost'
            size='icon-xs'
            className='ml-auto text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'
            onClick={handleCopy}
            aria-label='Copy response'
            title='Copy response'
          >
            {copied ? <Check className='text-success' /> : <Copy />}
          </Button>
        </div>

        <div className='text-sm leading-relaxed text-foreground/90'>
          <p className='whitespace-pre-wrap break-words'>
            {message.content}
            {isStreaming && (
              <span
                className='rp-dot ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 rounded-[1px] bg-foreground/70 align-middle'
                aria-hidden
              />
            )}
          </p>
        </div>

        {visibleCitations.length > 0 && (
          <div className='mt-1.5 flex flex-wrap gap-1.5'>
            {visibleCitations.map((citation, index) => (
              <button
                key={citation.chunkId || citation.id}
                type='button'
                onClick={() => onSourceClick?.(citation)}
                title={`${citation.documentName}${
                  citation.pageNumber ? ` · page ${citation.pageNumber}` : ''
                }`}
                className='inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground'
              >
                <span className='flex size-4 shrink-0 items-center justify-center rounded bg-muted-foreground/15 text-[10px] font-semibold text-foreground/80 tabular-nums'>
                  {index + 1}
                </span>
                <FileText className='size-3 shrink-0' />
                <span className='truncate'>{citation.documentName}</span>
                {citation.pageNumber ? (
                  <span className='shrink-0 text-muted-foreground/70'>p.{citation.pageNumber}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
