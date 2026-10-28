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
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const success = await userStore.resetPasswordWithToken(token, newPassword);
    if (!success) {
      return NextResponse.json(
        { error: 'Invalid or expired password reset link.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been successfully updated. You may now sign in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    if (error instanceof AuthStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred during password reset.' },
      { status: 500 }
    );
  }
}
