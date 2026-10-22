'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Brand } from './Brand';
import { FileText, GitCompare, History, Layers, LayoutDashboard, Library, Menu, Settings, Sparkles } from 'lucide-react';

export interface SidebarProps {
  className?: string;
}

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Research', icon: LayoutDashboard, href: '/' },
  { label: 'Documents', icon: FileText, href: '/documents' },
  { label: 'Compare', icon: GitCompare, href: '/compare' },
  { label: 'Sources', icon: Library, href: '/sources' },
  { label: 'History', icon: History, href: '/history' },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  const content = (
    <>
      <Icon className='size-4 shrink-0' />
      <span className='truncate'>{item.label}</span>
      {isActive && (
        <span className='ml-auto size-1.5 rounded-full bg-foreground/70' aria-hidden />
      )}
    </>
  );

  return (
    <Link
      href={item.href}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn('flex h-full w-full flex-col border-r border-border/70 bg-sidebar', className)}>
      <div className='flex h-14 items-center border-b border-border/70 px-4 md:hidden'>
        <Brand />
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-3'>
        <nav className='space-y-1' aria-label='Primary'>
          <p className='px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground'>
            Workspace
          </p>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              isActive={pathname === item.href}
            />
          ))}
        </nav>

        <div className='rounded-xl border border-border/70 bg-card p-3.5'>
          <div className='flex items-center gap-2'>
            <span className='flex size-6 items-center justify-center rounded-md bg-primary/10 text-foreground'>
              <Sparkles className='size-3.5' />
            </span>
            <p className='font-heading text-xs font-semibold text-foreground'>Grounded answers</p>
          </div>
          <p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
            Every response cites the exact document and page it came from, so you can verify it in one click.
          </p>
        </div>
      </div>

      <div className='border-t border-border/70 p-3 space-y-1'>
        <Link
          href='/architecture'
          className={cn(
            'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
            pathname === '/architecture'
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-current={pathname === '/architecture' ? 'page' : undefined}
        >
          <Layers className='size-4' />
          Architecture & Specs
        </Link>
        <Link
          href='/settings'
          className={cn(
            'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-current={pathname === '/settings' ? 'page' : undefined}
        >
          <Settings className='size-4' />
          Settings
        </Link>
      </div>
    </aside>
  );
}

export function SidebarMobile() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className='inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden'
        aria-label='Open navigation'
      >
        <Menu className='size-5' />
      </SheetTrigger>
      <SheetContent side='left' className='w-72 p-0'>
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
