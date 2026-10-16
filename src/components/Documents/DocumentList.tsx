'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DocumentItem } from './DocumentItem';
import { DocumentUploadModal } from './DocumentUploadModal';
import { cn } from '@/lib/utils';
import type { Document } from '@/types/document';
import { FileStack, UploadCloud } from 'lucide-react';

export interface DocumentListProps {
  className?: string;
}

export function DocumentList({ className }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/documents', { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      // ignore abort/network errors, keep existing state
    }
  }, []);

  useEffect(() => {
    // Defer setState to avoid cascading renders
    const id = setTimeout(() => {
      fetchDocuments();
    }, 0);
    return () => {
      clearTimeout(id);
      abortRef.current?.abort();
    };
  }, [fetchDocuments]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Delete failed');
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleUploadSuccess = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleRetry = useCallback(async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/${id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Retry failed');
      }
      // Refresh from the server so the UI reflects the authoritative status.
      await fetchDocuments();
    } catch (err) {
      console.error('Retry error:', err);
      setActionError(err instanceof Error ? err.message : 'Retry failed');
    }
  }, [fetchDocuments]);

  return (
    <Card className={cn('flex flex-col gap-0 py-0', className)}>
      <div className='flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
          <FileStack className='size-3.5' />
        </span>
        <h2 className='font-heading text-sm font-semibold'>Knowledge base</h2>
        {documents.length > 0 && (
          <Badge variant='secondary' className='h-5 px-1.5 tabular-nums'>
            {documents.length}
          </Badge>
        )}
        <Button
          size='sm'
          variant='outline'
          className='ml-auto gap-1.5'
          onClick={() => setIsUploadOpen(true)}
        >
          <UploadCloud />
          Upload
        </Button>
      </div>

      {actionError && (
        <div
          role='alert'
          className='flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive'
        >
          <span className='flex-1'>{actionError}</span>
          <button
            type='button'
            onClick={() => setActionError(null)}
            className='shrink-0 rounded px-1 text-destructive/80 hover:text-destructive'
            aria-label='Dismiss error'
          >
            Dismiss
          </button>
        </div>
      )}

      <div className='max-h-[260px] overflow-y-auto p-3'>
        {documents.length === 0 ? (
          <div className='flex flex-col items-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center'>
            <span className='flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground'>
              <FileStack className='size-4' />
            </span>
            <p className='mt-3 text-sm font-medium text-foreground'>No documents yet</p>
            <p className='mt-1 text-xs text-muted-foreground'>
              Upload a PDF to research across your own sources.
            </p>
            <Button
              size='sm'
              variant='secondary'
              className='mt-3 gap-1.5'
              onClick={() => setIsUploadOpen(true)}
            >
              <UploadCloud />
              Upload PDF
            </Button>
          </div>
        ) : (
          <div className='space-y-2'>
            {documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                document={doc}
                onDelete={handleDelete}
                isDeleting={deletingId === doc.id}
                onRetry={handleRetry}
              />
            ))}
          </div>
        )}
      </div>

      <DocumentUploadModal
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploadSuccess={handleUploadSuccess}
      />
    </Card>
  );
}
