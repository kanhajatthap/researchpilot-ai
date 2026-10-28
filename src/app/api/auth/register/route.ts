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
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const user = await userStore.create(name, email, password);
    const sessionToken = await userStore.createSession(user.id);

    const response = NextResponse.json(
      { success: true, user },
      { status: 201 }
    );

    response.cookies.set({
      name: 'rp_session',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    if (error instanceof AuthStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'An error occurred during registration.',
      },
      { status: 400 }
    );
  }
}
