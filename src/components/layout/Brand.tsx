import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_CONFIG } from '@/lib/constants';

export interface BrandProps {
  /** Hide the wordmark and render just the mark. */
  markOnly?: boolean;
  className?: string;
  markClassName?: string;
  /** Render as a link to the workspace root. */
  asLink?: boolean;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-sm ring-1 ring-foreground/10',
        className
      )}
    >
      <Sparkles className='size-4' />
    </span>
  );
}

export function Brand({ markOnly = false, className, markClassName, asLink = false }: BrandProps) {
  const content = (
    <>
      <BrandMark className={markClassName} />
      {!markOnly && (
        <span className='flex min-w-0 flex-col leading-none'>
          <span className='truncate font-heading text-sm font-semibold tracking-tight text-foreground'>
            {APP_CONFIG.name}
          </span>
          <span className='mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
            Research workspace
          </span>
        </span>
      )}
    </>
  );

  const classes = cn('flex items-center gap-2', className);

  if (asLink) {
    return (
      <Link href='/' className={cn(classes, 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40')}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
