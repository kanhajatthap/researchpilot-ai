'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentUploadModal } from '@/components/Documents/DocumentUploadModal';
import {
  Database,
  FileText,
  Layers,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  RotateCcw,
  Info,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { Document } from '@/types/document';
import { cn } from '@/lib/utils';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'processing' | 'error'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedDocForDetails, setSelectedDocForDetails] = useState<Document | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will remove its vectors and stored file.`)) {
      return;
    }
    try {
      setDeletingId(id);
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (selectedDocForDetails?.id === id) {
          setSelectedDocForDetails(null);
        }
      } else {
        alert('Failed to delete document.');
      }
    } catch {
      alert('Network error while deleting document.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      setRetryingId(id);
      const res = await fetch(`/api/documents/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        await fetchDocuments();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Retry failed: ${errorData.message || res.statusText}`);
      }
    } catch {
      alert('Network error while requesting retry.');
    } finally {
      setRetryingId(null);
    }
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.fileName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [documents, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalDocs = documents.length;
    const readyDocs = documents.filter((d) => d.status === 'ready').length;
    const totalPages = documents.reduce((acc, d) => acc + (d.pageCount || 0), 0);
    const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
    return { totalDocs, readyDocs, totalPages, totalChunks };
  }, [documents]);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <DashboardLayout>
      <div className='mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8'>
        {/* Page Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              Knowledge Base
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Manage indexed research documents, vector embeddings, and RAG knowledge sources.
            </p>
          </div>
          <div className='flex items-center gap-2.5'>
            <Button
              variant='outline'
              size='sm'
              onClick={fetchDocuments}
              disabled={loading}
              className='gap-1.5'
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              size='sm'
              onClick={() => setUploadOpen(true)}
              className='gap-1.5 shadow-sm'
            >
              <Plus className='size-4' />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4'>
          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Total Documents</span>
              <FileText className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {stats.totalDocs}
            </p>
          </Card>

          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Ready for Research</span>
              <CheckCircle2 className='size-4 text-success' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {stats.readyDocs}
            </p>
          </Card>

          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Pages Indexed</span>
              <Layers className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {stats.totalPages}
            </p>
          </Card>

          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Vector Chunks</span>
              <Database className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {stats.totalChunks}
            </p>
          </Card>
        </div>

        {/* Filter & Search Bar */}
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='relative w-full max-w-sm'>
            <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              type='text'
              placeholder='Search by document name...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='pl-9 text-sm'
            />
          </div>

          <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
            {(['all', 'ready', 'processing', 'error'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'secondary' : 'ghost'}
                size='xs'
                onClick={() => setStatusFilter(status)}
                className='capitalize text-xs'
              >
                {status}
                {status === 'all' && ` (${documents.length})`}
                {status !== 'all' && ` (${documents.filter((d) => d.status === status).length})`}
              </Button>
            ))}
          </div>
        </div>

        {/* Documents Grid / Table */}
        {filteredDocs.length === 0 ? (
          <Card className='flex flex-col items-center justify-center p-12 text-center border-dashed border-border/80'>
            <span className='flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
              <FileText className='size-6' />
            </span>
            <h3 className='mt-4 font-heading text-base font-semibold'>No documents found</h3>
            <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
              {searchQuery
                ? `No documents match "${searchQuery}". Try a different keyword.`
                : 'Upload your first research paper or PDF report to start grounding AI responses.'}
            </p>
            {!searchQuery && (
              <Button size='sm' onClick={() => setUploadOpen(true)} className='mt-4 gap-1.5'>
                <Plus className='size-4' />
                Upload PDF
              </Button>
            )}
          </Card>
        ) : (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {filteredDocs.map((doc) => {
              const isReady = doc.status === 'ready';
              const isProcessing = doc.status === 'processing' || doc.status === 'queued';
              const isError = doc.status === 'error';

              return (
                <Card
                  key={doc.id}
                  className='group relative flex flex-col justify-between overflow-hidden border-border/70 bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm'
                >
                  <div>
                    {/* Top Status & Date */}
                    <div className='flex items-center justify-between gap-2'>
                      <Badge
                        variant='outline'
                        className={cn(
                          'gap-1.5 text-[11px] font-normal capitalize',
                          isReady && 'border-success/30 bg-success/10 text-success',
                          isProcessing && 'border-warning/30 bg-warning/10 text-warning',
                          isError && 'border-destructive/30 bg-destructive/10 text-destructive'
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            isReady && 'bg-success',
                            isProcessing && 'bg-warning animate-pulse',
                            isError && 'bg-destructive'
                          )}
                        />
                        {doc.status}
                      </Badge>
                      <span className='text-[11px] text-muted-foreground'>
                        {new Date(doc.uploadedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Document Title & Meta */}
                    <div className='mt-3 flex items-start gap-3'>
                      <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-foreground'>
                        <FileText className='size-5' />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <h3 className='truncate font-heading text-sm font-semibold text-foreground' title={doc.name}>
                          {doc.name}
                        </h3>
                        <p className='truncate text-xs text-muted-foreground' title={doc.fileName}>
                          {doc.fileName}
                        </p>
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div className='mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'>
                      <span className='rounded-md border border-border/70 bg-muted/40 px-2 py-0.5'>
                        {formatBytes(doc.size)}
                      </span>
                      {doc.pageCount ? (
                        <span className='rounded-md border border-border/70 bg-muted/40 px-2 py-0.5'>
                          {doc.pageCount} pages
                        </span>
                      ) : null}
                      {doc.chunkCount ? (
                        <span className='rounded-md border border-border/70 bg-muted/40 px-2 py-0.5'>
                          {doc.chunkCount} vector chunks
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className='mt-5 flex items-center justify-between border-t border-border/70 pt-3.5'>
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        onClick={() => setSelectedDocForDetails(doc)}
                        title='View details'
                        className='text-muted-foreground hover:text-foreground'
                      >
                        <Info className='size-3.5' />
                      </Button>
                      {isError && (
                        <Button
                          variant='ghost'
                          size='icon-xs'
                          onClick={() => handleRetry(doc.id)}
                          disabled={retryingId === doc.id}
                          title='Retry processing'
                          className='text-muted-foreground hover:text-foreground'
                        >
                          <RotateCcw className={cn('size-3.5', retryingId === doc.id && 'animate-spin')} />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        onClick={() => handleDelete(doc.id, doc.name)}
                        disabled={deletingId === doc.id}
                        title='Delete document'
                        className='text-muted-foreground hover:text-destructive'
                      >
                        <Trash2 className='size-3.5' />
                      </Button>
                    </div>

                    {isReady && (
                      <Link href={`/?doc=${encodeURIComponent(doc.id)}`}>
                        <Button variant='secondary' size='xs' className='gap-1 text-xs'>
                          Research in Chat
                          <ArrowRight className='size-3' />
                        </Button>
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Document Details Modal */}
        {selectedDocForDetails && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm'>
            <Card className='relative w-full max-w-lg overflow-hidden border-border bg-card p-6 shadow-xl'>
              <div className='flex items-start justify-between'>
                <div>
                  <h2 className='font-heading text-lg font-bold text-foreground'>
                    {selectedDocForDetails.name}
                  </h2>
                  <p className='text-xs text-muted-foreground'>{selectedDocForDetails.fileName}</p>
                </div>
                <Button
                  variant='ghost'
                  size='xs'
                  onClick={() => setSelectedDocForDetails(null)}
                >
                  ✕
                </Button>
              </div>

              <div className='mt-4 space-y-3 text-xs'>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>Document ID</span>
                  <span className='font-mono text-[11px]'>{selectedDocForDetails.id}</span>
                </div>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>Status</span>
                  <span className='font-semibold capitalize text-foreground'>{selectedDocForDetails.status}</span>
                </div>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>File Size</span>
                  <span>{formatBytes(selectedDocForDetails.size)}</span>
                </div>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>Total Pages</span>
                  <span>{selectedDocForDetails.pageCount || 'N/A'}</span>
                </div>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>Vector Chunks</span>
                  <span>{selectedDocForDetails.chunkCount || 'N/A'}</span>
                </div>
                <div className='flex justify-between border-b border-border/70 pb-2'>
                  <span className='text-muted-foreground'>Uploaded At</span>
                  <span>{new Date(selectedDocForDetails.uploadedAt).toLocaleString()}</span>
                </div>
                {selectedDocForDetails.statusHistory && selectedDocForDetails.statusHistory.length > 0 && (
                  <div className='pt-2'>
                    <span className='font-medium text-foreground'>Status History</span>
                    <div className='mt-2 max-h-36 overflow-y-auto space-y-1.5 rounded-lg border border-border/70 bg-muted/30 p-2.5 font-mono text-[11px]'>
                      {selectedDocForDetails.statusHistory.map((hist, i) => (
                        <div key={i} className='flex items-center justify-between gap-2'>
                          <span className='capitalize font-medium text-foreground'>{hist.status}</span>
                          <span className='text-muted-foreground'>{new Date(hist.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className='mt-6 flex justify-end gap-2'>
                <Button variant='outline' size='sm' onClick={() => setSelectedDocForDetails(null)}>
                  Close
                </Button>
                {selectedDocForDetails.status === 'ready' && (
                  <Link href={`/?doc=${encodeURIComponent(selectedDocForDetails.id)}`}>
                    <Button size='sm' className='gap-1.5'>
                      Research in Chat
                      <ArrowRight className='size-3.5' />
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Upload Modal */}
        <DocumentUploadModal
          open={uploadOpen}
          onOpenChange={(open) => {
            setUploadOpen(open);
            if (!open) fetchDocuments();
          }}
          onUploadSuccess={fetchDocuments}
        />
      </div>
    </DashboardLayout>
  );
}
