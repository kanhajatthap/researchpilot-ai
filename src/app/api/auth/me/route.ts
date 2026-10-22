import { NextRequest, NextResponse } from 'next/server';
import { userStore } from '@/lib/auth/user-store.server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('rp_session')?.value;
    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    const user = await userStore.getSessionUser(sessionToken);
    return NextResponse.json({ user });
  } catch (error) {
    console.error('Session retrieval error:', error);
    return NextResponse.json({ user: null });
  }
}
