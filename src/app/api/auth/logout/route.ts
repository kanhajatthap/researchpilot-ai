import { NextRequest, NextResponse } from 'next/server';
import { userStore } from '@/lib/auth/user-store.server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('rp_session')?.value;
    if (sessionToken) {
      await userStore.deleteSession(sessionToken);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'rp_session',
      value: '',
      httpOnly: true,
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: true });
  }
}
