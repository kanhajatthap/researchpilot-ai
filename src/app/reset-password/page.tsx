'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/layout/Brand';
import { BuiltBy } from '@/components/layout/BuiltBy';
import {
  Lock,
  KeyRound,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Password reset token is missing or invalid.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4 sm:p-6 lg:p-8'>
      <div className='w-full max-w-md space-y-6'>
        {/* Header */}
        <div className='flex flex-col items-center text-center'>
          <Brand asLink />
          <h1 className='mt-6 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
            Set new password
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Enter a strong new password for your ResearchPilot AI account.
          </p>
        </div>

        {/* Card */}
        <Card className='border-border/70 bg-card p-6 sm:p-8 shadow-sm space-y-5'>
          {error && (
            <div className='flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive'>
              <AlertCircle className='size-4 shrink-0' />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className='space-y-4 text-center py-2'>
              <span className='mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/10 text-success'>
                <CheckCircle2 className='size-6' />
              </span>
              <h3 className='font-heading text-base font-semibold text-foreground'>
                Password Updated Successfully
              </h3>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                Your password has been changed. You can now use your new password to sign in.
              </p>
              <div className='pt-2'>
                <Link href='/login'>
                  <Button size='sm' className='w-full gap-1.5'>
                    Sign In with New Password
                    <ArrowRight className='size-3.5' />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className='space-y-4'>
              {/* Token field (auto-filled if from link, or editable) */}
              <div className='space-y-1.5'>
                <label htmlFor='reset-token' className='text-xs font-semibold text-foreground'>
                  Reset Security Token
                </label>
                <div className='relative'>
                  <KeyRound className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    id='reset-token'
                    type='text'
                    placeholder='Paste reset token'
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className='pl-9 font-mono text-xs'
                    required
                  />
                </div>
              </div>

              {/* New Password */}
              <div className='space-y-1.5'>
                <label htmlFor='new-pass' className='text-xs font-semibold text-foreground'>
                  New Password
                </label>
                <div className='relative'>
                  <Lock className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    id='new-pass'
                    type={showPassword ? 'text' : 'password'}
                    placeholder='Minimum 8 characters'
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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

              {/* Confirm Password */}
              <div className='space-y-1.5'>
                <label htmlFor='confirm-pass' className='text-xs font-semibold text-foreground'>
                  Confirm New Password
                </label>
                <div className='relative'>
                  <Lock className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    id='confirm-pass'
                    type={showPassword ? 'text' : 'password'}
                    placeholder='Re-type new password'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className='pl-9 text-xs'
                    required
                  />
                </div>
              </div>

              <Button type='submit' disabled={loading} className='w-full gap-2 shadow-sm'>
                <Sparkles className={cn('size-4', loading && 'animate-spin')} />
                {loading ? 'Updating password...' : 'Set New Password'}
              </Button>
            </form>
          )}
        </Card>

        {/* Footer */}
        <p className='text-center text-xs text-muted-foreground'>
          Remembered your password?{' '}
          <Link href='/login' className='font-semibold text-primary hover:underline'>
            Back to Sign In
          </Link>
        </p>
        <BuiltBy />
      </div>
    </div>
  );
}
