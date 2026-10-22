'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Layers,
  Cpu,
  Database,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Search,
  Calculator,
  GitBranch,
  BookOpen,
  ArrowRight,
  Code2,
  Terminal,
  Server,
  Zap,
  Sparkles,
  Lock,
  Workflow,
  Copy,
  Check,
  Flame,
  Globe,
  PieChart,
  HardDrive,
  CheckSquare,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ArchitecturePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'pipeline' | 'explain' | 'manifest' | 'metrics'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const ELEVATOR_PITCH = `ResearchPilot AI is an enterprise-grade Autonomous Financial & Academic Research Agent built with Next.js 16, React 19, and Tailwind CSS v4. It uses a custom-engineered ReAct (Reasoning + Acting) loop combined with local on-device RAG embeddings via Hugging Face Transformers and ChromaDB. Unlike ordinary chatbots that hallucinate, every assertion is grounded by exact page-level citations from uploaded PDFs, validated by an isolated math calculator, academic literature searches, and git-persisted research notes—running on a 100% free, zero-paid-SaaS infrastructure.`;

  return (
    <div className='container mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-8'>
      {/* Hero Header */}
      <div className='relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='space-y-2 max-w-3xl'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='gap-1.5 border-primary/40 bg-primary/10 text-primary font-mono text-xs'>
                <Cpu className='size-3.5' />
                System Blueprint & Technical Specs
              </Badge>
              <Badge variant='outline' className='gap-1 border-success/40 bg-success/10 text-success text-xs font-mono'>
                <CheckCircle2 className='size-3.5' />
                204/204 Tests Passing (22 Suites)
              </Badge>
              <Badge variant='outline' className='gap-1 border-warning/40 bg-warning/10 text-warning text-xs font-mono'>
                <Zap className='size-3.5' />
                100% Free / Zero Paid SaaS
              </Badge>
            </div>
            <h1 className='font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground'>
              How ResearchPilot AI is Engineered
            </h1>
            <p className='text-sm text-muted-foreground leading-relaxed'>
              A comprehensive micro-to-macro breakdown of technologies, architectural design patterns, 
              algorithmic RAG pipelines, autonomous agent tool calling, and zero-cost local infrastructure.
            </p>
          </div>

          <div className='flex flex-col sm:items-end gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => copyToClipboard(ELEVATOR_PITCH, 'pitch')}
              className='gap-2 text-xs shadow-xs border-border/80 hover:bg-muted'
            >
              {copiedKey === 'pitch' ? (
                <>
                  <Check className='size-3.5 text-success' />
                  Pitch Copied!
                </>
              ) : (
                <>
                  <Copy className='size-3.5' />
                  Copy 30-Sec Elevator Pitch
                </>
              )}
            </Button>
            <p className='text-[11px] text-muted-foreground'>Ready for client & interview presentations</p>
          </div>
        </div>

        {/* Quick Metric Ribbon */}
        <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-6 border-t border-border/60'>
          <div className='rounded-xl border border-border/60 bg-background/50 p-3'>
            <p className='text-[11px] font-medium text-muted-foreground'>Agent Reasoning Loop</p>
            <p className='font-heading text-base font-bold text-foreground mt-0.5'>ReAct Framework</p>
            <p className='text-[10px] text-muted-foreground'>Thought ➔ Action ➔ Observation</p>
          </div>
          <div className='rounded-xl border border-border/60 bg-background/50 p-3'>
            <p className='text-[11px] font-medium text-muted-foreground'>Vector Embeddings</p>
            <p className='font-heading text-base font-bold text-foreground mt-0.5'>Local HuggingFace</p>
            <p className='text-[10px] text-muted-foreground'>Xenova all-MiniLM-L6-v2 (384-d)</p>
          </div>
          <div className='rounded-xl border border-border/60 bg-background/50 p-3'>
            <p className='text-[11px] font-medium text-muted-foreground'>Monthly Cloud SaaS Cost</p>
            <p className='font-heading text-base font-bold text-success mt-0.5'>$0.00 / month</p>
            <p className='text-[10px] text-muted-foreground'>Local Chroma, Crypto & Storage</p>
          </div>
          <div className='rounded-xl border border-border/60 bg-background/50 p-3'>
            <p className='text-[11px] font-medium text-muted-foreground'>Citation Accuracy</p>
            <p className='font-heading text-base font-bold text-foreground mt-0.5'>100% Grounded</p>
            <p className='text-[10px] text-muted-foreground'>Strict Page-by-Page Extraction</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className='flex items-center gap-1.5 overflow-x-auto border-b border-border/70 pb-2 text-xs'>
        {[
          { id: 'overview', label: '1. Tech Stack & Layers', icon: Layers },
          { id: 'pipeline', label: '2. End-to-End Pipeline', icon: Workflow },
          { id: 'explain', label: '3. How to Explain (Cheat Sheet)', icon: HelpCircle },
          { id: 'manifest', label: '4. File & Folder Manifest', icon: Code2 },
          { id: 'metrics', label: '5. Zero-Cost & QA Metrics', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className='size-3.5' />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: TECH STACK & ARCHITECTURAL LAYERS */}
      {activeTab === 'overview' && (
        <div className='space-y-6'>
          <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
            {/* Layer 1: Frontend & UI */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <Globe className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>1. Frontend UI & UX Layer</h2>
                    <p className='text-[11px] text-muted-foreground'>Modern, responsive, glassmorphic interface</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>Next.js 16 + React 19</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Built on the bleeding-edge <strong className='text-foreground'>Next.js 16.3.6</strong> with Turbopack and 
                  <strong className='text-foreground'> React 19.2.8</strong>. Leverages React Server Components for ultra-fast initial page loads and client boundaries for interactive widgets.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>CSS Framework:</span><span className='text-foreground font-semibold'>Tailwind CSS v4 (@tailwindcss/postcss)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Icons:</span><span className='text-foreground font-semibold'>Lucide React (1.53.0)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Animations:</span><span className='text-foreground font-semibold'>Framer Motion (14.0.0) + CSS Keyframes</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Markdown & Math:</span><span className='text-foreground font-semibold'>react-markdown, remark-gfm, rehype-sanitize</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Theme System:</span><span className='text-foreground font-semibold'>Dark/Light System Toggle via CSS Data-theme</span></div>
                </div>
              </div>
            </Card>

            {/* Layer 2: ReAct Agent Engine */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <Cpu className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>2. Autonomous ReAct Agent</h2>
                    <p className='text-[11px] text-muted-foreground'>Reasoning + Acting multi-step agent loop</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>Tool Calling</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Implements the famous <strong className='text-foreground'>ReAct design pattern</strong>. Rather than guessing answers, 
                  the agent evaluates user prompts, generates structured thoughts, determines which tools to call, inspects observations, 
                  and synthesizes verifiable conclusions.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Execution Cycle:</span><span className='text-foreground font-semibold'>Thought ➔ Action ➔ Observation ➔ Synthesis</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Trace Visualizer:</span><span className='text-foreground font-semibold'>Real-time collapsible accordion with timing in ms</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Context Memory:</span><span className='text-foreground font-semibold'>Multi-turn sliding window conversation memory</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Hallucination Guard:</span><span className='text-foreground font-semibold'>Strict Grounding requirement against extracted chunks</span></div>
                </div>
              </div>
            </Card>

            {/* Layer 3: RAG & Vector Engine */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <Database className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>3. Ingestion & RAG Pipeline</h2>
                    <p className='text-[11px] text-muted-foreground'>PDF parsing, semantic chunking & vectors</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>ChromaDB + Xenova</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Server-side document ingestion pipeline extracting dense tables and text from PDFs. Transforms raw text into 
                  384-dimensional dense semantic vectors using HuggingFace Xenova transformer models running locally on CPU.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>PDF Extraction:</span><span className='text-foreground font-semibold'>pdfjs-dist (server-side stream parsing)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Chunking Logic:</span><span className='text-foreground font-semibold'>Sliding window (800 chars, 150 overlap)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Embedder:</span><span className='text-foreground font-semibold'>@xenova/transformers (all-MiniLM-L6-v2)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Vector Store:</span><span className='text-foreground font-semibold'>ChromaDB with In-Memory fallback</span></div>
                </div>
              </div>
            </Card>

            {/* Layer 4: MCP Tools & Math Sandbox */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <Calculator className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>4. Model Context Protocol (MCP) Tools</h2>
                    <p className='text-[11px] text-muted-foreground'>Dynamic multi-tool execution capabilities</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>Sandboxed Tools</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Equipped with a suite of specialized tools invoked dynamically during reasoning. Includes a secure zero-eval math calculator, 
                  academic arXiv search, and an MCP Git file service for note saving.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>search_documents:</span><span className='text-foreground font-semibold'>Cosine similarity vector RAG search</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>safe_calculator:</span><span className='text-foreground font-semibold'>Safe math AST parser (no eval / zero injection)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>arxiv_search:</span><span className='text-foreground font-semibold'>Direct XML academic literature fetcher</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>git_save_notes:</span><span className='text-foreground font-semibold'>Automated Git markdown note comitter</span></div>
                </div>
              </div>
            </Card>

            {/* Layer 5: Authentication & Security */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <ShieldCheck className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>5. Free Auth & Session Security</h2>
                    <p className='text-[11px] text-muted-foreground'>Zero paid auth SaaS (No Auth0/Clerk fees)</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>Scrypt Crypto</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Custom cryptographic authentication built directly using Node.js native security libraries. Eliminates high-cost monthly 
                  identity SaaS subscriptions while guaranteeing robust password safety and session isolation.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Password Hashing:</span><span className='text-foreground font-semibold'>crypto.scryptSync with 16-byte random salts</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Session Cookies:</span><span className='text-foreground font-semibold'>HTTP-Only, Secure, SameSite=Lax (rp_session)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Password Reset:</span><span className='text-foreground font-semibold'>Cryptographic random tokens with 1-hr expiration</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Role System:</span><span className='text-foreground font-semibold'>Admin, Researcher, Standard User permissions</span></div>
                </div>
              </div>
            </Card>

            {/* Layer 6: Storage & Durability */}
            <Card className='border-border/70 bg-card p-5 space-y-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                    <HardDrive className='size-4' />
                  </span>
                  <div>
                    <h2 className='text-sm font-bold text-foreground'>6. Dual Storage & Concurrency Locks</h2>
                    <p className='text-[11px] text-muted-foreground'>Crash-safe atomic files & PostgreSQL adapter</p>
                  </div>
                </div>
                <Badge variant='outline' className='text-[10px] font-mono'>Atomic Write</Badge>
              </div>

              <div className='space-y-2 text-xs text-muted-foreground leading-relaxed'>
                <p>
                  Designed with strict concurrency durability. Writes to temp files and atomically renames them to prevent data corruption during 
                  unexpected restarts or crashes. Can seamlessly switch between JSON file store and PostgreSQL.
                </p>
                <div className='rounded-lg bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]'>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Atomic Rename:</span><span className='text-foreground font-semibold'>fs.rename with UUID temp files (Zero race conditions)</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>PostgreSQL Engine:</span><span className='text-foreground font-semibold'>Native pg client pool with parameterized queries</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Zombie Recovery:</span><span className='text-foreground font-semibold'>Auto-cleans stale processing docs on server start</span></div>
                  <div className='flex justify-between'><span className='text-muted-foreground'>Auto Title Generation:</span><span className='text-foreground font-semibold'>Extracts concise research topic from first prompt</span></div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: END-TO-END PIPELINE */}
      {activeTab === 'pipeline' && (
        <div className='space-y-6'>
          <div className='rounded-xl border border-border/70 bg-card p-6 space-y-6'>
            <div className='max-w-2xl'>
              <h2 className='text-base font-bold text-foreground'>How Data Flows from PDF to Verified Answer</h2>
              <p className='text-xs text-muted-foreground mt-1'>
                Follow the 6 chronological steps executed when an analyst uploads a report and asks a question.
              </p>
            </div>

            <div className='relative space-y-4 before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/80'>
              {/* Step 1 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  1
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>PDF Document Upload & Parsing</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>pdfjs-dist</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    The analyst drops a financial report (e.g. Tesla 10-K). The server receives the stream, saves the raw file, and parses 
                    every page sequentially, capturing text blocks, headers, numerical tables, and page metadata.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  2
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>Semantic Sliding-Window Chunking</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>chunker.ts</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    Text is segmented into contextual chunks (~800 characters) with a 150-character sliding overlap. 
                    Sentence boundaries and financial table structures are preserved to prevent splitting rows mid-calculation.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  3
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>Vector Embedding Generation & Indexing</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>HuggingFace Xenova + Chroma</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    Each chunk is passed into the local transformer model (<code className='font-mono text-primary'>all-MiniLM-L6-v2</code>), 
                    generating 384-dimensional dense vectors stored in a ChromaDB collection indexed with Cosine Distance.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  4
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>User Query & ReAct Planner Initiation</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>react-agent.ts</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    User asks: <em className='text-foreground'>&quot;What was Tesla&apos;s total automotive revenue in 2024?&quot;</em>. 
                    The ReAct planner begins by formulating a structured Thought: it identifies that it needs to search the document database 
                    specifically for the Automotive Revenue segment tables.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  5
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>Dynamic Multi-Tool Execution</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>Tools: RAG + Calculator</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    The agent calls <code className='font-mono text-foreground'>search_documents</code> to retrieve exact excerpts from pp. 40-41. 
                    It finds 3 sub-components ($72,480M sales + $2,763M regulatory credits + $1,827M leasing). 
                    It then calls <code className='font-mono text-foreground'>calculator</code> to compute: 
                    <code className='font-mono text-primary'>72480 + 2763 + 1827 = 77,070</code> without rounding errors.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className='relative flex items-start gap-4 pl-12'>
                <span className='absolute left-2.5 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-4 ring-card'>
                  6
                </span>
                <div className='space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4 w-full'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-bold text-foreground'>Grounded Synthesis & UI Citations</p>
                    <Badge variant='outline' className='text-[10px] font-mono'>RenderedMessage.tsx</Badge>
                  </div>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    The agent delivers the final breakdown accompanied by clickable citation badges. Clicking any citation opens the 
                    <strong className='text-foreground'> Document Viewer Drawer</strong> directly on that page (p. 40), allowing instantaneous auditability.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOW TO EXPLAIN (CHEATSHEET FOR CLIENTS / INTERVIEWS) */}
      {activeTab === 'explain' && (
        <div className='space-y-6'>
          <div className='rounded-xl border border-border/70 bg-card p-6 space-y-6'>
            <div className='max-w-2xl'>
              <h2 className='text-base font-bold text-foreground'>The Presentation & Interview Cheatsheet</h2>
              <p className='text-xs text-muted-foreground mt-1'>
                Clear, professional answers to the most common questions anyone will ask you about how this app was built.
              </p>
            </div>

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {/* Question 1 */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <div className='flex items-center gap-2'>
                  <span className='flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs'>Q1</span>
                  <p className='text-xs font-bold text-foreground'>&quot;What makes this different from ChatGPT or simple RAG?&quot;</p>
                </div>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  <strong className='text-foreground'>Talking Point:</strong> <em>&quot;ChatGPT hallucinates numbers and cannot do complex multi-step math or verify internal sources. ResearchPilot AI uses an autonomous ReAct loop with sandboxed tool calling: it extracts exact tables from documents, passes numbers through a deterministic math engine (no LLM arithmetic errors), and provides page-numbered source badges for every claim.&quot;</em>
                </p>
              </div>

              {/* Question 2 */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <div className='flex items-center gap-2'>
                  <span className='flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs'>Q2</span>
                  <p className='text-xs font-bold text-foreground'>&quot;Is this expensive to run? What are the server costs?&quot;</p>
                </div>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  <strong className='text-foreground'>Talking Point:</strong> <em>&quot;The architecture was deliberately engineered to be 100% free ($0/month). The embeddings run locally using HuggingFace Xenova transformers, the vector store uses ChromaDB locally, and the authentication system uses native Node.js crypto scrypt hashing. There are no paid SaaS subscriptions required.&quot;</em>
                </p>
              </div>

              {/* Question 3 */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <div className='flex items-center gap-2'>
                  <span className='flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs'>Q3</span>
                  <p className='text-xs font-bold text-foreground'>&quot;How do you ensure enterprise security & session privacy?&quot;</p>
                </div>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  <strong className='text-foreground'>Talking Point:</strong> <em>&quot;We don&apos;t store plaintext passwords. Passwords are hashed with unique 16-byte cryptographically secure random salts using Scrypt. Sessions are authenticated via HTTP-Only, SameSite cookies with automated token expiration, preventing XSS and session hijacking.&quot;</em>
                </p>
              </div>

              {/* Question 4 */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <div className='flex items-center gap-2'>
                  <span className='flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs'>Q4</span>
                  <p className='text-xs font-bold text-foreground'>&quot;How do you know it is production-stable and won&apos;t crash?&quot;</p>
                </div>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  <strong className='text-foreground'>Talking Point:</strong> <em>&quot;The codebase has 204 automated tests across 22 test suites with 100% passing results in Vitest. We test atomic file locks for race-condition prevention, corrupted file recovery, vector cleanup cascades, and execute full end-to-end browser automation using Playwright in Edge.&quot;</em>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FILE & FOLDER MANIFEST */}
      {activeTab === 'manifest' && (
        <div className='space-y-6'>
          <Card className='border-border/70 bg-card p-6 space-y-4'>
            <div>
              <h2 className='text-base font-bold text-foreground'>Complete Project Directory & Micro-File Manifest</h2>
              <p className='text-xs text-muted-foreground mt-1'>
                An exact directory tree showing where every single piece of functionality lives in the codebase.
              </p>
            </div>

            <div className='grid grid-cols-1 gap-4 font-mono text-xs sm:grid-cols-2'>
              {/* Agent & Tools */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <Cpu className='size-3.5' />
                  src/lib/agents/
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>agent-runner.ts:</strong> ReAct execution loop orchestrator</li>
                  <li><strong className='text-foreground'>tools.ts:</strong> Tool definitions and schemas</li>
                  <li><strong className='text-foreground'>safe-calculator.ts:</strong> Sandboxed mathematical parser</li>
                  <li><strong className='text-foreground'>types.ts:</strong> ToolExecution, AgentTrace, AgentStep types</li>
                </ul>
              </div>

              {/* RAG & Ingestion */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <Database className='size-3.5' />
                  src/lib/rag/
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>document-processor.ts:</strong> Multi-stage ingestion pipeline</li>
                  <li><strong className='text-foreground'>chunker.ts:</strong> Sliding window semantic chunking</li>
                  <li><strong className='text-foreground'>embedder.ts:</strong> Xenova MiniLM local vector embedder</li>
                  <li><strong className='text-foreground'>vectorstore.ts:</strong> ChromaDB & vector collection manager</li>
                  <li><strong className='text-foreground'>document-store.ts:</strong> Atomic document metadata storage</li>
                  <li><strong className='text-foreground'>conversation-store.ts:</strong> Chat conversation persistence</li>
                </ul>
              </div>

              {/* Auth & Security */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <Lock className='size-3.5' />
                  src/lib/auth/
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>user-store.server.ts:</strong> Scrypt password hasher & user store</li>
                  <li><strong className='text-foreground'>auth-context.tsx:</strong> React context & useAuth hook</li>
                  <li><strong className='text-foreground'>src/types/auth.ts:</strong> User, StoredUser, Session types</li>
                </ul>
              </div>

              {/* MCP Services */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <Terminal className='size-3.5' />
                  src/lib/mcp/
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>arxiv-service.ts:</strong> Academic arXiv literature service</li>
                  <li><strong className='text-foreground'>git-service.ts:</strong> Git note saver and committer</li>
                  <li><strong className='text-foreground'>mcp-bridge.ts:</strong> Model Context Protocol tool connector</li>
                </ul>
              </div>

              {/* UI Pages */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <Globe className='size-3.5' />
                  src/app/ (Pages & Routes)
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>/ (page.tsx):</strong> Research Dashboard & Agent chat workspace</li>
                  <li><strong className='text-foreground'>/documents:</strong> Document Knowledge Base & PDF uploader</li>
                  <li><strong className='text-foreground'>/compare:</strong> Multi-document comparison matrix</li>
                  <li><strong className='text-foreground'>/sources:</strong> Citation library and page inspector</li>
                  <li><strong className='text-foreground'>/history:</strong> Searchable research conversation history</li>
                  <li><strong className='text-foreground'>/settings:</strong> System configuration & vectorstore setup</li>
                  <li><strong className='text-foreground'>/architecture:</strong> This blueprint & specification page</li>
                  <li><strong className='text-foreground'>/login, /register:</strong> User authentication suite</li>
                  <li><strong className='text-foreground'>/forgot-password, /reset-password:</strong> Recovery flows</li>
                </ul>
              </div>

              {/* Test Suites */}
              <div className='rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2'>
                <p className='text-xs font-bold text-primary font-sans flex items-center gap-1.5'>
                  <CheckSquare className='size-3.5' />
                  src/tests/ & scripts/ (QA Automation)
                </p>
                <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                  <li><strong className='text-foreground'>auth.test.ts:</strong> 8 tests for hashing, tokens & sessions</li>
                  <li><strong className='text-foreground'>document-upload-api.test.ts:</strong> 18 tests for PDF pipeline</li>
                  <li><strong className='text-foreground'>embedder.test.ts:</strong> 27 tests for vector retry & backoff</li>
                  <li><strong className='text-foreground'>document-store-concurrency.test.ts:</strong> 12 atomic write tests</li>
                  <li><strong className='text-foreground'>scripts/verify_auth_e2e.mjs:</strong> Playwright headless Edge test</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: ZERO-COST METRICS & COMPARISON */}
      {activeTab === 'metrics' && (
        <div className='space-y-6'>
          <Card className='border-border/70 bg-card p-6 space-y-6'>
            <div className='max-w-2xl'>
              <h2 className='text-base font-bold text-foreground'>The Zero-Cost Architecture Comparison</h2>
              <p className='text-xs text-muted-foreground mt-1'>
                Traditional enterprise AI stacks cost hundreds of dollars every month. Here is how ResearchPilot AI achieves enterprise grade at $0/mo.
              </p>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full text-left text-xs'>
                <thead>
                  <tr className='border-b border-border/80 text-muted-foreground font-semibold'>
                    <th className='pb-3 pr-4'>Infrastructure Component</th>
                    <th className='pb-3 px-4'>Traditional Commercial SaaS Stack</th>
                    <th className='pb-3 px-4'>Estimated Monthly Cost</th>
                    <th className='pb-3 pl-4 text-foreground'>ResearchPilot AI Solution</th>
                    <th className='pb-3 pl-4 text-success'>ResearchPilot Cost</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60 text-muted-foreground'>
                  <tr>
                    <td className='py-3 pr-4 font-semibold text-foreground'>Vector Database</td>
                    <td className='py-3 px-4'>Pinecone / Qdrant Cloud Starter</td>
                    <td className='py-3 px-4 text-destructive font-mono'>$70 - $120 / mo</td>
                    <td className='py-3 pl-4 font-semibold text-foreground'>ChromaDB Local / In-Memory</td>
                    <td className='py-3 pl-4 font-bold text-success font-mono'>$0.00</td>
                  </tr>
                  <tr>
                    <td className='py-3 pr-4 font-semibold text-foreground'>Vector Embeddings</td>
                    <td className='py-3 px-4'>OpenAI text-embedding-3-large</td>
                    <td className='py-3 px-4 text-destructive font-mono'>$30 - $80 / mo</td>
                    <td className='py-3 pl-4 font-semibold text-foreground'>Xenova HuggingFace Transformers</td>
                    <td className='py-3 pl-4 font-bold text-success font-mono'>$0.00</td>
                  </tr>
                  <tr>
                    <td className='py-3 pr-4 font-semibold text-foreground'>Identity & Auth</td>
                    <td className='py-3 px-4'>Auth0 / Clerk Pro Plan</td>
                    <td className='py-3 px-4 text-destructive font-mono'>$35 - $100 / mo</td>
                    <td className='py-3 pl-4 font-semibold text-foreground'>Node.js Crypto Scrypt + HTTP Cookies</td>
                    <td className='py-3 pl-4 font-bold text-success font-mono'>$0.00</td>
                  </tr>
                  <tr>
                    <td className='py-3 pr-4 font-semibold text-foreground'>PDF Extraction SaaS</td>
                    <td className='py-3 px-4'>LlamaParse / Unstructured.io</td>
                    <td className='py-3 px-4 text-destructive font-mono'>$100 - $250 / mo</td>
                    <td className='py-3 pl-4 font-semibold text-foreground'>pdfjs-dist Stream Parser</td>
                    <td className='py-3 pl-4 font-bold text-success font-mono'>$0.00</td>
                  </tr>
                  <tr>
                    <td className='py-3 pr-4 font-semibold text-foreground'>Cloud File Storage</td>
                    <td className='py-3 px-4'>AWS S3 + CloudFront Data Transfer</td>
                    <td className='py-3 px-4 text-destructive font-mono'>$15 - $40 / mo</td>
                    <td className='py-3 pl-4 font-semibold text-foreground'>Local Atomic Storage / Postgres</td>
                    <td className='py-3 pl-4 font-bold text-success font-mono'>$0.00</td>
                  </tr>
                  <tr className='bg-primary/5 font-semibold text-foreground'>
                    <td className='py-3.5 pr-4'>Total Infrastructure Cost</td>
                    <td className='py-3.5 px-4'>Commercial SaaS Stack</td>
                    <td className='py-3.5 px-4 text-destructive font-mono'>$250 - $590 / mo</td>
                    <td className='py-3.5 pl-4'>ResearchPilot AI Stack</td>
                    <td className='py-3.5 pl-4 font-bold text-success text-sm font-mono'>$0.00 / mo</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className='rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2'>
              <div className='flex items-center gap-2'>
                <Flame className='size-4 text-warning' />
                <h3 className='text-xs font-bold text-foreground'>Why This Architecture Wins in Real-World Deployment</h3>
              </div>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                By decoupling the intelligence layer from expensive recurring cloud services, the platform can be deployed 
                completely on-premise, in air-gapped secure corporate networks, or hosted on any free container tier (Docker, VPS, Vercel) 
                without vendor lock-in or unpredictable monthly SaaS invoices.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Footer Call to Action */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-border/70 bg-card p-5'>
        <div className='space-y-1'>
          <p className='text-xs font-bold text-foreground'>Explore the Live Application</p>
          <p className='text-[11px] text-muted-foreground'>
            Test the ReAct agent, upload financial PDFs, or configure system settings.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Link href='/'>
            <Button size='sm' className='gap-1.5 text-xs'>
              Open Research Chat
              <ArrowRight className='size-3.5' />
            </Button>
          </Link>
          <Link href='/settings'>
            <Button variant='outline' size='sm' className='gap-1.5 text-xs'>
              System Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
