import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme';
import { APP_CONFIG } from '@/lib/constants';
import { CircleUser } from 'lucide-react';
import { Brand } from './Brand';
import { SidebarMobile } from './Sidebar';
import { UserMenu } from './UserMenu';

export function Header() {
  return (
    <header className='sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70'>
      <div className='flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4'>
        <SidebarMobile />

        <Brand asLink />

        <Badge variant='outline' className='hidden font-mono text-[10px] sm:inline-flex'>
          v{APP_CONFIG.version}
        </Badge>

        <div className='ml-auto flex items-center gap-2'>
          <span className='hidden items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex'>
            <span className='size-1.5 rounded-full bg-success' aria-hidden />
            Ready
          </span>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
