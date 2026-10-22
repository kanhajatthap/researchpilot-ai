import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/document';

export interface CitationCardProps {
  citation: Citation;
  index: number;
  showExcerpt?: boolean;
  onClick?: () => void;
}

export function CitationCard({ citation, index, showExcerpt = true, onClick }: CitationCardProps) {
  // Use the actual excerpt from the citation if available, otherwise show a placeholder
  const excerpt = citation.excerpt || 'Supporting content from the source document.';

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 transition-colors hover:border-foreground/20',
        onClick && 'cursor-pointer hover:bg-muted/40'
      )}
    >
      <div className='flex items-center gap-2'>
        <span className='flex size-4 shrink-0 items-center justify-center rounded bg-muted-foreground/15 text-[10px] font-semibold tabular-nums text-foreground/80'>
          {index}
        </span>
        <p className='min-w-0 flex-1 truncate text-xs font-medium text-foreground' title={citation.documentName}>
          {citation.documentName}
        </p>
        <Badge variant='outline' className='h-4 shrink-0 px-1.5 text-[10px]'>
          {citation.pageNumber ? `p. ${citation.pageNumber}` : 'p. ?'}
        </Badge>
      </div>

      {showExcerpt && (
        <p className='mt-1 line-clamp-2 pl-6 text-xs leading-relaxed text-muted-foreground'>
          {excerpt}
        </p>
      )}
      {citation.reason && (
        <p className='mt-0.5 line-clamp-1 pl-6 text-[11px] text-muted-foreground/80'>
          Context: {citation.reason}
        </p>
      )}
    </div>
  );
}
