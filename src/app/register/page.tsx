'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/layout/Brand';
import { BuiltBy } from '@/components/layout/BuiltBy';
import { useAuth } from '@/lib/auth/auth-context';
import {
  Sparkles,
  Lock,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!agreed) {
      setError('Please agree to the research terms of service.');
      return;
    }

    try {
      setLoading(true);
      const res = await register(name, email, password);
      if (res.success) {
        // Hard navigation so the new session cookie is applied to a fresh
        // document/server render (avoids the cached unauthenticated redirect).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/');
      } else {
        setError(res.error || 'Failed to create account.');
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
            Create an account
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Join ResearchPilot AI to query documents, verify citations, and run AI research agents.
          </p>
        </div>

        {/* Form Card */}
        <Card className='border-border/70 bg-card p-6 sm:p-8 shadow-sm space-y-5'>
          {error && (
            <div className='flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive'>
              <AlertCircle className='size-4 shrink-0' />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className='space-y-4'>
            {/* Full Name */}
            <div className='space-y-1.5'>
              <label htmlFor='reg-name' className='text-xs font-semibold text-foreground'>
                Full Name
              </label>
              <div className='relative'>
                <UserIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='reg-name'
                  type='text'
                  placeholder='e.g. Dr. Alex Mercer'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className='pl-9 text-xs'
                  required
                />
              </div>
            </div>

            {/* Email Address */}
            <div className='space-y-1.5'>
              <label htmlFor='reg-email' className='text-xs font-semibold text-foreground'>
                Email Address
              </label>
              <div className='relative'>
                <Mail className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='reg-email'
                  type='email'
                  placeholder='name@example.com'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='pl-9 text-xs'
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className='space-y-1.5'>
              <label htmlFor='reg-pass' className='text-xs font-semibold text-foreground'>
                Password
              </label>
              <div className='relative'>
                <Lock className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='reg-pass'
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Minimum 8 characters'
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

              {/* Password strength meter */}
              {password && (
                <div className='space-y-1 pt-1'>
                  <div className='flex gap-1'>
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={cn(
                          'h-1 flex-1 rounded-full bg-muted',
                          passwordStrength >= step &&
                            (passwordStrength <= 2
                              ? 'bg-warning'
                              : passwordStrength === 3
                              ? 'bg-primary'
                              : 'bg-success')
                        )}
                      />
                    ))}
                  </div>
                  <p className='text-[10px] text-muted-foreground'>
                    Strength:{' '}
                    {passwordStrength <= 1
                      ? 'Weak'
                      : passwordStrength === 2
                      ? 'Fair'
                      : passwordStrength === 3
                      ? 'Good'
                      : 'Strong'}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className='space-y-1.5'>
              <label htmlFor='reg-confirm' className='text-xs font-semibold text-foreground'>
                Confirm Password
              </label>
              <div className='relative'>
                <Lock className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  id='reg-confirm'
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Re-type password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className='pl-9 text-xs'
                  required
                />
              </div>
            </div>

            {/* Terms checkbox */}
            <div className='flex items-center gap-2 pt-1'>
              <input
                id='terms'
                type='checkbox'
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className='size-4 rounded border-border text-primary focus:ring-primary'
              />
              <label htmlFor='terms' className='text-xs text-muted-foreground leading-tight'>
                I agree to the ResearchPilot AI Terms of Use and Privacy Policy.
              </label>
            </div>

            <Button type='submit' disabled={loading} className='w-full gap-2 shadow-sm'>
              <Sparkles className={cn('size-4', loading && 'animate-spin')} />
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </Card>

        {/* Footer */}
        <p className='text-center text-xs text-muted-foreground'>
          Already have an account?{' '}
          <Link href='/login' className='font-semibold text-primary hover:underline'>
            Sign in
          </Link>
        </p>
        <BuiltBy />
      </div>
    </div>
  );
}
