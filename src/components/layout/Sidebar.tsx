'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Brand } from './Brand';
import { FileText, History, LayoutDashboard, Library, Menu, Settings, Sparkles } from 'lucide-react';

export interface SidebarProps {
  className?: string;
}

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Research', icon: LayoutDashboard, href: '/', active: true },
  { label: 'Documents', icon: FileText },
  { label: 'Sources', icon: Library },
  { label: 'History', icon: History },
];

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;

  const content = (
    <>
      <Icon className='size-4 shrink-0' />
      <span className='truncate'>{item.label}</span>
      {item.active && (
        <span className='ml-auto size-1.5 rounded-full bg-foreground/70' aria-hidden />
      )}
    </>
  );

  const classes = cn(
    'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
    item.active
      ? 'bg-primary/10 text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

  if (item.href) {
    return (
      <Link href={item.href} className={classes} aria-current={item.active ? 'page' : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type='button'
      className={cn(classes, 'cursor-default')}
      aria-disabled='true'
      title='Coming soon'
    >
      {content}
    </button>
  );
}

export function Sidebar({ className }: SidebarProps) {
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
            <NavLink key={item.label} item={item} />
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

      <div className='border-t border-border/70 p-3'>
        <Button
          variant='ghost'
          size='sm'
          className='w-full justify-start gap-2.5 text-muted-foreground'
          title='Coming soon'
        >
          <Settings className='size-4' />
          Settings
        </Button>
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
