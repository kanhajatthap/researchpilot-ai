import { NextRequest, NextResponse } from 'next/server';
import {
  AuthStorageError,
  assertAuthStorageReady,
  userStore,
} from '@/lib/auth/user-store.server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    assertAuthStorageReady();

    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const token = await userStore.createPasswordResetToken(email);

    // For privacy, we always return success message even if email wasn't found
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been dispatched.',
      // In local development / demo mode, return the token so user can test without email SMTP
      resetToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    if (error instanceof AuthStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'An error occurred while processing password reset request.' },
      { status: 500 }
    );
  }
}
