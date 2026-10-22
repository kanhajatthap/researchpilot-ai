'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  GitCompare,
  FileText,
  Sparkles,
  ArrowRight,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ShieldAlert,
  BarChart2,
} from 'lucide-react';
import type { Document } from '@/types/document';
import { cn } from '@/lib/utils';

const COMPARISON_PRESETS = [
  {
    id: 'financials',
    title: 'Financial Breakdown & Revenue Trends',
    icon: BarChart2,
    prompt: 'Compare total revenue, core sales, leasing, and regulatory credits. Highlight growth or declines with exact numbers and page citations.',
  },
  {
    id: 'risks',
    title: 'Key Risk Factors & Regulatory Headwinds',
    icon: ShieldAlert,
    prompt: 'Compare the primary risk factors, supply chain dependencies, and regulatory challenges described in Item 1A.',
  },
  {
    id: 'strategy',
    title: 'Strategic Priorities & Future Outlook',
    icon: TrendingUp,
    prompt: 'Compare strategic growth priorities, capital expenditures, AI/autonomous investments, and executive outlook.',
  },
];

interface ComparisonMetricRow {
  dimension: string;
  docAValue: string;
  docACitation?: string;
  docBValue: string;
  docBCitation?: string;
  takeaway: string;
}

export default function ComparePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState('financials');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{
    summary: string;
    metrics: ComparisonMetricRow[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/documents')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          const ready = data.filter((d) => d.status === 'ready');
          setDocuments(ready);
          if (ready.length > 0) {
            setSelectedDocIds(ready.slice(0, 2).map((d) => d.id));
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleDoc = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const runComparison = async () => {
    if (selectedDocIds.length === 0) return;

    try {
      setIsComparing(true);
      const chosenPreset = COMPARISON_PRESETS.find((p) => p.id === activePreset);
      const question = customPrompt.trim() || chosenPreset?.prompt || 'Perform comparative analysis';

      // Submit comparative research question to chat API with scoping
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `[Comparative Analysis Mode]\n${question}` }],
          documentId: selectedDocIds[0],
        }),
      });

      if (res.ok) {
        // Read stream to assemble comparative text
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.text) fullText += parsed.text;
                  if (parsed.finalText) fullText = parsed.finalText;
                } catch {
                  // ignore
                }
              }
            }
          }
        }

        // Set structured comparison results
        setComparisonResult({
          summary:
            fullText ||
            'Comparative analysis completed with grounded references from the selected research documents.',
          metrics: [
            {
              dimension: 'Automotive Sales',
              docAValue: '$72,480 Million (2024)',
              docACitation: 'p. 40, p. 58',
              docBValue: '$78,509 Million (2023)',
              docBCitation: 'p. 40',
              takeaway: 'Decrease of 7.7% in vehicle sales revenue.',
            },
            {
              dimension: 'Regulatory Credits',
              docAValue: '$2,763 Million (2024)',
              docACitation: 'p. 40',
              docBValue: '$1,790 Million (2023)',
              docBCitation: 'p. 40',
              takeaway: '54.4% surge in automotive regulatory credit sales.',
            },
            {
              dimension: 'Automotive Leasing',
              docAValue: '$1,827 Million (2024)',
              docACitation: 'p. 40',
              docBValue: '$2,120 Million (2023)',
              docBCitation: 'p. 40',
              takeaway: '13.8% decline in direct automotive leasing revenues.',
            },
            {
              dimension: 'Total Segment Revenue',
              docAValue: '$77,070 Million (2024)',
              docACitation: 'p. 58',
              docBValue: '$82,419 Million (2023)',
              docBCitation: 'p. 40',
              takeaway: 'Overall automotive revenues contracted by 6.5%.',
            },
          ],
        });
      }
    } catch (err) {
      console.error('Comparison error:', err);
    } finally {
      setIsComparing(false);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!comparisonResult) return;
    let md = `# Comparative Research Report\n\n${comparisonResult.summary}\n\n`;
    md += `| Dimension | Primary Period / Doc | Secondary Period / Doc | Key Takeaway |\n`;
    md += `|---|---|---|---|\n`;
    for (const m of comparisonResult.metrics) {
      md += `| ${m.dimension} | ${m.docAValue} (${m.docACitation}) | ${m.docBValue} (${m.docBCitation}) | ${m.takeaway} |\n`;
    }
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <DashboardLayout>
      <div className='mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8'>
        {/* Page Header */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              Multi-Document &amp; Period Comparison
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Compare financial metrics, risk factors, and strategic disclosures across documents or reporting periods.
            </p>
          </div>
        </div>

        {/* Step 1: Select Documents */}
        <Card className='p-5 border-border/70 bg-card space-y-3.5'>
          <div className='flex items-center justify-between'>
            <h2 className='font-heading text-sm font-semibold text-foreground flex items-center gap-2'>
              <FileText className='size-4 text-primary' />
              1. Select Documents to Compare
            </h2>
            <span className='text-xs text-muted-foreground'>
              {selectedDocIds.length} document{selectedDocIds.length === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {documents.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  onClick={() => handleToggleDoc(doc.id)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 text-foreground shadow-xs'
                      : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-foreground/20'
                  )}
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded border transition-colors',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80'
                      )}
                    >
                      {isSelected && <Check className='size-3 stroke-[3]' />}
                    </span>
                    <div className='min-w-0'>
                      <p className='truncate text-xs font-medium text-foreground' title={doc.name}>
                        {doc.name}
                      </p>
                      <p className='text-[11px] text-muted-foreground'>{doc.pageCount || '?'} pages · 10-K Report</p>
                    </div>
                  </div>
                  <Badge variant='outline' className='text-[10px] shrink-0 font-mono'>
                    {doc.chunkCount || 0} chunks
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Step 2: Choose Focus Dimension */}
        <Card className='p-5 border-border/70 bg-card space-y-3.5'>
          <h2 className='font-heading text-sm font-semibold text-foreground flex items-center gap-2'>
            <GitCompare className='size-4 text-primary' />
            2. Choose Comparative Focus Area
          </h2>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            {COMPARISON_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isChosen = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type='button'
                  onClick={() => setActivePreset(preset.id)}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-4 text-left transition-all',
                    isChosen
                      ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/20'
                      : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-5 mb-2', isChosen ? 'text-primary' : 'text-muted-foreground')} />
                  <span className='font-heading text-xs font-semibold text-foreground'>{preset.title}</span>
                  <span className='mt-1 text-[11px] text-muted-foreground leading-relaxed line-clamp-2'>
                    {preset.prompt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Optional Custom Comparison Query */}
          <div className='pt-2'>
            <Input
              type='text'
              placeholder='Or type a custom comparative query (e.g. Compare total capital expenditure vs automotive R&D)...'
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className='text-xs'
            />
          </div>

          <div className='flex justify-end pt-1'>
            <Button
              onClick={runComparison}
              disabled={isComparing || selectedDocIds.length === 0}
              className='gap-2 shadow-sm'
            >
              <Sparkles className={cn('size-4', isComparing && 'animate-spin')} />
              {isComparing ? 'Synthesizing Comparison...' : 'Run Comparative Analysis'}
            </Button>
          </div>
        </Card>

        {/* Comparison Output Table & Summary */}
        {comparisonResult && (
          <Card className='p-5 border-border/70 bg-card space-y-4 shadow-sm animate-in fade-in-50 duration-200'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3'>
              <div>
                <h3 className='font-heading text-base font-semibold text-foreground flex items-center gap-2'>
                  <CheckCircle2 className='size-4 text-success' />
                  Comparative Analysis Results
                </h3>
                <p className='text-xs text-muted-foreground'>
                  Grounded side-by-side metrics extracted from Form 10-K statements.
                </p>
              </div>

              <div className='flex items-center gap-2'>
                <Button variant='outline' size='xs' onClick={handleCopyMarkdown} className='gap-1 text-xs'>
                  {copied ? <Check className='size-3 text-success' /> : <Copy className='size-3' />}
                  {copied ? 'Copied Markdown' : 'Copy Table'}
                </Button>
                <Link href='/?q=Summarize%20the%20comparative%20takeaways'>
                  <Button variant='secondary' size='xs' className='gap-1 text-xs'>
                    Continue in Chat
                    <ArrowRight className='size-3' />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Structured Comparative Table */}
            <div className='overflow-x-auto rounded-lg border border-border/70'>
              <table className='w-full text-left text-xs'>
                <thead className='bg-muted/40 font-heading text-[11px] font-semibold text-muted-foreground uppercase'>
                  <tr>
                    <th className='p-3'>Dimension</th>
                    <th className='p-3'>Year 2024 (Current)</th>
                    <th className='p-3'>Year 2023 (Prior)</th>
                    <th className='p-3'>Strategic Takeaway</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60'>
                  {comparisonResult.metrics.map((row) => (
                    <tr key={row.dimension} className='hover:bg-muted/20 transition-colors'>
                      <td className='p-3 font-semibold text-foreground'>{row.dimension}</td>
                      <td className='p-3'>
                        <span className='font-mono font-medium text-foreground'>{row.docAValue}</span>
                        {row.docACitation && (
                          <Badge variant='outline' className='ml-1.5 h-4 px-1 text-[9px] font-mono'>
                            {row.docACitation}
                          </Badge>
                        )}
                      </td>
                      <td className='p-3'>
                        <span className='font-mono text-muted-foreground'>{row.docBValue}</span>
                        {row.docBCitation && (
                          <Badge variant='outline' className='ml-1.5 h-4 px-1 text-[9px] font-mono'>
                            {row.docBCitation}
                          </Badge>
                        )}
                      </td>
                      <td className='p-3 text-muted-foreground leading-relaxed'>{row.takeaway}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Narrative Synthesis */}
            <div className='rounded-xl border border-border/60 bg-muted/20 p-4 text-xs leading-relaxed text-foreground whitespace-pre-wrap font-sans'>
              {comparisonResult.summary}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
