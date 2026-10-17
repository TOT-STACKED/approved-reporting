import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import { currentAgent } from '@/lib/field-db';
import { listRoutes } from '@/lib/field-routes';
import { ukDay } from '@/lib/field-shared';
import { progress, routeEnds, routeIsCurrent, type FieldRoute } from '@/lib/field-routes-shared';

export const dynamic = 'force-dynamic';

function RouteRow({ r, showAgent }: { r: FieldRoute; showAgent: boolean }) {
  const p = progress(r);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <li>
      <Link href={`/field/routes/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold">{r.name}</p>
          <p className="truncate text-[13px] text-muted">
            {r.period === 'week' ? 'Week' : 'Day'}{showAgent && r.agent_name ? ` · ${r.agent_name}` : ''} · {p.total} stop{p.total === 1 ? '' : 's'}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-positive" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="shrink-0 font-mono text-[14px]">{p.done}/{p.total}</span>
      </Link>
    </li>
  );
}

// Routes: today's (or this week's) up top, then upcoming, then history.
export default async function Routes({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  const { agent } = await searchParams;
  const isManager = me.role === 'manager';
  const routes = await listRoutes({ agentId: isManager ? agent || undefined : me.id }).catch(() => []);
  const today = ukDay(Date.now());

  const current = routes.filter(r => routeIsCurrent(r, today));
  const upcoming = routes.filter(r => r.starts_on > today).reverse();
  const past = routes.filter(r => routeEnds(r) < today);

  const section = (title: string, list: FieldRoute[]) => list.length > 0 && (
    <>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">{title}</h2>
      <ul className="mb-6 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        {list.map(r => <RouteRow key={r.id} r={r} showAgent={isManager} />)}
      </ul>
    </>
  );

  return (
    <>
      <FieldHeader title="Routes" back="/field" />
      <main className="mx-auto w-full max-w-md px-4 pt-4 md:max-w-2xl">
        <Link href="/field/routes/new" className="mb-6 flex h-14 items-center justify-center rounded-2xl bg-primary text-[16px] font-bold uppercase text-white active:bg-primary-press">
          Plan a route
        </Link>
        {section(current.length === 1 ? 'On now' : 'On now', current)}
        {section('Coming up', upcoming)}
        {section('History', past)}
        {!routes.length && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">
            No routes yet. Plan today’s, or the week’s, and they’ll be kept here with what got visited.
          </p>
        )}
      </main>
      <FieldTabs manager={isManager} />
    </>
  );
}
