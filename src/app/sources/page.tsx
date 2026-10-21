'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BookOpen,
  Search,
  FileText,
  Sparkles,
  Layers,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Filter,
  Flame,
} from 'lucide-react';
import type { Document } from '@/types/document';
import { cn } from '@/lib/utils';

interface ChunkResult {
  id: string;
  chunkId?: string;
  documentId: string;
  documentName?: string;
  text: string;
  pageNumber?: number;
  score?: number;
}

const SAMPLE_QUERIES = [
  'Total automotive revenue and sales breakdown',
  'Energy storage and generation revenues',
  'Item 1A risk factors and regulatory risks',
  'Capital expenditures and cash flows',
];

export default function SourcesPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    fetch('/api/documents')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDocuments(data.filter((d) => d.status === 'ready'));
        }
      })
      .catch(() => {});
  }, []);

  const handleSearch = useCallback(
    async (queryToRun?: string) => {
      const q = (queryToRun || searchQuery).trim();
      if (!q) return;

      try {
        setSearching(true);
        setHasSearched(true);
        const res = await fetch('/api/documents/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            documentId: selectedDocId !== 'all' ? selectedDocId : undefined,
            limit: 8,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.results)
            ? data.results
            : Array.isArray(data)
            ? data
            : [];

          // Map document name if available
          const mapped = items.map((item: any) => {
            const doc = documents.find((d) => d.id === item.documentId);
            return {
              id: item.chunkId || item.id || Math.random().toString(),
              chunkId: item.chunkId || item.id,
              documentId: item.documentId,
              documentName: doc?.name || item.documentName || 'Research Document',
              text: item.text || item.content || '',
              pageNumber: item.pageNumber || item.metadata?.pageNumber,
              score: item.score || item.similarity,
            };
          });
          setResults(mapped);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error('Vector query failed:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [searchQuery, selectedDocId, documents]
  );

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <DashboardLayout>
      <div className='mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8'>
        {/* Header */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              Sources &amp; Citations
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Inspect vector embeddings, browse extracted passages, and verify citations with page-level accuracy.
            </p>
          </div>
        </div>

        {/* Search & Scope Card */}
        <Card className='p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm space-y-4'>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className='flex flex-col gap-3 sm:flex-row'
          >
            {/* Document scope selector */}
            <div className='w-full sm:w-64'>
              <label htmlFor='doc-select' className='sr-only'>
                Document Scope
              </label>
              <select
                id='doc-select'
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className='w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
              >
                <option value='all'>All Documents ({documents.length})</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.pageCount || '?'} pages)
                  </option>
                ))}
              </select>
            </div>

            {/* Query input */}
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='text'
                placeholder='Search across vector chunks (e.g. automotive sales, lease revenue, regulatory credits)...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='pl-9 text-sm'
              />
            </div>

            <Button type='submit' disabled={searching || !searchQuery.trim()} className='gap-1.5'>
              <Sparkles className={cn('size-4', searching && 'animate-spin')} />
              {searching ? 'Querying...' : 'Search Chunks'}
            </Button>
          </form>

          {/* Sample quick queries */}
          <div className='flex flex-wrap items-center gap-1.5 pt-1'>
            <span className='flex items-center gap-1 text-[11px] font-medium text-muted-foreground'>
              <Flame className='size-3 text-warning' />
              Try:
            </span>
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type='button'
                onClick={() => {
                  setSearchQuery(q);
                  handleSearch(q);
                }}
                className='rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground'
              >
                {q}
              </button>
            ))}
          </div>
        </Card>

        {/* Search Results */}
        {searching ? (
          <div className='flex flex-col items-center justify-center py-16 text-center'>
            <span className='flex size-10 animate-spin items-center justify-center rounded-xl bg-foreground text-background'>
              <Sparkles className='size-5' />
            </span>
            <p className='mt-3 text-sm text-muted-foreground'>
              Running similarity search against Chroma Cloud vectorstore...
            </p>
          </div>
        ) : hasSearched ? (
          results.length === 0 ? (
            <Card className='flex flex-col items-center justify-center p-12 text-center border-dashed border-border/80'>
              <span className='flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
                <BookOpen className='size-6' />
              </span>
              <h3 className='mt-4 font-heading text-base font-semibold'>No matching chunks found</h3>
              <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
                No vector excerpts met the similarity threshold for "{searchQuery}". Try different search terms or select "All Documents".
              </p>
            </Card>
          ) : (
            <div className='space-y-4'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>
                  Found <strong className='text-foreground'>{results.length}</strong> relevant excerpts for &ldquo;{searchQuery}&rdquo;
                </span>
                <span>Sorted by semantic relevance</span>
              </div>

              <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                {results.map((chunk, index) => {
                  return (
                    <Card
                      key={chunk.id || index}
                      className='flex flex-col justify-between border-border/70 bg-card p-4 transition-all hover:border-foreground/20'
                    >
                      <div>
                        {/* Header info */}
                        <div className='flex items-center justify-between gap-2 border-b border-border/60 pb-2.5'>
                          <div className='flex items-center gap-2 min-w-0'>
                            <span className='flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-foreground'>
                              {index + 1}
                            </span>
                            <span className='truncate text-xs font-medium text-foreground' title={chunk.documentName}>
                              {chunk.documentName}
                            </span>
                          </div>
                          <div className='flex items-center gap-1.5 shrink-0'>
                            {chunk.pageNumber && (
                              <Badge variant='outline' className='h-5 text-[10px] font-mono'>
                                Page {chunk.pageNumber}
                              </Badge>
                            )}
                            {chunk.score !== undefined && (
                              <Badge variant='secondary' className='h-5 text-[10px] font-mono'>
                                {(chunk.score * 100).toFixed(0)}% match
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Chunk text */}
                        <div className='mt-3 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans bg-muted/20 p-3 rounded-lg border border-border/40 max-h-56 overflow-y-auto'>
                          {chunk.text}
                        </div>
                      </div>

                      {/* Footer actions */}
                      <div className='mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs'>
                        <Button
                          variant='ghost'
                          size='xs'
                          onClick={() => handleCopyText(chunk.id, chunk.text)}
                          className='gap-1 text-muted-foreground hover:text-foreground'
                        >
                          {copiedId === chunk.id ? (
                            <>
                              <Check className='size-3 text-success' />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className='size-3' />
                              <span>Copy Excerpt</span>
                            </>
                          )}
                        </Button>

                        <Link href={`/?doc=${encodeURIComponent(chunk.documentId)}`}>
                          <Button variant='secondary' size='xs' className='gap-1 text-xs'>
                            Ask in Chat
                            <ArrowRight className='size-3' />
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* Initial Overview when no search performed */
          <div className='space-y-6'>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {documents.map((doc) => (
                <Card key={doc.id} className='p-5 border-border/70 bg-card/60 space-y-3'>
                  <div className='flex items-center gap-3'>
                    <span className='flex size-9 items-center justify-center rounded-lg bg-primary/10 text-foreground'>
                      <FileText className='size-4.5' />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <h3 className='truncate font-heading text-sm font-semibold'>{doc.name}</h3>
                      <p className='text-xs text-muted-foreground'>{doc.chunkCount || 0} indexed vector chunks</p>
                    </div>
                  </div>

                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    Full-text vector index active. Use the search bar above to look up exact page citations and extracts.
                  </p>

                  <div className='pt-2 flex items-center justify-between border-t border-border/60 text-xs'>
                    <Badge variant='outline' className='text-[10px]'>
                      {doc.pageCount || 0} Pages
                    </Badge>
                    <button
                      type='button'
                      onClick={() => {
                        setSelectedDocId(doc.id);
                        setSearchQuery('Total revenue and operating results');
                        handleSearch('Total revenue and operating results');
                      }}
                      className='inline-flex items-center gap-1 text-xs text-primary hover:underline'
                    >
                      <span>Explore Chunks</span>
                      <ArrowRight className='size-3' />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
