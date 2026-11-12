'use client';

import { useEffect, useMemo, useState } from 'react';
import { RED_AFTER_DAYS } from '@/lib/partner-activity';

// "This week's to-dos" — the top of the internal dashboard. Everything here is
// worked out live from the lead sheet, Partner Health and NPS, so the list is
// what the team should act on today rather than a report to read.
//
// Stale leads split in two: a short "chase now" list of leads that went quiet
// recently (still winnable), and a backlog of leads nobody has touched in two
// months or more, which mostly need closing out in Airtable.

const DAY = 24 * 60 * 60 * 1000;
export const SQL_STALE_DAYS = 14;
export const MQL_STALE_DAYS = 21;
export const BACKLOG_DAYS = 60;
export const NPS_WINDOW_DAYS = 7;

export interface ActionLead {
  id?: string;
  businessName?: string;
  status: string;
  lastModified: string;
  date: string;
  owner?: string;
  stages?: Partial<Record<'MAL' | 'MQL' | 'SQL' | 'Closed Won' | 'Closed Lost', string[]>>;
}

export interface ActionPartner {
  name: string;
  slug: string;
  tier: string;
  band: 'green' | 'amber' | 'red';
  daysSinceLastLead: number | null;
  mqlCount: number;
  sqlCount: number;
}

interface NpsRow {
  id?: string | number;
  created_at: string;
  score: number;
  vendor?: string | null;
  company?: string | null;
  comment?: string | null;
  touchpoint?: string | null;
}

type Who = 'partners' | 'team';

interface Item {
  key: string;
  title: string;
  detail: string;
  who: Who;
  count: number;
  rows: { key: string; main: string; sub: string; href?: string; right: string }[];
}

function daysAgo(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / DAY);
}

function ago(d: number | null): string {
  if (d == null) return '—';
  if (d === 0) return 'today';
  if (d === 1) return '1 day';
  return `${d} days`;
}

function partnersAt(l: ActionLead, stage: 'MQL' | 'SQL'): string {
  const p = l.stages?.[stage] || [];
  if (!p.length) return '';
  return p.slice(0, 2).join(', ') + (p.length > 2 ? ` +${p.length - 2}` : '');
}

function leadRows(leads: ActionLead[], stage: 'MQL' | 'SQL', now: number) {
  return leads.map(l => {
    const d = daysAgo(l.lastModified, now);
    const bits = [partnersAt(l, stage), l.owner && l.owner !== 'N/A' ? `owner ${l.owner}` : ''].filter(Boolean);
    return {
      key: l.id || `${l.businessName}-${l.lastModified}`,
      main: l.businessName || 'Unnamed lead',
      sub: bits.join(' · ') || stage,
      right: `untouched ${ago(d)}`,
    };
  });
}

const WHO: Record<Who, { label: string; cls: string }> = {
  partners: { label: 'Partners', cls: 'bg-negative-tint text-negative-dark' },
  team: { label: 'Our team', cls: 'bg-panel text-brand-green' },
};

export default function ActionList({ leads, partners }: { leads: ActionLead[]; partners: ActionPartner[] | null }) {
  const [nps, setNps] = useState<NpsRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Fixed when the page loads, so ages don't shift between re-renders.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch('/api/nps', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setNps(d.recent || []))
      .catch(() => setNps([]));
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // 1. Approved partners with no new MQL for 14+ days. Most recently quiet
    //    first: those are the easiest to get going again.
    const red = (partners || [])
      .filter(p => p.tier === 'approved' && p.band === 'red')
      .sort((a, b) => (a.daysSinceLastLead ?? Infinity) - (b.daysSinceLastLead ?? Infinity));
    if (red.length) {
      out.push({
        key: 'red',
        title: `Call ${red.length} Approved ${red.length === 1 ? 'partner' : 'partners'} with no new MQL for ${RED_AFTER_DAYS}+ days`,
        detail: red.slice(0, 2).map(p => `${p.name} (${p.daysSinceLastLead == null ? 'none yet' : ago(p.daysSinceLastLead)})`).join(', ') + (red.length > 2 ? ' first' : ''),
        who: 'partners',
        count: red.length,
        rows: red.map(p => ({
          key: p.slug,
          main: p.name,
          sub: `${p.mqlCount} MQL · ${p.sqlCount} SQL all time`,
          href: `/partners/${p.slug}`,
          right: p.daysSinceLastLead == null ? 'no MQLs yet' : `last MQL ${ago(p.daysSinceLastLead)} ago`,
        })),
      });
    }

    const byAge = (stage: string, min: number, max: number) =>
      leads
        .filter(l => l.status === stage)
        .map(l => ({ l, d: daysAgo(l.lastModified, now) }))
        .filter(x => x.d != null && x.d >= min && x.d < max)
        .sort((a, b) => (a.d as number) - (b.d as number))
        .map(x => x.l);

    // 2. SQLs that went quiet recently — the partner owns these, so chase them.
    const sqlChase = byAge('SQL', SQL_STALE_DAYS, BACKLOG_DAYS);
    if (sqlChase.length) {
      out.push({
        key: 'sql',
        title: `Chase partners on ${sqlChase.length} ${sqlChase.length === 1 ? 'SQL' : 'SQLs'} untouched for ${SQL_STALE_DAYS}–${BACKLOG_DAYS} days`,
        detail: 'Still winnable. Ask the partner for an update and log it in Airtable.',
        who: 'partners',
        count: sqlChase.length,
        rows: leadRows(sqlChase, 'SQL', now),
      });
    }

    // 3. MQLs sitting with us — Stacked runs the outreach at MQL.
    const mqlChase = byAge('MQL', MQL_STALE_DAYS, BACKLOG_DAYS);
    if (mqlChase.length) {
      out.push({
        key: 'mql',
        title: `Qualify ${mqlChase.length} ${mqlChase.length === 1 ? 'MQL' : 'MQLs'} sitting for ${MQL_STALE_DAYS}–${BACKLOG_DAYS} days`,
        detail: 'Move each one to SQL or close it.',
        who: 'team',
        count: mqlChase.length,
        rows: leadRows(mqlChase, 'MQL', now),
      });
    }

    // 4. NPS detractors this week.
    const det = (nps || [])
      .filter(r => r.score <= 6 && (daysAgo(r.created_at, now) ?? Infinity) <= NPS_WINDOW_DAYS)
      .sort((a, b) => a.score - b.score || Date.parse(b.created_at) - Date.parse(a.created_at));
    if (det.length) {
      out.push({
        key: 'nps',
        title: `Follow up ${det.length} NPS ${det.length === 1 ? 'detractor' : 'detractors'} from the last ${NPS_WINDOW_DAYS} days`,
        detail: 'Scores of 6 or below. Lowest scores first.',
        who: 'team',
        count: det.length,
        rows: det.map((r, i) => ({
          key: String(r.id ?? i),
          main: r.company || 'Unknown venue',
          sub: [r.vendor, r.comment ? `“${r.comment.slice(0, 90)}${r.comment.length > 90 ? '…' : ''}”` : ''].filter(Boolean).join(' · '),
          right: `scored ${r.score}`,
        })),
      });
    }

    // 5. Backlog — leads nobody has touched in two months. Mostly dead; close
    //    them out so the live numbers mean something.
    const sqlOld = byAge('SQL', BACKLOG_DAYS, Infinity);
    const mqlOld = byAge('MQL', BACKLOG_DAYS, Infinity);
    if (sqlOld.length + mqlOld.length) {
      out.push({
        key: 'backlog',
        title: `Clean up ${sqlOld.length + mqlOld.length} leads untouched for ${BACKLOG_DAYS}+ days`,
        detail: `${sqlOld.length} SQL and ${mqlOld.length} MQL. Mark each Won, Lost or still live in Airtable.`,
        who: 'team',
        count: sqlOld.length + mqlOld.length,
        rows: [...leadRows(sqlOld, 'SQL', now).map(r => ({ ...r, sub: `SQL · ${r.sub}` })),
               ...leadRows(mqlOld, 'MQL', now).map(r => ({ ...r, sub: `MQL · ${r.sub}` }))],
      });
    }

    return out;
  }, [leads, partners, nps, now]);

  const stillLoading = partners == null || nps == null;

  return (
    <section className="bg-white rounded-2xl border-2 border-brand-green/80 p-4 sm:p-5 mb-6" aria-labelledby="todo-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 id="todo-heading" className="text-lg font-bold text-brand-green">This week&apos;s to-dos</h2>
        <p className="text-[11px] text-gray-500">Worked out live from Airtable and NPS</p>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-500">{stillLoading ? 'Working out this week’s to-dos…' : 'Nothing needs chasing right now.'}</p>
      )}

      <ol className="divide-y divide-gray-100">
        {items.map((it, i) => {
          const isOpen = open === it.key;
          return (
            <li key={it.key} className="py-2.5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : it.key)}
                className="w-full flex items-start gap-3 text-left min-h-[44px]"
                aria-expanded={isOpen}
              >
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand-green text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{it.title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{it.detail}</span>
                </span>
                <span className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${WHO[it.who].cls}`}>{WHO[it.who].label}</span>
                <svg className={`shrink-0 w-4 h-4 mt-1 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isOpen && (
                <ul className="mt-2 ml-0 sm:ml-9 rounded-xl border border-gray-100 divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                  {it.rows.map(r => {
                    const body = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 truncate">{r.main}</span>
                          {r.sub && <span className="block text-[11px] text-gray-500 truncate">{r.sub}</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-500 text-right">{r.right}</span>
                      </>
                    );
                    return (
                      <li key={r.key}>
                        {r.href
                          ? <a href={r.href} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">{body}</a>
                          : <div className="flex items-center gap-3 px-3 py-2">{body}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
