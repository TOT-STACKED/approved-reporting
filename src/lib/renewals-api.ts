import { NextResponse } from 'next/server';
import { sessionEmail } from './renewals-auth';
import { viewerFor, type Viewer } from './renewals-db';

// Every Renewals API route starts here. Returns the signed-in member and their
// org, or a 401 to send straight back. The org id used for every query after
// this comes from the member row, never from the request.
export async function requireViewer(): Promise<Viewer | NextResponse> {
  const viewer = await viewerFor(await sessionEmail()).catch(err => {
    console.warn('[renewals] viewer lookup failed', err);
    return null;
  });
  return viewer ?? NextResponse.json({ error: 'Sign in again' }, { status: 401 });
}

export function failed(scope: string, err: unknown, message = 'Something went wrong. Try again.') {
  console.warn(`[renewals] ${scope} failed`, err);
  return NextResponse.json({ error: message }, { status: 500 });
}
