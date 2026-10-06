'use client';

import { useMemo, useRef, useState } from 'react';
import ToolEditor, { applyExtracted, draftFrom, type Draft, type Extracted } from './ToolEditor';
import {
  RENEWAL_CATEGORY_LABELS,
  deadlineFor,
  formatDate,
  formatGBP,
  isRolling,
  monthlyCost,
  nextRenewal,
  todayISO,
  type RenewalCategory,
  type RenewalTool,
} from '@/lib/renewals-shared';

// The operator's home: what they spend, what's about to auto-renew, and every
// tool they pay for. Starts pre-filled from their Intelligence Review.

interface EditorState {
  draft: Draft;
  filled: Set<string>;
  warning?: string | null;
}

function urgency(days: number): string {
  if (days <= 14) return 'bg-negative-tint text-negative-dark';
  if (days <= 30) return 'bg-warning-tint text-warning-dark';
  return 'bg-surface-2 text-muted';
}

function daysLabel(days: number): string {
  if (days < 0) return `${-days}d ago`;
  if (days === 0) return 'today';
  return `${days}d`;
}

export default function RenewalsApp({ orgName, initialTools }: { orgName: string; initialTools: RenewalTool[] }) {
  const [tools, setTools] = useState(initialTools);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [query, setQuery] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Which tool an upload is for, when it was started from a row rather than the header.
  const uploadFor = useRef<RenewalTool | null>(null);

  const today = todayISO();

  const stats = useMemo(() => {
    const live = tools.filter(t => t.status !== 'cancelled');
    const monthly = live.reduce((s, t) => s + monthlyCost(t), 0);
    const deadlines = live
      .map(t => ({ tool: t, d: deadlineFor(t, today) }))
      .filter((x): x is { tool: RenewalTool; d: NonNullable<ReturnType<typeof deadlineFor>> } => Boolean(x.d))
      .sort((a, b) => a.d.days - b.d.days);
    const upcoming = deadlines.filter(x => x.d.days >= 0 && x.d.days <= 90);
    const missed = deadlines.filter(x => x.d.days < 0 && x.d.renewal >= today);
    const incomplete = live.filter(t => t.cost_amount == null || (!t.renewal_date && t.cost_period !== 'one_off'));

    const byCategory = new Map<RenewalCategory, number>();
    for (const t of live) byCategory.set(t.category, (byCategory.get(t.category) || 0) + monthlyCost(t));
    const categorySpend = [...byCategory.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

    const counts = new Map<RenewalCategory, RenewalTool[]>();
    for (const t of live) if (t.category !== 'other') counts.set(t.category, [...(counts.get(t.category) || []), t]);
    const overlaps = [...counts.entries()].filter(([, ts]) => ts.length > 1);

    return { live, monthly, upcoming, missed, incomplete, categorySpend, overlaps };
  }, [tools, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools
      .filter(t => showCancelled || t.status !== 'cancelled')
      .filter(t => !q || [t.name, t.supplier, RENEWAL_CATEGORY_LABELS[t.category], t.owner].some(v => v?.toLowerCase().includes(q)));
  }, [tools, query, showCancelled]);

  function openNew() {
    setEditor({ draft: draftFrom(), filled: new Set() });
  }

  function openTool(t: RenewalTool) {
    setEditor({ draft: draftFrom(t), filled: new Set() });
  }

  function startUpload(t: RenewalTool | null) {
    uploadFor.current = t;
    setUploadError('');
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/renewals/extract', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(json.error || 'Upload failed.');
        return;
      }
      const fields = json.fields as Extracted | null;
      // Match the contract to a tool already on the list, so uploading the
      // Lightspeed contract fills in the Lightspeed row rather than adding a second one.
      let target = uploadFor.current;
      if (!target && fields?.name) {
        const n = String(fields.name).toLowerCase();
        target = tools.find(t => t.status !== 'cancelled' && (n.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(n))) || null;
      }
      const base = { ...draftFrom(target || undefined), contract_path: json.contract_path, contract_name: json.contract_name };
      const { draft, filled } = applyExtracted(base, fields);
      setEditor({ draft, filled, warning: json.warning });
    } catch {
      setUploadError('Could not reach the server.');
    } finally {
      setUploading(false);
      uploadFor.current = null;
    }
  }

  function saved(t: RenewalTool) {
    setTools(prev => {
      const i = prev.findIndex(x => x.id === t.id);
      const next = i >= 0 ? prev.map(x => (x.id === t.id ? t : x)) : [...prev, t];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditor(null);
  }

  function deleted(id: string) {
    setTools(prev => prev.filter(t => t.id !== id));
    setEditor(null);
  }

  const maxCategory = stats.categorySpend[0]?.[1] || 1;
  const fromReview = tools.filter(t => t.source === 'intelligence').length;
  const nothingFilled = tools.length > 0 && tools.every(t => t.cost_amount == null && !t.renewal_date);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Your software</p>
          <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none truncate">{orgName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/renewals/export" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm">Export CSV</a>
          <button onClick={openNew} className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm">Add tool</button>
          <button onClick={() => startUpload(null)} disabled={uploading} className="bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-60 text-white rounded-full px-5 py-2.5 text-sm font-semibold">
            {uploading ? 'Reading contract…' : 'Upload a contract'}
          </button>
        </div>
      </div>

      {uploadError && <p className="mb-6 text-sm text-negative-dark">{uploadError}</p>}

      {nothingFilled && (
        <div className="mb-8 rounded-[18px] bg-brand-yellow border border-border px-5 py-4 text-sm leading-relaxed">
          <strong>{fromReview ? `We've added the ${fromReview} tools from your Intelligence Review.` : 'Start by adding your tools.'}</strong>{' '}
          Add what each one costs and when it renews, or upload the contract and we&apos;ll read it for you. Once there&apos;s a renewal date, we&apos;ll email you before every notice deadline.
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Kpi label="Monthly spend" value={formatGBP(stats.monthly)} />
        <Kpi label="Annual run rate" value={formatGBP(stats.monthly * 12)} />
        <Kpi label="Notice deadlines, next 90 days" value={String(stats.upcoming.length)} tone={stats.upcoming.some(x => x.d.days <= 14) ? 'alert' : undefined} />
        <Kpi label="Tools tracked" value={String(stats.live.length)} sub={stats.incomplete.length ? `${stats.incomplete.length} need details` : 'All complete'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr] mb-8">
        <div className="bg-surface border border-border rounded-[18px] p-5">
          <h2 className="text-xs uppercase tracking-[0.12em] text-muted mb-4">Next notice deadlines</h2>
          {stats.missed.length > 0 && (
            <div className="mb-4 space-y-2">
              {stats.missed.map(({ tool, d }) => (
                <button key={tool.id} onClick={() => openTool(tool)} className="w-full text-left rounded-xl bg-negative-tint/60 px-3 py-2 text-sm">
                  <strong>{tool.name}</strong>: the notice deadline passed on {formatDate(d.date)}. It renews {formatDate(d.renewal)}. Check whether you can still negotiate.
                </button>
              ))}
            </div>
          )}
          {stats.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing in the next 90 days. {stats.incomplete.length > 0 && 'Add renewal dates to see what’s coming.'}</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.upcoming.slice(0, 6).map(({ tool, d }) => (
                <li key={tool.id}>
                  <button onClick={() => openTool(tool)} className="w-full flex items-center gap-3 py-3 text-left">
                    <span className={`font-mono text-xs rounded-full px-2.5 py-1 shrink-0 ${urgency(d.days)}`}>{daysLabel(d.days)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{tool.name}</span>
                      <span className="block text-xs text-muted">Give notice by {formatDate(d.date)} · renews {formatDate(d.renewal)}</span>
                    </span>
                    {tool.cost_amount != null && tool.cost_period !== 'one_off' && (
                      <span className="font-mono text-sm text-muted shrink-0">{formatGBP(monthlyCost(tool) * 12)}/yr</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface border border-border rounded-[18px] p-5">
          <h2 className="text-xs uppercase tracking-[0.12em] text-muted mb-4">Monthly spend by category</h2>
          {stats.categorySpend.length === 0 ? (
            <p className="text-sm text-muted">Add costs to see where the money goes.</p>
          ) : (
            <ul className="space-y-3">
              {stats.categorySpend.map(([c, v]) => (
                <li key={c} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span>{RENEWAL_CATEGORY_LABELS[c]}</span>
                    <span className="font-mono">{formatGBP(v)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-series-1" style={{ width: `${Math.max(3, (v / maxCategory) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.overlaps.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <h3 className="text-xs uppercase tracking-[0.12em] text-muted mb-2">Possible overlap</h3>
              <ul className="space-y-1.5 text-sm">
                {stats.overlaps.map(([c, ts]) => (
                  <li key={c}><strong>{RENEWAL_CATEGORY_LABELS[c]}:</strong> {ts.map(t => t.name).join(', ')}</li>
                ))}
              </ul>
              <p className="text-xs text-dim mt-2">Sometimes that&apos;s right. Worth checking you&apos;re not paying twice.</p>
            </div>
          )}
        </div>
      </section>

      {/* Tool list */}
      <section className="bg-surface border border-border rounded-[18px]">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
          <h2 className="text-xs uppercase tracking-[0.12em] text-muted mr-auto">All tools</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="accent-ink" />
            Show cancelled
          </label>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="bg-bg border border-border rounded-xl px-3 py-2 text-sm w-full sm:w-52" />
        </div>

        {visible.length === 0 ? (
          <p className="p-6 text-sm text-muted">No tools yet. Add one, or upload a contract.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="font-medium px-4 py-3">Tool</th>
                  <th className="font-medium px-4 py-3 hidden md:table-cell">Category</th>
                  <th className="font-medium px-4 py-3 text-right">Cost</th>
                  <th className="font-medium px-4 py-3 hidden sm:table-cell">Renews</th>
                  <th className="font-medium px-4 py-3">Give notice by</th>
                  <th className="font-medium px-4 py-3 hidden lg:table-cell">Contract</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(t => {
                  const d = deadlineFor(t, today);
                  const renews = nextRenewal(t, today);
                  return (
                    <tr key={t.id} onClick={() => openTool(t)} className={`cursor-pointer hover:bg-bg ${t.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.name}</span>
                        {t.status === 'cancelling' && <span className="ml-2 text-[10px] uppercase tracking-wide rounded-full bg-surface-2 px-2 py-0.5 text-muted">Cancelling</span>}
                        {t.supplier && <span className="block text-xs text-muted">{t.supplier}</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted">{RENEWAL_CATEGORY_LABELS[t.category]}</td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                        {t.cost_amount == null ? <span className="text-dim">Add</span> : (
                          <>{formatGBP(t.cost_amount, t.cost_amount % 1 ? 2 : 0)}<span className="text-dim">{t.cost_period === 'month' ? '/mo' : t.cost_period === 'year' ? '/yr' : ''}</span></>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">{renews ? formatDate(renews) : <span className="text-dim">Add</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {d ? (
                          <span className="flex items-center gap-2">
                            {formatDate(d.date)}
                            {d.days <= 90 && <span className={`font-mono text-[11px] rounded-full px-2 py-0.5 ${urgency(d.days)}`}>{daysLabel(d.days)}</span>}
                          </span>
                        ) : <span className="text-dim">{!t.auto_renew ? 'Doesn’t auto-renew' : isRolling(t) ? 'Rolling monthly' : '—'}</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {t.has_contract ? (
                          <a href={`/api/renewals/tools/${t.id}/contract`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="underline">View</a>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); startUpload(t); }} className="text-muted underline">Upload</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-dim mt-8 max-w-2xl leading-relaxed">
        Your data is private to your team. Stacked never shares it with suppliers. Dates read from contracts are suggestions: always check the notice terms in the contract itself.
      </p>

      {editor && (
        <ToolEditor
          key={editor.draft.id || editor.draft.contract_path || 'new'}
          initial={editor.draft}
          filled={editor.filled}
          warning={editor.warning}
          onClose={() => setEditor(null)}
          onSaved={saved}
          onDeleted={deleted}
        />
      )}
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'alert' }) {
  return (
    <div className={`rounded-[18px] border p-4 sm:p-5 ${tone === 'alert' ? 'bg-negative-tint/50 border-negative-tint' : 'bg-surface border-border'}`}>
      <p className="text-xs text-muted mb-2 leading-snug">{label}</p>
      <p className="font-display uppercase text-2xl sm:text-3xl leading-none">{value}</p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </div>
  );
}
