'use client';

import { useState, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ArrowUp } from 'lucide-react';

export interface ChatComposerProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatComposer({
  onSend,
  disabled = false,
  isLoading = false,
  placeholder = 'Ask anything about your documents…',
  className,
}: ChatComposerProps) {
  const [value, setValue] = useState('');

  const canSend = value.trim().length > 0 && !disabled && !isLoading;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isLoading) return;
    onSend?.(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm transition-[color,box-shadow,border-color] focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-ring/20',
        className
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={disabled || isLoading}
        aria-label='Message'
        className='max-h-40 min-h-[44px] resize-none border-0 bg-transparent px-2.5 py-2 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent'
      />

      <div className='flex items-center justify-between gap-2 px-0.5 pb-0.5'>
        <div className='hidden items-center gap-1.5 pl-2 text-[11px] text-muted-foreground sm:flex'>
          <kbd className='rounded border border-border/70 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium'>
            Enter
          </kbd>
          <span>to send</span>
          <span className='text-muted-foreground/40'>·</span>
          <kbd className='rounded border border-border/70 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium'>
            Shift
          </kbd>
          <span>+</span>
          <kbd className='rounded border border-border/70 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium'>
            Enter
          </kbd>
          <span>for a new line</span>
        </div>

        <Button
          size='icon-sm'
          className='ml-auto rounded-xl'
          disabled={!canSend}
          onClick={handleSend}
          aria-label='Send message'
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
}
