import { NextResponse, type NextRequest } from 'next/server';
import { slugForToken } from '@/lib/partner-auth';
import { PARTNER_SESSION_COOKIE, makeSessionCookie } from '@/lib/partner-auth';
import {
  createUser,
  findUserByEmail,
  partnerRecordIdForSlug,
  usersForSlug,
} from '@/lib/partner-users';

export const dynamic = 'force-dynamic';

// Account setup, run from inside a partner's private link.
//
// The token in that link is the proof of identity: we sent it to the partner,
// so whoever opens it is entitled to that partner's dashboard. Setting up an
// account converts a link they have to remember into a sign-in they can
// repeat — it grants nothing they didn't already have.
//
// The same link sets up any number of people at that partner, which is the
// point: it's a company link, and colleagues shouldn't need an invite chain.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      name?: string;
      email?: string;
      mobile?: string;
    };

    const slug = typeof body.token === 'string' ? slugForToken(body.token) : null;
    if (!slug) {
      return NextResponse.json({ error: 'This link is not valid' }, { status: 401 });
    }

    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const mobile = (body.mobile || '').trim();

    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter your name' }, { status: 400 });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid work email' }, { status: 400 });
    }

    // Already set up? Sign them in rather than making a duplicate row — but
    // only if that account belongs to this partner. An email registered to
    // another partner must not be re-pointed by whoever holds this link.
    const existing = await findUserByEmail(email);
    if (existing) {
      if (existing.slug.trim().toLowerCase() !== slug.trim().toLowerCase()) {
        return NextResponse.json(
          { error: 'That email is already set up with a different partner. Contact the Stacked team.' },
          { status: 409 }
        );
      }
      return signedIn(slug, existing.name || name, true);
    }

    const partnerRecordId = await partnerRecordIdForSlug(slug);
    const created = await createUser({ email, name, mobile, slug, partnerRecordId });
    if (!created) {
      return NextResponse.json(
        { error: 'Could not create your account. Contact the Stacked team.' },
        { status: 502 }
      );
    }

    return signedIn(slug, name, false);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Setting up signs you in there and then — they've already proved themselves
 *  by holding the link, so a code at this point is a hoop for its own sake. */
function signedIn(slug: string, name: string, existed: boolean) {
  const res = NextResponse.json({ ok: true, slug, name, existed });
  res.cookies.set(PARTNER_SESSION_COOKIE, makeSessionCookie(slug), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

// Who already has access for this partner — shown on the setup card so a
// second person can see their colleague got there first. Names only.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const slug = slugForToken(token);
  if (!slug) return NextResponse.json({ error: 'This link is not valid' }, { status: 401 });

  const users = await usersForSlug(slug);
  return NextResponse.json({ slug, users: users.map(u => ({ name: u.name })) });
}
