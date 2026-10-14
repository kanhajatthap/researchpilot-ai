import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Document } from '@/types/document';
import { FileText, Loader2, Trash2 } from 'lucide-react';

export interface DocumentItemProps {
  document: Document;
  className?: string;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const STATUS_STYLES: Record<Document['status'], { label: string; badge: string }> = {
  ready: { label: 'Ready', badge: 'border-success/30 bg-success/10 text-success' },
  processing: { label: 'Processing', badge: 'border-warning/30 bg-warning/10 text-warning' },
  uploading: { label: 'Uploading', badge: 'border-warning/30 bg-warning/10 text-warning' },
  error: { label: 'Error', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

export function DocumentItem({ document, className, onDelete, isDeleting = false }: DocumentItemProps) {
  const status = STATUS_STYLES[document.status];
  const busy = document.status === 'processing' || document.status === 'uploading';

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 transition-colors hover:border-foreground/20',
        className
      )}
    >
      <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
        <FileText className='size-4' />
      </span>

      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-foreground' title={document.name}>
          {document.name}
        </p>
        <div className='mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground'>
          <span>{document.fileType.toUpperCase()}</span>
          <span className='text-muted-foreground/40'>·</span>
          <span>{formatBytes(document.size)}</span>
          {document.pageCount ? (
            <>
              <span className='text-muted-foreground/40'>·</span>
              <span>{document.pageCount} pages</span>
            </>
          ) : null}
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-1.5'>
        <Badge variant='outline' className={cn(status.badge)}>
          {busy && <Loader2 className='animate-spin' />}
          {status.label}
        </Badge>

        {onDelete && (
          <Button
            variant='ghost'
            size='icon-xs'
            className='text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
            onClick={() => onDelete(document.id)}
            disabled={isDeleting}
            aria-label={`Delete ${document.name}`}
            title={isDeleting ? 'Deleting…' : 'Delete document'}
          >
            {isDeleting ? <Loader2 className='animate-spin' /> : <Trash2 />}
          </Button>
        )}
      </div>
    </div>
  );
}
