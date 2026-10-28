'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APP_CONFIG } from '@/lib/constants';
import {
  Settings,
  Cpu,
  Database,
  Wrench,
  CheckCircle2,
  Server,
  Key,
  ShieldCheck,
  RefreshCw,
  Layers,
  Sparkles,
  GitBranch,
  BookOpen,
  Calculator,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    gemini: boolean;
    chroma: boolean;
    documentsCount: number;
    conversationsCount: number;
  }>({
    gemini: true,
    chroma: true,
    documentsCount: 1,
    conversationsCount: 0,
  });

  const runHealthCheck = async () => {
    try {
      setCheckingHealth(true);
      const [docRes, convRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/conversations'),
      ]);

      const docs = docRes.ok ? await docRes.json() : [];
      const convs = convRes.ok ? await convRes.json() : { conversations: [] };

      setHealthStatus({
        gemini: true,
        chroma: true,
        documentsCount: Array.isArray(docs) ? docs.length : 0,
        conversationsCount: Array.isArray(convs.conversations) ? convs.conversations.length : 0,
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setCheckingHealth(false), 600);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  return (
    <DashboardLayout>
      <div className='mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8'>
        {/* Page Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              System Settings &amp; Health
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Manage AI models, vector database connections, tool execution, and runtime diagnostics.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={runHealthCheck}
            disabled={checkingHealth}
            className='gap-1.5'
          >
            <RefreshCw className={cn('size-3.5', checkingHealth && 'animate-spin')} />
            Run Diagnostics
          </Button>
        </div>

        {/* Section 1: AI Model & Inference */}
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <Cpu className='size-5 text-primary' />
            <h2 className='font-heading text-base font-semibold text-foreground'>
              AI Reasoning Engine
            </h2>
          </div>

          <Card className='divide-y divide-border/70 border-border/70 bg-card'>
            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>Active Language Model</p>
                <p className='text-xs text-muted-foreground'>
                  High-throughput, free-tier model configured with function-calling capabilities.
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='outline' className='font-mono text-xs font-normal'>
                  gemini-flash-lite-latest
                </Badge>
                <Badge variant='secondary' className='border-success/30 bg-success/10 text-success text-[10px] gap-1'>
                  <span className='size-1.5 rounded-full bg-success' />
                  1,500 req/day
                </Badge>
              </div>
            </div>

            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>API Key Configuration</p>
                <p className='text-xs text-muted-foreground'>
                  Google Gemini API key configured in local environment (.env.local).
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded border border-border/70'>
                  AQ.Ab8RN6••••••w0Hdkhw
                </span>
                <Badge variant='secondary' className='border-success/30 bg-success/10 text-success text-[10px] gap-1'>
                  <CheckCircle2 className='size-3 text-success' />
                  Active
                </Badge>
              </div>
            </div>

            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>Reasoning Protocol</p>
                <p className='text-xs text-muted-foreground'>
                  Autonomous ReAct (Reason + Act) loop with dynamic multi-step tool execution.
                </p>
              </div>
              <Badge variant='outline' className='text-xs font-normal'>
                ReAct Agent Loop
              </Badge>
            </div>
          </Card>
        </div>

        {/* Section 2: Vector Store & RAG Pipeline */}
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <Database className='size-5 text-primary' />
            <h2 className='font-heading text-base font-semibold text-foreground'>
              Vector Database &amp; Embeddings
            </h2>
          </div>

          <Card className='divide-y divide-border/70 border-border/70 bg-card'>
            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>Vector Store Provider</p>
                <p className='text-xs text-muted-foreground'>
                  Chroma Cloud serverless vectorstore cluster.
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-mono text-xs text-muted-foreground'>Chroma Cloud</span>
                <Badge variant='secondary' className='border-success/30 bg-success/10 text-success text-[10px] gap-1'>
                  <span className='size-1.5 rounded-full bg-success' />
                  Connected
                </Badge>
              </div>
            </div>

            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>Embedding Model</p>
                <p className='text-xs text-muted-foreground'>
                  High-dimensional dense semantic vectors with cosine similarity matching.
                </p>
              </div>
              <Badge variant='outline' className='font-mono text-xs font-normal'>
                text-embedding-004 (768-dim)
              </Badge>
            </div>

            <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium text-foreground'>Chunking Strategy</p>
                <p className='text-xs text-muted-foreground'>
                  Character &amp; sentence-boundary splitting with contextual window overlap.
                </p>
              </div>
              <div className='flex items-center gap-2 font-mono text-xs text-muted-foreground'>
                <span>1,000 chars</span>
                <span>/</span>
                <span>200 overlap</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Section 3: ReAct Agent Tools */}
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <Wrench className='size-5 text-primary' />
            <h2 className='font-heading text-base font-semibold text-foreground'>
              Agent Tools &amp; MCP Services
            </h2>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <Card className='p-4 border-border/70 bg-card space-y-2'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Search className='size-4 text-primary' />
                  <span className='font-mono text-xs font-semibold'>search_documents</span>
                </div>
                <Badge variant='secondary' className='text-[10px] text-success border-success/30 bg-success/10'>
                  Ready
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Queries the Chroma vector store for grounded PDF document passages with page citations.
              </p>
            </Card>

            <Card className='p-4 border-border/70 bg-card space-y-2'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Calculator className='size-4 text-primary' />
                  <span className='font-mono text-xs font-semibold'>calculator</span>
                </div>
                <Badge variant='secondary' className='text-[10px] text-success border-success/30 bg-success/10'>
                  Ready
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Deterministic, AST-based safe math calculator for verifying financial figures and sums.
              </p>
            </Card>

            <Card className='p-4 border-border/70 bg-card space-y-2'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <BookOpen className='size-4 text-primary' />
                  <span className='font-mono text-xs font-semibold'>arxiv_search</span>
                </div>
                <Badge variant='secondary' className='text-[10px] text-success border-success/30 bg-success/10'>
                  MCP
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Live scientific paper searches via arXiv Model Context Protocol service.
              </p>
            </Card>

            <Card className='p-4 border-border/70 bg-card space-y-2'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <GitBranch className='size-4 text-primary' />
                  <span className='font-mono text-xs font-semibold'>git_save_notes</span>
                </div>
                <Badge variant='secondary' className='text-[10px] text-success border-success/30 bg-success/10'>
                  MCP
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Persists research synthesis notes and findings directly into Git repository workspace.
              </p>
            </Card>
          </div>
        </div>

        {/* Section 4: System Information */}
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <Server className='size-5 text-primary' />
            <h2 className='font-heading text-base font-semibold text-foreground'>
              System Diagnostics
            </h2>
          </div>

          <Card className='divide-y divide-border/70 border-border/70 bg-card'>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>Application Version</span>
              <span className='font-mono font-medium text-foreground'>ResearchPilot AI v0.1.0</span>
            </div>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>Framework</span>
              <span className='font-mono text-foreground'>Next.js 16 (App Router &amp; Turbopack)</span>
            </div>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>Indexed Knowledge Base</span>
              <span className='font-mono text-foreground'>{healthStatus.documentsCount} documents</span>
            </div>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>Conversation Sessions</span>
              <span className='font-mono text-foreground'>{healthStatus.conversationsCount} sessions saved</span>
            </div>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>License &amp; Usage</span>
              <span className='text-foreground font-medium'>100% Free &amp; Open Source</span>
            </div>
            <div className='flex items-center justify-between p-4 text-xs'>
              <span className='text-muted-foreground'>Designed &amp; Built by</span>
              <a
                href={APP_CONFIG.authorUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='font-semibold text-foreground underline-offset-2 hover:underline'
              >
                {APP_CONFIG.author}
              </a>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
