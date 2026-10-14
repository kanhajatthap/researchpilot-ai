import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-center',
        className
      )}
    >
      <span className='flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive'>
        <AlertTriangle className='size-4' />
      </span>
      <p className='text-sm font-medium text-destructive'>{title}</p>
      {description && <p className='max-w-md text-xs text-muted-foreground'>{description}</p>}
      {action}
    </div>
  );
}
