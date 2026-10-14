import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional lucide icon component rendered above the title. */
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}>
      {Icon && (
        <span className='mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground'>
          <Icon className='size-5' />
        </span>
      )}
      <h3 className='font-heading text-base font-semibold text-foreground'>{title}</h3>
      {description && (
        <p className='mt-1.5 max-w-sm text-sm text-muted-foreground'>{description}</p>
      )}
      {action && <div className='mt-4'>{action}</div>}
    </div>
  );
}
