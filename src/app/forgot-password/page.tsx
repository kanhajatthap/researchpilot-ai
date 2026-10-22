'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/layout/Brand';
import {
  Mail,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [testToken, setTestToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        if (data.resetToken) {
          setTestToken(data.resetToken);
        }
      } else {
        setError(data.error || 'Failed to submit reset request.');
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
            Reset your password
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Enter your account email to receive a password recovery link.
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

          {submitted ? (
            <div className='space-y-4 text-center py-2'>
              <span className='mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/10 text-success'>
                <CheckCircle2 className='size-6' />
              </span>
              <h3 className='font-heading text-base font-semibold text-foreground'>
                Reset Link Dispatched
              </h3>
              <p className='text-xs text-muted-foreground leading-relaxed'>
                We have processed your request for{' '}
                <strong className='text-foreground'>{email}</strong>. Please check your inbox for instructions to reset your password.
              </p>

              {testToken && (
                <div className='mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-left space-y-2'>
                  <div className='flex items-center gap-1.5 text-xs font-semibold text-primary'>
                    <KeyRound className='size-3.5' />
                    <span>Local Test Reset Link:</span>
                  </div>
                  <p className='text-[11px] text-muted-foreground leading-relaxed'>
                    Since this is running in local environment, you can reset directly using this link:
                  </p>
                  <Link href={`/reset-password?token=${testToken}`}>
                    <Button size='xs' className='w-full gap-1.5 text-xs mt-1'>
                      Open Reset Password Page
                      <ArrowRight className='size-3' />
                    </Button>
                  </Link>
                </div>
              )}

              <div className='pt-2'>
                <Link href='/login'>
                  <Button variant='outline' size='sm' className='w-full gap-1.5'>
                    <ArrowLeft className='size-3.5' />
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='space-y-1.5'>
                <label htmlFor='reset-email' className='text-xs font-semibold text-foreground'>
                  Email Address
                </label>
                <div className='relative'>
                  <Mail className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    id='reset-email'
                    type='email'
                    placeholder='name@example.com'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className='pl-9 text-xs'
                    required
                  />
                </div>
              </div>

              <Button type='submit' disabled={loading} className='w-full gap-2 shadow-sm'>
                <Sparkles className={cn('size-4', loading && 'animate-spin')} />
                {loading ? 'Sending link...' : 'Send Recovery Link'}
              </Button>
            </form>
          )}
        </Card>

        {/* Back to Login */}
        {!submitted && (
          <p className='text-center text-xs text-muted-foreground'>
            Remember your password?{' '}
            <Link href='/login' className='font-semibold text-primary hover:underline'>
              Back to Sign In
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
