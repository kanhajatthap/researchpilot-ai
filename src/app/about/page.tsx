import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuiltBy } from '@/components/layout';
import { APP_CONFIG } from '@/lib/constants';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  GitCompare,
  Layers,
  Lock,
  Quote,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About the Project & Author',
  description: `About ${APP_CONFIG.name} and its creator ${APP_CONFIG.author} — an agentic RAG research assistant that answers from your PDFs with page-level citations, built on a free-tier Next.js stack.`,
  keywords: [
    'About ResearchPilot AI',
    'Kanha Jatthap',
    'RAG Research Assistant',
    'Agentic AI',
    'Page-level Citations',
    'Next.js 16',
  ],
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: `About ${APP_CONFIG.name} & ${APP_CONFIG.author}`,
    description:
      'The story behind ResearchPilot AI: an agentic research assistant with page-grounded citations, and the builder behind it.',
    url: '/about',
    type: 'profile',
  },
};

/** Inline GitHub mark — lucide-react no longer ships brand icons. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      aria-hidden='true'
      className={className}
    >
      <path d='M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z' />
    </svg>
  );
}

const STATS = [
  { label: 'Automated tests', value: '209', hint: 'Vitest suites' },
  { label: 'Grounded citations', value: '100%', hint: 'Page-level sources' },
  { label: 'Infrastructure cost', value: '$0', hint: 'Free-tier stack' },
  { label: 'Current version', value: `v${APP_CONFIG.version}`, hint: 'Open source' },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Answers that show their work',
    body: 'Every response cites the exact document and page it came from, so a claim can be checked instead of trusted.',
  },
  {
    icon: Cpu,
    title: 'Agentic ReAct loop',
    body: 'The assistant reasons, picks a tool, observes the result, and repeats — searching documents, comparing sources, and calculating figures before answering.',
  },
  {
    icon: Database,
    title: 'Retrieval that respects context',
    body: 'PDFs are extracted, chunked with overlap, embedded, and stored in a vector index so long reports stay searchable instead of getting truncated.',
  },
  {
    icon: FileText,
    title: 'Built for real documents',
    body: 'Financial filings, academic papers, and reports — including large, table-heavy PDFs that break naive text extractors.',
  },
  {
    icon: GitCompare,
    title: 'Compare & verify',
    body: 'Line up findings across documents and jump back to the source page whenever a number or quote looks suspicious.',
  },
  {
    icon: Lock,
    title: 'Private by default',
    body: 'Accounts are protected with scrypt password hashing and signed session cookies; stored work is isolated per account.',
  },
];

const STACK_GROUPS = [
  {
    title: 'Frontend',
    icon: Layers,
    items: ['Next.js 16 App Router', 'React 19', 'TypeScript', 'Tailwind CSS v4', 'shadcn/ui'],
  },
  {
    title: 'AI & retrieval',
    icon: Cpu,
    items: ['ReAct agent', 'Gemini embeddings', 'ChromaDB', 'pdfjs-dist', 'Markdown + math rendering'],
  },
  {
    title: 'Data & security',
    icon: Server,
    items: ['Postgres (pg)', 'Vercel Blob', 'scrypt auth', 'Edge proxy', 'Vitest test suite'],
  },
];

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Verifiable over convincing',
    body: 'A confident answer without a source is a liability. Citations are part of the product, not an add-on.',
  },
  {
    icon: Zap,
    title: 'Useful without a budget',
    body: 'Free-tier services, careful batching, and boring infrastructure keep the whole platform runnable at zero cost.',
  },
  {
    icon: BookOpen,
    title: 'Depth over decoration',
    body: 'The interface stays quiet so the document, the reasoning, and the evidence remain the focus.',
  },
];

export default function AboutPage() {
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: APP_CONFIG.author,
    url: APP_CONFIG.authorUrl,
    jobTitle: 'Designer & Developer',
    description: `Designer and developer of ${APP_CONFIG.name}.`,
    knowsAbout: [
      'Retrieval-Augmented Generation',
      'Agentic AI',
      'Next.js',
      'TypeScript',
      'Vector Databases',
    ],
    sameAs: [APP_CONFIG.authorUrl],
  };

  return (
    <div className='relative min-h-screen bg-background pb-20 text-foreground selection:bg-primary/20'>
      {/* Background Decorative Mesh Pattern */}
      <div className='pointer-events-none absolute inset-0 -z-10 rp-dot-grid opacity-30 dark:opacity-20' />
      <div className='pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-full max-w-7xl -translate-x-1/2 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl' />

      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      <div className='container mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8'>
        {/* Breadcrumb */}
        <div className='flex items-center gap-2 border-b border-border/70 pb-4 text-sm text-muted-foreground sm:text-base'>
          <Link href='/' className='transition-colors hover:text-foreground'>
            Workspace
          </Link>
          <ChevronRight className='size-4' />
          <span className='font-semibold text-foreground'>About</span>
        </div>

        {/* Hero + author card */}
        <section className='relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card/95 via-card/80 to-primary/5 p-6 shadow-xl backdrop-blur-xl sm:p-10'>
          <div className='flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between'>
            <div className='max-w-3xl space-y-5'>
              <div className='flex flex-wrap items-center gap-2.5'>
                <Badge
                  variant='outline'
                  className='gap-2 border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs font-medium text-primary'
                >
                  <Sparkles className='size-3.5' />
                  About the project
                </Badge>
                <Badge
                  variant='outline'
                  className='gap-1.5 border-success/40 bg-success/10 px-3 py-1.5 font-mono text-xs font-medium text-success'
                >
                  <CheckCircle2 className='size-3.5' />
                  Open source · v{APP_CONFIG.version}
                </Badge>
              </div>

              <h1 className='font-heading text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl'>
                Research that shows its work.
              </h1>

              <p className='max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
                {APP_CONFIG.name} is an agentic research assistant. Upload the documents you
                actually care about — filings, papers, reports — and ask questions. Instead of
                guessing, it retrieves the relevant passages, reasons through them, and answers with
                the exact pages it used.
              </p>

              <div className='flex flex-wrap items-center gap-3'>
                <Link href='/'>
                  <Button className='gap-2 px-5 py-2.5 text-sm font-semibold shadow-md sm:text-base'>
                    Open the workspace
                    <ArrowRight className='size-4' />
                  </Button>
                </Link>
                <a
                  href={APP_CONFIG.repositoryUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Button variant='outline' className='gap-2 px-5 py-2.5 text-sm font-semibold sm:text-base'>
                    <GithubMark className='size-4' />
                    View source
                  </Button>
                </a>
              </div>
            </div>

            {/* Author card */}
            <Card className='w-full shrink-0 border-border/80 bg-card/80 p-6 shadow-sm backdrop-blur lg:w-80'>
              <div className='flex items-center gap-4'>
                <span
                  aria-hidden
                  className='flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 font-heading text-lg font-bold text-primary-foreground shadow-md'
                >
                  KJ
                </span>
                <div className='min-w-0'>
                  <p className='text-[11px] font-medium uppercase tracking-wider text-muted-foreground'>
                    Designed &amp; built by
                  </p>
                  <h2 className='truncate font-heading text-lg font-bold tracking-tight text-foreground'>
                    {APP_CONFIG.author}
                  </h2>
                  <p className='text-xs text-muted-foreground'>Designer &amp; Developer</p>
                </div>
              </div>

              <p className='mt-4 text-xs leading-relaxed text-muted-foreground'>
                Built {APP_CONFIG.name} end to end — the agent loop, the retrieval pipeline, the
                storage layer, and the interface you are looking at now.
              </p>

              <div className='mt-4 space-y-1.5 border-t border-border/60 pt-3'>
                <a
                  href={APP_CONFIG.authorUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                >
                  <span className='flex items-center gap-2'>
                    <GithubMark className='size-3.5' />
                    GitHub profile
                  </span>
                  <ExternalLink className='size-3' />
                </a>
                <a
                  href={APP_CONFIG.repositoryUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                >
                  <span className='flex items-center gap-2'>
                    <Code2 className='size-3.5' />
                    Project repository
                  </span>
                  <ExternalLink className='size-3' />
                </a>
              </div>
            </Card>
          </div>
        </section>

        {/* Stats */}
        <section className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
          {STATS.map((stat) => (
            <Card key={stat.label} className='border-border/80 bg-card p-4 shadow-xs sm:p-5'>
              <p className='text-[11px] font-medium uppercase tracking-wider text-muted-foreground'>
                {stat.label}
              </p>
              <p className='mt-1 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl'>
                {stat.value}
              </p>
              <p className='mt-0.5 text-[11px] text-muted-foreground'>{stat.hint}</p>
            </Card>
          ))}
        </section>

        {/* Story */}
        <section className='grid gap-4 lg:grid-cols-[1.1fr_0.9fr]'>
          <Card className='border-border/80 bg-card p-6 shadow-sm sm:p-8'>
            <div className='flex items-center gap-2 text-primary'>
              <Quote className='size-4' />
              <p className='text-[11px] font-semibold uppercase tracking-wider'>Why it exists</p>
            </div>
            <h2 className='mt-3 font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl'>
              Most AI answers are impossible to audit
            </h2>
            <div className='mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground'>
              <p>
                Ask a general chatbot about a 10-K and you get a fluent paragraph with no way to
                tell which numbers were read, which were inferred, and which were invented. For
                financial and academic work, that is not a small problem — it is the whole problem.
              </p>
              <p>
                {APP_CONFIG.name} was built around a narrower promise: answer only from the
                documents in your workspace, and make every claim traceable to a page. Retrieval
                runs before generation, an agent decides when to search or calculate, and citations
                stay attached to the output.
              </p>
              <p>
                The second constraint was cost. The platform runs on free-tier services with
                batched embeddings and simple storage, so the project stays usable without a
                subscription behind it.
              </p>
            </div>
            <div className='mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4'>
              <p className='text-[11px] text-muted-foreground'>
                Curious how the pieces fit together?
              </p>
              <Link
                href='/architecture'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline'
              >
                Read the architecture
                <ArrowRight className='size-3.5' />
              </Link>
            </div>
          </Card>

          <div className='grid gap-3 sm:gap-4'>
            {PRINCIPLES.map((principle) => {
              const Icon = principle.icon;
              return (
                <Card
                  key={principle.title}
                  className='flex gap-4 border-border/80 bg-card p-5 shadow-xs'
                >
                  <span className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                    <Icon className='size-4' />
                  </span>
                  <div>
                    <h3 className='font-heading text-sm font-semibold text-foreground'>
                      {principle.title}
                    </h3>
                    <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
                      {principle.body}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Features */}
        <section className='space-y-4'>
          <div className='space-y-1'>
            <h2 className='font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl'>
              What&apos;s inside
            </h2>
            <p className='text-sm text-muted-foreground'>
              The parts of the product that matter when the answer has to hold up.
            </p>
          </div>

          <div className='grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3'>
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className='border-border/80 bg-card p-5 shadow-xs transition-colors hover:border-foreground/20'
                >
                  <span className='flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                    <Icon className='size-4' />
                  </span>
                  <h3 className='mt-3 font-heading text-sm font-semibold text-foreground'>
                    {feature.title}
                  </h3>
                  <p className='mt-1.5 text-xs leading-relaxed text-muted-foreground'>
                    {feature.body}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Stack */}
        <section className='space-y-4'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
            <div className='space-y-1'>
              <h2 className='font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl'>
                Under the hood
              </h2>
              <p className='text-sm text-muted-foreground'>
                A deliberately small stack, chosen so every layer can be inspected.
              </p>
            </div>
            <Link
              href='/architecture'
              className='inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline'
            >
              Full architecture &amp; specs
              <ArrowRight className='size-3.5' />
            </Link>
          </div>

          <div className='grid gap-3 sm:gap-4 lg:grid-cols-3'>
            {STACK_GROUPS.map((group) => {
              const Icon = group.icon;
              return (
                <Card key={group.title} className='border-border/80 bg-card p-5 shadow-xs'>
                  <div className='flex items-center gap-2'>
                    <Icon className='size-4 text-primary' />
                    <h3 className='font-heading text-sm font-semibold text-foreground'>
                      {group.title}
                    </h3>
                  </div>
                  <div className='mt-3 flex flex-wrap gap-1.5'>
                    {group.items.map((item) => (
                      <Badge
                        key={item}
                        variant='secondary'
                        className='h-auto rounded-md px-2 py-1 font-mono text-[11px] font-normal'
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className='flex flex-col gap-5 rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8'>
          <div className='space-y-1.5'>
            <p className='text-base font-bold text-foreground sm:text-lg'>
              See it answer from a real document
            </p>
            <p className='text-xs text-muted-foreground sm:text-sm'>
              Create an account, upload a PDF, and open the citations behind the response.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            <Link href='/register'>
              <Button className='gap-2 px-5 py-2.5 text-sm font-semibold shadow-md'>
                Get started
                <ArrowRight className='size-4' />
              </Button>
            </Link>
            <Link href='/architecture'>
              <Button variant='outline' className='gap-2 px-5 py-2.5 text-sm font-semibold'>
                <Layers className='size-4' />
                Architecture
              </Button>
            </Link>
          </div>
        </section>

        <BuiltBy />
      </div>
    </div>
  );
}
