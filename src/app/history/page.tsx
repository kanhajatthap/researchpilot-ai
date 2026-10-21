'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  History,
  MessageSquare,
  Search,
  Trash2,
  Download,
  ArrowRight,
  Clock,
  Sparkles,
  Plus,
  RefreshCw,
  Edit2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data.conversations) ? data.conversations : []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete conversation "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      setDeletingId(id);
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } else {
        alert('Failed to delete conversation.');
      }
    } catch {
      alert('Network error while deleting conversation.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportMarkdown = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`);
      if (!res.ok) return alert('Failed to fetch conversation for export.');
      const data = await res.json();
      const messages = data.conversation?.messages || [];

      let markdown = `# ${title}\n*Exported from ResearchPilot AI on ${new Date().toLocaleString()}*\n\n---\n\n`;
      for (const msg of messages) {
        const sender = msg.role === 'user' ? '### 👤 User' : '### 🤖 ResearchPilot';
        markdown += `${sender} (${new Date(msg.createdAt).toLocaleTimeString()}):\n\n${msg.content}\n\n`;
        if (msg.citations && msg.citations.length > 0) {
          markdown += `**Citations:**\n`;
          msg.citations.forEach((c: any, i: number) => {
            markdown += `${i + 1}. **${c.documentName}** (p. ${c.pageNumber || '?'})\n`;
          });
          markdown += `\n`;
        }
        markdown += `---\n\n`;
      }

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-research.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export conversation.');
    }
  };

  const handleSaveRename = async (id: string) => {
    if (!renameText.trim()) return;
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameText.trim() }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: renameText.trim() } : c))
        );
        setRenamingId(null);
      }
    } catch {
      alert('Failed to rename conversation.');
    }
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  const totalMessages = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.messageCount || 0), 0);
  }, [conversations]);

  return (
    <DashboardLayout>
      <div className='mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              Research History
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Review, resume, and export your past research dialogues and grounded question sessions.
            </p>
          </div>
          <div className='flex items-center gap-2.5'>
            <Button
              variant='outline'
              size='sm'
              onClick={fetchConversations}
              disabled={loading}
              className='gap-1.5'
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Link href='/'>
              <Button size='sm' className='gap-1.5'>
                <Plus className='size-4' />
                New Research
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Total Sessions</span>
              <History className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {conversations.length}
            </p>
          </Card>

          <Card className='p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Messages Exchanged</span>
              <MessageSquare className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 font-heading text-2xl font-bold tracking-tight text-foreground'>
              {totalMessages}
            </p>
          </Card>

          <Card className='col-span-2 sm:col-span-1 p-4 border-border/70 bg-card/60 backdrop-blur-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Latest Activity</span>
              <Clock className='size-4 text-muted-foreground' />
            </div>
            <p className='mt-2 truncate font-heading text-sm font-semibold tracking-tight text-foreground'>
              {conversations.length > 0
                ? new Date(conversations[0].updatedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'No recent activity'}
            </p>
          </Card>
        </div>

        {/* Search */}
        <div className='relative w-full max-w-md'>
          <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='text'
            placeholder='Search research sessions by title...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9 text-sm'
          />
        </div>

        {/* Conversations List */}
        {filteredConversations.length === 0 ? (
          <Card className='flex flex-col items-center justify-center p-12 text-center border-dashed border-border/80'>
            <span className='flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
              <History className='size-6' />
            </span>
            <h3 className='mt-4 font-heading text-base font-semibold'>No conversations found</h3>
            <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
              {searchQuery
                ? `No sessions match "${searchQuery}".`
                : 'Your research history will be saved here automatically as you ask questions.'}
            </p>
            {!searchQuery && (
              <Link href='/'>
                <Button size='sm' className='mt-4 gap-1.5'>
                  <Plus className='size-4' />
                  Start First Research Session
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className='space-y-3'>
            {filteredConversations.map((conv) => {
              const isRenaming = renamingId === conv.id;

              return (
                <Card
                  key={conv.id}
                  className='flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center border-border/70 bg-card transition-all hover:border-foreground/20'
                >
                  <div className='flex items-start gap-3 min-w-0 flex-1'>
                    <span className='mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-foreground'>
                      <MessageSquare className='size-4.5' />
                    </span>
                    <div className='min-w-0 flex-1'>
                      {isRenaming ? (
                        <div className='flex items-center gap-2 max-w-md'>
                          <Input
                            type='text'
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            className='h-8 text-xs'
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(conv.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                          />
                          <Button size='xs' onClick={() => handleSaveRename(conv.id)}>
                            <Check className='size-3.5' />
                          </Button>
                        </div>
                      ) : (
                        <div className='flex items-center gap-2'>
                          <h3 className='truncate font-heading text-sm font-semibold text-foreground'>
                            {conv.title}
                          </h3>
                          <button
                            type='button'
                            onClick={() => {
                              setRenamingId(conv.id);
                              setRenameText(conv.title);
                            }}
                            title='Rename'
                            className='text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition-opacity'
                          >
                            <Edit2 className='size-3' />
                          </button>
                        </div>
                      )}

                      <div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                        <Badge variant='outline' className='h-4 px-1.5 text-[10px] font-mono'>
                          {conv.messageCount} messages
                        </Badge>
                        <span>·</span>
                        <span>
                          Updated {new Date(conv.updatedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className='flex items-center gap-2 shrink-0 self-end sm:self-center'>
                    <Button
                      variant='ghost'
                      size='xs'
                      onClick={() => handleExportMarkdown(conv.id, conv.title)}
                      title='Export to Markdown'
                      className='gap-1 text-xs text-muted-foreground hover:text-foreground'
                    >
                      <Download className='size-3.5' />
                      <span className='hidden sm:inline'>Export</span>
                    </Button>

                    <Button
                      variant='ghost'
                      size='icon-xs'
                      onClick={() => handleDelete(conv.id, conv.title)}
                      disabled={deletingId === conv.id}
                      title='Delete conversation'
                      className='text-muted-foreground hover:text-destructive'
                    >
                      <Trash2 className='size-3.5' />
                    </Button>

                    <Link href={`/?cid=${encodeURIComponent(conv.id)}`}>
                      <Button variant='secondary' size='xs' className='gap-1 text-xs'>
                        Resume
                        <ArrowRight className='size-3' />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
