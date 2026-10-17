import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import VisitList from '@/components/field/VisitList';
import SignOut from '@/components/field/SignOut';
import { currentAgent, fieldConfigured, listVisits } from '@/lib/field-db';
import { ukDay } from '@/lib/field-shared';

export const dynamic = 'force-dynamic';

/** The UK day the current week started (Monday), as YYYY-MM-DD. */
function weekStartDay(): string {
  const dow = (new Date(`${ukDay(Date.now())}T12:00:00Z`).getUTCDay() + 6) % 7;
  return ukDay(Date.now() - dow * 86400000);
}

// An agent's home: today's and this week's count, a big "new visit" button and
// their recent visits.
export default async function FieldHome() {
  if (!fieldConfigured()) {
    return <p className="p-6">Field is not switched on yet: VENUES_SUPABASE_URL / VENUES_SUPABASE_KEY are missing.</p>;
  }
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');

  const visits = await listVisits({ agentId: agent.id, limit: 200 });
  const today = ukDay(Date.now());
  const todayCount = visits.filter(v => ukDay(v.visited_at) === today).length;
  const weekStart = weekStartDay();
  const weekCount = visits.filter(v => ukDay(v.visited_at) >= weekStart).length;
  const first = (agent.name || agent.email).split(/[ @]/)[0];

  return (
    <>
      <FieldHeader title="Field" right={<SignOut />} />
      <main className="mx-auto w-full max-w-md px-4 pt-5">
        <p className="mb-4 text-[17px]">Hi {first}.</p>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-mono text-[34px] leading-none">{todayCount}</p>
            <p className="mt-1.5 text-sm text-muted">visits today</p>
          </div>
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-mono text-[34px] leading-none">{weekCount}</p>
            <p className="mt-1.5 text-sm text-muted">this week</p>
          </div>
        </div>

        <Link
          href="/field/visit"
          className="mb-7 flex h-16 items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold uppercase tracking-tight text-white active:bg-primary-press"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Tag a venue
        </Link>

        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Your visits</h2>
        {visits.length ? (
          <VisitList visits={visits.slice(0, 50)} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">
            No visits yet. Walk into a venue and tap <b>Tag a venue</b>.
          </p>
        )}
      </main>
      <FieldTabs manager={agent.role === 'manager'} />
    </>
  );
}
