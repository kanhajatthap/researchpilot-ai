import { cn } from '@/lib/utils';
import { suggestedQuestions } from '@/lib/mock-data';
import {
  ArrowUpRight,
  Calculator,
  FileSearch,
  LineChart,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

export interface SuggestedQuestionsProps {
  questions?: string[];
  onQuestionClick?: (question: string) => void;
  className?: string;
}

const ICONS = [LineChart, FileSearch, ShieldAlert, Calculator, Sparkles];

export function SuggestedQuestions({
  questions = suggestedQuestions,
  onQuestionClick,
  className,
}: SuggestedQuestionsProps) {
  return (
    <div className={cn('grid w-full gap-2 sm:grid-cols-2', className)}>
      {questions.map((question, index) => {
        const Icon = ICONS[index % ICONS.length];
        return (
          <button
            key={question}
            type='button'
            onClick={() => onQuestionClick?.(question)}
            className='group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
          >
            <span className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground'>
              <Icon className='size-3.5' />
            </span>
            <span className='min-w-0 flex-1 text-sm leading-snug text-foreground/90'>{question}</span>
            <ArrowUpRight className='mt-0.5 size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground' />
          </button>
        );
      })}
    </div>
  );
}
