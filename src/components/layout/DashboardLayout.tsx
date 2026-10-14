import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

export interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
}

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className='flex h-dvh flex-col overflow-hidden bg-background'>
      <Header />
      <div className='flex min-h-0 flex-1'>
        <div className='hidden w-64 shrink-0 md:flex lg:w-72'>
          <Sidebar />
        </div>
        <main className={cn('relative min-w-0 flex-1 overflow-y-auto', className)}>{children}</main>
      </div>
    </div>
  );
}
