import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockAgentSteps } from '@/lib/mock-data';
import type { AgentStep, AgentTrace } from '@/types/agent';
import { Activity, Check, Loader2, SkipForward, X } from 'lucide-react';

export interface AgentActivityProps {
  trace?: AgentTrace;
  className?: string;
}

const STATUS_META: Record<AgentStep['status'], { label: string; badge: string; marker: string }> = {
  completed: {
    label: 'Done',
    badge: 'border-success/30 bg-success/10 text-success',
    marker: 'bg-success/10 text-success ring-success/30',
  },
  running: {
    label: 'Running',
    badge: 'border-primary/30 bg-primary/10 text-foreground',
    marker: 'bg-primary/10 text-foreground ring-primary/30',
  },
  pending: {
    label: 'Pending',
    badge: 'border-border bg-muted text-muted-foreground',
    marker: 'bg-muted text-muted-foreground ring-border',
  },
  error: {
    label: 'Failed',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    marker: 'bg-destructive/10 text-destructive ring-destructive/30',
  },
  skipped: {
    label: 'Skipped',
    badge: 'border-warning/30 bg-warning/10 text-warning',
    marker: 'bg-warning/10 text-warning ring-warning/30',
  },
};

function StepMarker({ status }: { status: AgentStep['status'] }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full ring-1',
        STATUS_META[status].marker
      )}
      aria-hidden
    >
      {status === 'completed' && <Check className='size-3' />}
      {status === 'running' && <Loader2 className='size-3 animate-spin' />}
      {status === 'error' && <X className='size-3' />}
      {status === 'skipped' && <SkipForward className='size-3' />}
      {status === 'pending' && <span className='size-1.5 rounded-full bg-current' />}
    </span>
  );
}

export function AgentActivity({ trace, className }: AgentActivityProps) {
  // Fall back to a sample trace so the panel is meaningful before the first run.
  const steps = trace?.steps && trace.steps.length > 0 ? trace.steps : mockAgentSteps;
  const hasTrace = Boolean(trace?.steps && trace.steps.length > 0);
  const duration = hasTrace ? trace?.totalDurationMs : undefined;

  return (
    <Card className={cn('flex min-h-[240px] flex-col gap-0 py-0', className)}>
      <div className='flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
          <Activity className='size-3.5' />
        </span>
        <h2 className='font-heading text-sm font-semibold'>Agent activity</h2>
        <Badge variant='outline' className='ml-auto'>
          {hasTrace ? 'Live' : 'Preview'}
        </Badge>
        {typeof duration === 'number' && duration > 0 && (
          <span className='text-xs tabular-nums text-muted-foreground'>
            {(duration / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-3.5'>
        <ol className='space-y-3.5'>
          {steps.map((step: AgentStep, index: number) => {
            const meta = STATUS_META[step.status];
            return (
              <li key={step.id} className='flex gap-3'>
                <div className='flex flex-col items-center'>
                  <StepMarker status={step.status} />
                  {index < steps.length - 1 && <span className='mt-1 w-px flex-1 bg-border' />}
                </div>

                <div className='min-w-0 flex-1 pb-1'>
                  <div className='flex items-center gap-2'>
                    <p className='truncate text-sm font-medium text-foreground'>{step.label}</p>
                    <Badge variant='outline' className={cn('ml-auto shrink-0', meta.badge)}>
                      {meta.label}
                    </Badge>
                  </div>
                  {step.message && (
                    <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>
                      {step.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
