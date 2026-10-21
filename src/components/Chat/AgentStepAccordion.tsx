'use client';

import { useState } from 'react';
import type { AgentTrace, AgentStep } from '@/types/agent';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Loader2, X, Wrench, FileSearch, Calculator, Globe, GitCommit } from 'lucide-react';

export interface AgentStepAccordionProps {
  trace?: AgentTrace;
  className?: string;
  defaultExpanded?: boolean;
}

function getStepIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('document')) return <FileSearch className='size-3 text-primary' />;
  if (l.includes('calculator')) return <Calculator className='size-3 text-primary' />;
  if (l.includes('arxiv') || l.includes('wikipedia') || l.includes('search')) return <Globe className='size-3 text-primary' />;
  if (l.includes('git')) return <GitCommit className='size-3 text-primary' />;
  return <Wrench className='size-3 text-primary' />;
}

export function AgentStepAccordion({ trace, className, defaultExpanded = false }: AgentStepAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  if (!trace || !trace.steps || trace.steps.length === 0) {
    return null;
  }

  const steps = trace.steps;
  const duration = typeof trace.totalDurationMs === 'number' && trace.totalDurationMs > 0
    ? `${(trace.totalDurationMs / 1000).toFixed(1)}s`
    : undefined;

  return (
    <div className={cn('mb-2 overflow-hidden rounded-lg border border-border/70 bg-muted/20', className)}>
      <button
        type='button'
        onClick={() => setIsOpen((prev) => !prev)}
        className='flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors'
        aria-expanded={isOpen}
      >
        <span className='flex items-center gap-2'>
          <Wrench className='size-3.5 text-primary/80' />
          <span>
            Tool execution · {steps.length} action{steps.length > 1 ? 's' : ''}
          </span>
          {duration && <span className='text-[10px] text-muted-foreground/70'>({duration})</span>}
        </span>
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className='border-t border-border/50 px-3 py-2'>
          <ol className='space-y-2'>
            {steps.map((step: AgentStep, idx: number) => {
              const isCompleted = step.status === 'completed';
              const isRunning = step.status === 'running';
              const isError = step.status === 'error';

              return (
                <li key={step.id || idx} className='flex items-start gap-2 text-xs'>
                  <span className='mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full'>
                    {isCompleted && <Check className='size-3 text-success' />}
                    {isRunning && <Loader2 className='size-3 animate-spin text-primary' />}
                    {isError && <X className='size-3 text-destructive' />}
                    {!isCompleted && !isRunning && !isError && (
                      <span className='size-1.5 rounded-full bg-muted-foreground/50' />
                    )}
                  </span>

                  <div className='min-w-0 flex-1 leading-snug'>
                    <div className='flex items-center gap-1.5'>
                      {getStepIcon(step.label)}
                      <span className='font-semibold text-foreground/90'>{step.label}</span>
                    </div>
                    {step.message && (
                      <p className='mt-0.5 text-[11px] leading-relaxed text-muted-foreground'>
                        {step.message}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
