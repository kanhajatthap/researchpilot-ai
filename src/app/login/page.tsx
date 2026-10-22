'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Brand } from '@/components/layout/Brand';
import { useAuth } from '@/lib/auth/auth-context';
import {
  Sparkles,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await login(email, password);
      if (res.success) {
        router.push('/');
      } else {
        setError(res.error || 'Invalid email or password.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setError(null);
  };

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4 sm:p-6 lg:p-8'>
      <div className='w-full max-w-md space-y-6'>
        {/* Brand Header */}
        <div className='flex flex-col items-center text-center'>
          <Brand asLink />
          <h1 className='mt-6 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
            Welcome back
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Sign in to access your grounded research workspace and vector knowledge base.
          </p>
        </div>

        {/* Login Card */}
        <Card className='border-border/70 bg-card p-6 sm:p-8 shadow-sm space-y-5'>
          {error && (
            <div className='flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive'>
              <AlertCircle className='size-4 shrink-0' />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className='space-y-4'>
            {/* Email Field */}
            <div className='space-y-1.5'>
              <label htmlFor='email' className='text-xs font-semibold text-foreground'>
                Email Address
              </label>
              <div className='relative'>
                <Mail className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='email'
                  type='email'
                  placeholder='name@example.com'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='pl-9 text-xs'
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className='space-y-1.5'>
              <div className='flex items-center justify-between'>
                <label htmlFor='pass' className='text-xs font-semibold text-foreground'>
                  Password
                </label>
                <Link
                  href='/forgot-password'
                  className='text-xs text-primary hover:underline transition-colors'
                >
                  Forgot password?
                </Link>
              </div>
              <div className='relative'>
                <Lock className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='pass'
                  type={showPassword ? 'text' : 'password'}
                  placeholder='••••••••'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className='pl-9 pr-9 text-xs'
                  required
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                >
                  {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                </button>
              </div>
            </div>

            <Button type='submit' disabled={loading} className='w-full gap-2 shadow-sm'>
              <Sparkles className={cn('size-4', loading && 'animate-spin')} />
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Quick Demo Fill Buttons for Testing */}
          <div className='rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2'>
            <div className='flex items-center justify-between text-[11px] font-medium text-muted-foreground'>
              <span className='flex items-center gap-1'>
                <Zap className='size-3 text-warning' />
                One-Click Test Accounts:
              </span>
            </div>
            <div className='flex flex-col gap-1.5 sm:flex-row'>
              <button
                type='button'
                onClick={() => handleQuickDemo('admin@researchpilot.ai')}
                className='flex-1 rounded-md border border-border/70 bg-card px-2.5 py-1 text-left text-xs hover:border-foreground/20 hover:bg-muted transition-colors'
              >
                <p className='font-semibold text-foreground text-[11px]'>Admin Lead</p>
                <p className='text-[10px] text-muted-foreground'>admin@researchpilot.ai</p>
              </button>
              <button
                type='button'
                onClick={() => handleQuickDemo('demo@researchpilot.ai')}
                className='flex-1 rounded-md border border-border/70 bg-card px-2.5 py-1 text-left text-xs hover:border-foreground/20 hover:bg-muted transition-colors'
              >
                <p className='font-semibold text-foreground text-[11px]'>Research Pilot</p>
                <p className='text-[10px] text-muted-foreground'>demo@researchpilot.ai</p>
              </button>
            </div>
          </div>
        </Card>

        {/* Footer Link */}
        <p className='text-center text-xs text-muted-foreground'>
          Don&apos;t have an account yet?{' '}
          <Link href='/register' className='font-semibold text-primary hover:underline'>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
