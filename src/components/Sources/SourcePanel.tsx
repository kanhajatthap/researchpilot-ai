'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CitationCard } from './CitationCard';
import type { Citation } from '@/types/document';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

export interface SourcePanelProps {
  citations?: Citation[];
  className?: string;
  defaultExpanded?: boolean;
  onSourceClick?: (citation: Citation) => void;
}

export function SourcePanel({
  citations,
  className,
  defaultExpanded = false,
  onSourceClick,
}: SourcePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const validCitations = (citations || []).filter((c) => c.documentId && c.chunkId);

  if (validCitations.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground',
          className
        )}
      >
        <BookOpen className='size-3.5' />
        Sources will appear here when relevant documents are referenced.
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/70 bg-card transition-all',
        className
      )}
    >
      <button
        type='button'
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        data-testid='sources-toggle-btn'
        className={cn(
          'flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50',
          isExpanded && 'border-b border-border/70 bg-muted/20'
        )}
      >
        <div className='flex items-center gap-2'>
          <BookOpen className='size-3.5 text-muted-foreground' />
          <span className='font-heading text-xs font-semibold'>Sources</span>
          <Badge variant='secondary' className='h-4 px-1.5 text-[10px] tabular-nums'>
            {validCitations.length}
          </Badge>
        </div>

        <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
          <span>{isExpanded ? 'Hide sources' : 'Show sources'}</span>
          {isExpanded ? (
            <ChevronUp className='size-3.5 text-muted-foreground' />
          ) : (
            <ChevronDown className='size-3.5 text-muted-foreground' />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className='max-h-[180px] overflow-y-auto p-2'>
          <div className='space-y-1.5'>
            {validCitations.map((citation, index) => (
              <CitationCard
                key={citation.chunkId || citation.id}
                citation={citation}
                index={index + 1}
                onClick={() => onSourceClick?.(citation)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
