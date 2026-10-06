import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { MemberExistsError, addMember, listMembers, removeMember, setAlerts } from '@/lib/renewals-db';
import { sendInvite } from '@/lib/renewals-email';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json({ members: await listMembers(viewer.org.id), me: viewer.member.id });
  } catch (err) {
    return failed('list team', err);
  }
}

// Anyone on the team can add a colleague. Invites are free and unlimited.
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const { email, name } = (await request.json().catch(() => ({}))) as { email?: string; name?: string };
    const target = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
    }
    const member = await addMember(viewer.org.id, target, (name || '').trim().slice(0, 100));
    await sendInvite(target, viewer.member.name || viewer.member.email, viewer.org.name);
    return NextResponse.json({ member });
  } catch (err) {
    if (err instanceof MemberExistsError) {
      return NextResponse.json(
        { error: err.message === 'already-here' ? "They're already on your team" : 'That email is already on another Renewals account' },
        { status: 409 }
      );
    }
    return failed('invite', err);
  }
}

// Turn your own alert emails on or off.
export async function PATCH(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const { alerts } = (await request.json().catch(() => ({}))) as { alerts?: boolean };
    await setAlerts(viewer.member.id, Boolean(alerts));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed('alerts setting', err);
  }
}

// Only owners remove people, and owners can't be removed here.
export async function DELETE(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (viewer.member.role !== 'owner') {
    return NextResponse.json({ error: 'Only the account owner can remove people' }, { status: 403 });
  }
  try {
    const id = request.nextUrl.searchParams.get('id') || '';
    await removeMember(viewer.org.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed('remove member', err);
  }
}
