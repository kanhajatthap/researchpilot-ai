'use client';

import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/lib/chat-context';
import { MessageSquarePlus, MessagesSquare, Trash2, X } from 'lucide-react';

export interface ConversationPanelProps {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  loading?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  className?: string;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

export function ConversationPanel({
  open,
  onClose,
  conversations,
  loading = false,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  className,
}: ConversationPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={cn('absolute inset-0 z-30 flex', className)}>
      <div
        className='rp-fade-in absolute inset-0 bg-background/70 backdrop-blur-sm'
        onClick={onClose}
        aria-hidden
      />

      <div
        role='dialog'
        aria-modal='true'
        aria-label='Conversation history'
        className='rp-fade-up relative z-10 flex h-full w-80 max-w-[85%] flex-col border-r border-border/70 bg-card shadow-2xl'
      >
        <div className='flex h-14 shrink-0 items-center gap-2 border-b border-border/70 px-4'>
          <MessagesSquare className='size-4 text-muted-foreground' />
          <h2 className='font-heading text-sm font-semibold'>Conversations</h2>
          {conversations.length > 0 && (
            <Badge variant='secondary' className='h-5 px-1.5 tabular-nums'>
              {conversations.length}
            </Badge>
          )}
          <Button
            variant='ghost'
            size='icon-sm'
            className='ml-auto'
            onClick={onClose}
            aria-label='Close conversation history'
          >
            <X />
          </Button>
        </div>

        <div className='shrink-0 border-b border-border/70 p-2'>
          <Button variant='outline' size='sm' className='w-full justify-start gap-2' onClick={onNew}>
            <MessageSquarePlus />
            New conversation
          </Button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto p-2'>
          {loading ? (
            <div className='space-y-2 p-1'>
              {[0, 1, 2].map((i) => (
                <div key={i} className='h-14 animate-pulse rounded-lg bg-muted/60' />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className='flex flex-col items-center gap-1 px-4 py-12 text-center'>
              <MessagesSquare className='size-6 text-muted-foreground/60' />
              <p className='mt-2 text-sm font-medium'>No conversations yet</p>
              <p className='text-xs text-muted-foreground'>
                Ask a question to start your first research thread.
              </p>
            </div>
          ) : (
            <ul className='space-y-1'>
              {conversations.map((conversation) => {
                const isSelected = selectedId === conversation.id;
                return (
                  <li key={conversation.id}>
                    <div
                      className={cn(
                        'group flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                        isSelected
                          ? 'border-border bg-muted'
                          : 'border-transparent hover:border-border/60 hover:bg-muted/50'
                      )}
                    >
                      <button
                        type='button'
                        onClick={() => onSelect(conversation.id)}
                        className='min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                      >
                        <span className='block truncate text-sm font-medium text-foreground'>
                          {conversation.title}
                        </span>
                        <span className='mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground'>
                          <span>{formatRelativeTime(conversation.updatedAt)}</span>
                          <span className='text-muted-foreground/40'>·</span>
                          <span>
                            {conversation.messageCount} message
                            {conversation.messageCount === 1 ? '' : 's'}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        className='shrink-0 text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
                        onClick={() => onDelete(conversation.id)}
                        aria-label={`Delete ${conversation.title}`}
                        title='Delete conversation'
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
