'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HiddenPartner } from '@/lib/use-hidden-partners';
import { GREEN_MIN_LEADS_30D, RED_AFTER_DAYS } from '@/lib/partner-activity';

// Partner Health — every partner sorted into a green, amber or red box by how
// many new leads they've had lately, so the partner manager can see at a
// glance who needs a call. Numbers come from /api/performance, which counts
// leads exactly the way the partner pages do.

type Band = 'green' | 'amber' | 'red';

interface PerfRow {
  name: string;
  slug: string;
  tier: string;
  leadCount: number;
  mqlCount: number;
  sqlCount: number;
  leads14d: number;
  leads30d: number;
  band: Band;
  daysSinceLastLead: number | null;
}

const BANDS: { key: Band; title: string; rule: string; box: string; head: string; dot: string }[] = [
  {
    key: 'green',
    title: 'Active',
    rule: `${GREEN_MIN_LEADS_30D}+ new leads in 30 days`,
    box: 'bg-positive-tint/60 border-positive/30',
    head: 'text-positive',
    dot: 'bg-positive-bright',
  },
  {
    key: 'amber',
    title: 'Slowing down',
    rule: `A lead in the last ${RED_AFTER_DAYS} days, fewer than ${GREEN_MIN_LEADS_30D} in 30`,
    box: 'bg-warning-tint/60 border-warning/50',
    head: 'text-warning-dark',
    dot: 'bg-warning',
  },
  {
    key: 'red',
    title: 'Needs a call',
    rule: `No new leads for ${RED_AFTER_DAYS}+ days`,
    box: 'bg-negative-tint/50 border-negative/30',
    head: 'text-negative-dark',
    dot: 'bg-negative',
  },
];

function lastLeadLabel(d: number | null): string {
  if (d == null) return 'No leads yet';
  if (d === 0) return 'Last lead today';
  if (d === 1) return 'Last lead yesterday';
  if (d < 60) return `Last lead ${d} days ago`;
  if (d < 365) return `Last lead ${Math.round(d / 30)} months ago`;
  return `Last lead over a year ago`;
}

function hiddenOnLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Hidden ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function TierChip({ tier }: { tier: string }) {
  const approved = tier === 'approved';
  return (
    <span className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${approved ? 'bg-brand-green/10 text-brand-green' : 'bg-gray-100 text-gray-500'}`}>
      {approved ? 'Approved' : 'Promote'}
    </span>
  );
}

interface PartnerHeatMapProps {
  hidden?: HiddenPartner[];
  shared?: boolean;
  onHide?: (slug: string, name: string | null, hide: boolean) => void;
}

export default function PartnerHeatMap({ hidden = [], shared = true, onHide }: PartnerHeatMapProps = {}) {
  const [rows, setRows] = useState<PerfRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    fetch('/api/performance', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRows(d.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const hiddenSet = useMemo(() => new Set(hidden.map(h => h.slug)), [hidden]);

  const byBand = useMemo(() => {
    const out: Record<Band, PerfRow[]> = { green: [], amber: [], red: [] };
    for (const r of rows || []) {
      if (hiddenSet.has(r.slug)) continue;
      out[r.band]?.push(r);
    }
    // Busiest first; red sorts by who went quiet most recently, so the
    // easiest wins are at the top.
    out.green.sort((a, b) => b.leads30d - a.leads30d || a.name.localeCompare(b.name));
    out.amber.sort((a, b) => b.leads30d - a.leads30d || a.name.localeCompare(b.name));
    out.red.sort((a, b) =>
      (a.daysSinceLastLead ?? Infinity) - (b.daysSinceLastLead ?? Infinity) || a.name.localeCompare(b.name));
    return out;
  }, [rows, hiddenSet]);

  const nameFor = (slug: string) => rows?.find(r => r.slug === slug)?.name;
  const tierFor = (slug: string) => rows?.find(r => r.slug === slug)?.tier;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">Loading partner health…</p>
      </div>
    );
  }
  if (!rows || rows.length === 0) return null;

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-brand-green">Partner Health</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Based on new leads added. The same counts as each partner&apos;s own page.
        </p>
      </div>

      <div className="space-y-4">
        {BANDS.map(b => {
          const list = byBand[b.key];
          return (
            <section key={b.key} className={`rounded-2xl border p-3 sm:p-4 ${b.box}`} aria-label={`${b.title}: ${list.length} partners`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2.5 px-1">
                <h3 className={`flex items-center gap-2 font-bold text-base ${b.head}`}>
                  <span className={`w-3 h-3 rounded-full ${b.dot}`} aria-hidden />
                  {b.title}
                  <span className="font-mono text-sm tabular-nums">{list.length}</span>
                </h3>
                <p className={`text-[11px] ${b.head} opacity-80`}>{b.rule}</p>
              </div>

              {list.length === 0 ? (
                <p className="text-sm text-gray-500 bg-white/70 rounded-xl px-3 py-3">No partners here right now.</p>
              ) : (
                // Two columns on wide screens so a long list stays short.
                <ul className="grid lg:grid-cols-2 gap-px bg-gray-100 rounded-xl overflow-hidden">
                  {list.map(r => (
                    <li key={r.slug} className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 bg-white lg:[&:last-child:nth-child(odd)]:col-span-2">
                      <a href={`/partners/${r.slug}`} className="min-w-0 flex-1 group">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-900 truncate group-hover:underline">{r.name}</span>
                          <TierChip tier={r.tier} />
                        </span>
                        <span className="block text-[11px] text-gray-500 mt-0.5">
                          {lastLeadLabel(r.daysSinceLastLead)} · {r.leadCount} total · {r.mqlCount} MQL · {r.sqlCount} SQL
                        </span>
                      </a>
                      <div className="shrink-0 text-right tabular-nums" title="New leads in the last 14 and 30 days">
                        <span className="block text-sm font-semibold text-gray-900">{r.leads14d}<span className="text-gray-400 font-normal"> / {r.leads30d}</span></span>
                        <span className="block text-[10px] text-gray-400">14d / 30d</span>
                      </div>
                      {onHide && (
                        <button
                          type="button"
                          onClick={() => onHide(r.slug, r.name, true)}
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 rounded-full px-2.5 py-1.5 min-h-[32px]"
                          aria-label={`Hide ${r.name}`}
                        >
                          <EyeOff />
                          <span className="hidden sm:inline">Hide</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {hidden.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <button
              type="button"
              onClick={() => setShowHidden(s => !s)}
              className="w-full flex items-center justify-between gap-2 px-1 text-left"
              aria-expanded={showHidden}
            >
              <span className="flex items-center gap-2 font-bold text-base text-gray-600">
                <EyeOff />
                Hidden partners
                <span className="font-mono text-sm tabular-nums">{hidden.length}</span>
              </span>
              <span className="text-[11px] text-gray-500">
                {shared ? 'Hidden for the whole team' : 'Saved in this browser only'}
                <svg className={`inline w-4 h-4 ml-1 transition-transform ${showHidden ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </button>
            {showHidden && (
              <ul className="mt-2.5 bg-white rounded-xl divide-y divide-gray-100">
                {hidden.map(h => {
                  const name = nameFor(h.slug) || h.name || h.slug;
                  const tier = tierFor(h.slug);
                  return (
                    <li key={h.slug} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-gray-600 truncate">{name}</span>
                          {tier && <TierChip tier={tier} />}
                        </span>
                        {h.hidden_at && <span className="block text-[11px] text-gray-400 mt-0.5">{hiddenOnLabel(h.hidden_at)}</span>}
                      </span>
                      {onHide && (
                        <button
                          type="button"
                          onClick={() => onHide(h.slug, name, false)}
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-brand-green border border-brand-green/30 hover:bg-brand-green/5 rounded-full px-2.5 py-1.5 min-h-[32px]"
                          aria-label={`Bring back ${name}`}
                        >
                          <Eye />
                          Bring back
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function EyeOff() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c4.5 0 8.3 2.9 9.5 7a10 10 0 01-2.6 4.2M6.2 6.2A10 10 0 002.5 12c1.3 4.1 5 7 9.5 7 1.6 0 3.1-.4 4.4-1" />
    </svg>
  );
}

function Eye() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
