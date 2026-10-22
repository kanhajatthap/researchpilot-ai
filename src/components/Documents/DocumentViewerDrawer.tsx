'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  FileText,
  ExternalLink,
  X,
  Copy,
  Check,
  BookOpen,
  Sparkles,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import type { Citation } from '@/types/chat';
import { cn } from '@/lib/utils';

export interface DocumentViewerDrawerProps {
  citation: Citation | null;
  onClose: () => void;
  onAskAboutPage?: (prompt: string) => void;
}

export function DocumentViewerDrawer({
  citation,
  onClose,
  onAskAboutPage,
}: DocumentViewerDrawerProps) {
  const [activeTab, setActiveTab] = useState<'excerpt' | 'pdf'>('excerpt');
  const [pageContent, setPageContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!citation?.documentId) {
      setPageContent(null);
      return;
    }

    setLoadingContent(true);
    const query = citation.pageNumber
      ? `?page=${citation.pageNumber}`
      : citation.chunkId
      ? `?chunkId=${citation.chunkId}`
      : '';

    fetch(`/api/documents/${encodeURIComponent(citation.documentId)}/chunks${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.combinedText) {
          setPageContent(data.combinedText);
        } else if (data?.chunk?.text) {
          setPageContent(data.chunk.text);
        } else {
          setPageContent(citation.excerpt || 'No additional page text found.');
        }
      })
      .catch(() => {
        setPageContent(citation.excerpt || 'Failed to load page text.');
      })
      .finally(() => setLoadingContent(false));
  }, [citation]);

  if (!citation) return null;

  const pdfUrl = `/api/documents/${encodeURIComponent(citation.documentId)}/file${
    citation.pageNumber ? `#page=${citation.pageNumber}` : ''
  }`;

  const handleCopy = async () => {
    const textToCopy = citation.excerpt || pageContent || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      className='fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-border/80 bg-background/95 shadow-2xl backdrop-blur-md sm:max-w-lg md:max-w-xl lg:max-w-2xl transition-all'
    >
      {/* Header */}
      <div className='flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-6'>
        <div className='flex items-center gap-2.5 min-w-0'>
          <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-foreground'>
            <FileText className='size-4' />
          </span>
          <div className='min-w-0'>
            <h3 className='truncate font-heading text-sm font-semibold text-foreground' title={citation.documentName}>
              {citation.documentName}
            </h3>
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              {citation.pageNumber ? (
                <Badge variant='outline' className='h-4 px-1 text-[10px] font-mono'>
                  Page {citation.pageNumber}
                </Badge>
              ) : null}
              <span>·</span>
              <span>Grounded Source Citation</span>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <a
            href={pdfUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex'
            title='Open PDF in new tab'
          >
            <Button variant='ghost' size='icon-xs' className='text-muted-foreground hover:text-foreground'>
              <ExternalLink className='size-3.5' />
            </Button>
          </a>
          <Button
            variant='ghost'
            size='icon-xs'
            onClick={onClose}
            className='text-muted-foreground hover:text-foreground'
            title='Close drawer'
          >
            <X className='size-4' />
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <div className='flex items-center justify-between border-b border-border/70 px-4 py-2 sm:px-6 bg-muted/20'>
        <div className='flex items-center gap-1'>
          <Button
            variant={activeTab === 'excerpt' ? 'secondary' : 'ghost'}
            size='xs'
            onClick={() => setActiveTab('excerpt')}
            className='gap-1.5 text-xs'
          >
            <BookOpen className='size-3.5' />
            Highlights &amp; Page Text
          </Button>
          <Button
            variant={activeTab === 'pdf' ? 'secondary' : 'ghost'}
            size='xs'
            onClick={() => setActiveTab('pdf')}
            className='gap-1.5 text-xs'
          >
            <FileText className='size-3.5' />
            Live PDF Viewer
          </Button>
        </div>

        <div className='flex items-center gap-1 text-xs'>
          <Button
            variant='ghost'
            size='xs'
            onClick={handleCopy}
            className='gap-1 text-xs text-muted-foreground hover:text-foreground'
          >
            {copied ? <Check className='size-3 text-success' /> : <Copy className='size-3' />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className='flex-1 overflow-y-auto p-4 sm:p-6'>
        {activeTab === 'excerpt' ? (
          <div className='space-y-5'>
            {/* Cited Excerpt Callout */}
            <div>
              <div className='flex items-center justify-between pb-1.5'>
                <span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                  Cited Excerpt
                </span>
                {citation.pageNumber && (
                  <span className='font-mono text-xs text-muted-foreground'>
                    Source page: {citation.pageNumber}
                  </span>
                )}
              </div>
              <Card className='relative overflow-hidden border-warning/40 bg-warning/5 p-4 text-xs leading-relaxed text-foreground shadow-sm'>
                <div className='absolute left-0 top-0 bottom-0 w-1 bg-warning' />
                <p className='font-medium pl-1'>{citation.excerpt || 'Referenced document excerpt'}</p>
                {citation.reason && (
                  <p className='mt-2 pl-1 text-[11px] text-muted-foreground italic'>
                    Context: {citation.reason}
                  </p>
                )}
              </Card>
            </div>

            {/* Full Page Context */}
            <div>
              <div className='flex items-center justify-between pb-1.5'>
                <span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                  Full Page Content
                </span>
                {loadingContent && (
                  <span className='text-xs text-muted-foreground animate-pulse'>Loading page...</span>
                )}
              </div>

              <div className='rounded-xl border border-border/70 bg-card p-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans max-h-[460px] overflow-y-auto'>
                {pageContent || 'Loading context from indexed document...'}
              </div>
            </div>

            {/* Quick Action Button */}
            {onAskAboutPage && citation.pageNumber && (
              <div className='pt-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    onAskAboutPage(
                      `Please analyze page ${citation.pageNumber} of ${citation.documentName} in detail.`
                    )
                  }
                  className='w-full gap-1.5 text-xs'
                >
                  <Sparkles className='size-3.5' />
                  Ask Agent to analyze this page
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Live PDF Viewer Iframe */
          <div className='flex h-full min-h-[500px] flex-col rounded-xl border border-border/70 bg-muted/10 overflow-hidden'>
            <iframe
              src={pdfUrl}
              title={`PDF Viewer - ${citation.documentName}`}
              className='h-full w-full border-0'
            />
            <div className='border-t border-border/60 bg-card p-2 text-center text-xs text-muted-foreground'>
              <span>
                Embedded PDF viewer. If not visible,{' '}
                <a
                  href={pdfUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary underline'
                >
                  click here to open PDF
                </a>
                .
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
