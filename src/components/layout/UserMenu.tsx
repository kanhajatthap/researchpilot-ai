'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import {
  User as UserIcon,
  LogOut,
  Settings,
  Shield,
  LogIn,
  UserPlus,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push('/login');
  };

  if (loading) {
    return <div className='size-8 animate-pulse rounded-full bg-muted' />;
  }

  if (!user) {
    return (
      <div className='flex items-center gap-1.5'>
        <Link href='/login'>
          <Button variant='ghost' size='xs' className='gap-1 text-xs'>
            <LogIn className='size-3.5' />
            Sign In
          </Button>
        </Link>
        <Link href='/register'>
          <Button size='xs' className='gap-1 text-xs shadow-xs'>
            <UserPlus className='size-3.5' />
            Register
          </Button>
        </Link>
      </div>
    );
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className='relative' ref={menuRef}>
      <button
        type='button'
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label='User menu'
        className='flex items-center gap-2 rounded-full border border-border/70 bg-card p-1 pr-2.5 transition-colors hover:border-foreground/20 hover:bg-muted/50'
      >
        <span className='flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'>
          {initials}
        </span>
        <span className='hidden max-w-[120px] truncate text-xs font-medium text-foreground sm:inline-block'>
          {user.name}
        </span>
        <ChevronDown className='size-3 text-muted-foreground' />
      </button>

      {open && (
        <div className='absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/70 bg-card p-2 shadow-xl animate-in fade-in-50 zoom-in-95'>
          {/* User info banner */}
          <div className='border-b border-border/60 p-2.5 pb-3'>
            <div className='flex items-center justify-between'>
              <p className='truncate text-xs font-semibold text-foreground'>{user.name}</p>
              <Badge variant='outline' className='text-[9px] capitalize font-mono'>
                {user.role}
              </Badge>
            </div>
            <p className='truncate text-[11px] text-muted-foreground mt-0.5'>{user.email}</p>
          </div>

          {/* Links */}
          <div className='space-y-0.5 py-1.5'>
            <Link
              href='/settings'
              onClick={() => setOpen(false)}
              className='flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
            >
              <Settings className='size-3.5' />
              System Settings
            </Link>
          </div>

          {/* Logout */}
          <div className='border-t border-border/60 pt-1'>
            <button
              type='button'
              onClick={handleLogout}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors'
            >
              <LogOut className='size-3.5' />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
