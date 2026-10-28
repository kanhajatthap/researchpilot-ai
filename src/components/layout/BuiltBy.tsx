import { APP_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface BuiltByProps {
  className?: string;
}

/**
 * Author credit shown across the app (sidebar, menus, auth pages, architecture
 * and settings) so it is always clear who built ResearchPilot AI.
 */
export function BuiltBy({ className }: BuiltByProps) {
  return (
    <p className={cn('text-center text-[11px] leading-relaxed text-muted-foreground', className)}>
      Built by{' '}
      <a
        href={APP_CONFIG.authorUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='font-semibold text-foreground underline-offset-2 hover:underline'
      >
        {APP_CONFIG.author}
      </a>
    </p>
  );
}
