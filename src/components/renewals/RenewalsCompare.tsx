'use client';

import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_TERM_MONTHS,
  LINE_KINDS,
  LINE_KIND_LABELS,
  compareProposal,
  type LineBasis,
  type LineKind,
  type LinePeriod,
  type Proposal,
  type ProposalLine,
} from '@/lib/renewals-proposals';
import {
  RENEWAL_CATEGORIES,
  RENEWAL_CATEGORY_LABELS,
  formatDate,
  formatGBP,
  monthlyCost,
  todayISO,
  type RenewalCategory,
  type RenewalTool,
} from '@/lib/renewals-shared';
import { matchProduct, type RatingsDirectory } from '@/lib/renewals-ratings-shared';
import ProductRatings, { type RatingPick } from './ProductRatings';

// Lay a supplier's quote over the tools it would replace: run rate, cost per
// site and the total over the term, side by side, plus when you could switch
// without paying twice. Everything is worked out in the browser from the
// operator's own data, so the numbers move as they edit.

interface LineDraft {
  label: string;
  kind: LineKind;
  amount: string;
  period: LinePeriod;
  basis: LineBasis;
  quantity: string;
}

interface Draft {
  id?: string;
  name: string;
  supplier: string;
  category: RenewalCategory;
  replaces: string[];
  sites: string;
  term_months: string;
  lines: LineDraft[];
  notes: string;
  file_path?: string;
  file_name?: string | null;
  has_file?: boolean;
}

interface ExtractedProposal {
  name: string | null;
  supplier: string | null;
  category: string | null;
  sites: number | null;
  term_months: number | null;
  lines: ProposalLine[];
  notes: string | null;
}

const BLANK_LINE: LineDraft = { label: '', kind: 'software', amount: '', period: 'month', basis: 'per_site', quantity: '1' };

function lineDraft(l: ProposalLine): LineDraft {
  return { label: l.label, kind: l.kind, amount: String(l.amount), period: l.period, basis: l.basis, quantity: String(l.quantity) };
}

function draftFrom(p?: Proposal): Draft {
  return {
    id: p?.id,
    name: p?.name || '',
    supplier: p?.supplier || '',
    category: p?.category || 'pos',
    replaces: p?.replaces || [],
    sites: p?.sites ? String(p.sites) : '',
    term_months: p?.term_months ? String(p.term_months) : '',
    lines: p?.lines.length ? p.lines.map(lineDraft) : [{ ...BLANK_LINE }],
    notes: p?.notes || '',
    file_name: p?.file_name,
    has_file: p?.has_file,
  };
}

/** The draft's lines as numbers, skipping any without a price yet. */
function parsedLines(d: Draft): ProposalLine[] {
  return d.lines
    .map(l => ({ ...l, amount: Number(l.amount), quantity: Number(l.quantity) || 1 }))
    .filter(l => l.amount > 0 && Number.isFinite(l.amount))
    .map(l => ({ ...l, label: l.label || 'Item' }));
}

function money(n: number): string {
  return formatGBP(Math.round(n));
}

/** A saving: positive reads as a plain amount, a cost increase gets a minus sign. */
function savingText(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '£0';
  return r > 0 ? formatGBP(r) : `−${formatGBP(-r)}`;
}

export default function RenewalsCompare({
  tools,
  initialProposals,
  orgSiteCount,
  ratings,
  ownRatings,
}: {
  tools: RenewalTool[];
  initialProposals: Proposal[];
  orgSiteCount: number | null;
  ratings: RatingsDirectory;
  ownRatings: Record<string, number>;
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [draft, setDraft] = useState<Draft | null>(initialProposals[0] ? draftFrom(initialProposals[0]) : null);
  const [fromFile, setFromFile] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = todayISO();
  const live = useMemo(() => tools.filter(t => t.status !== 'cancelled'), [tools]);

  const comparison = useMemo(() => {
    if (!draft) return null;
    return compareProposal(
      {
        lines: parsedLines(draft),
        replaces: draft.replaces,
        sites: Number(draft.sites) || null,
        term_months: Number(draft.term_months) || null,
      },
      tools,
      orgSiteCount,
      today
    );
  }, [draft, tools, orgSiteCount, today]);

  // Ratings start from what's on screen: the tools a proposal would replace and
  // the quoted product, or with no proposal open, everything the venue uses.
  const ratingsKey = draft ? `${draft.id || 'new'}|${draft.replaces.join(',')}` : 'none';
  const ratingPicks = useMemo(() => {
    const picks: RatingPick[] = [];
    const seen = new Set<string>();
    const push = (pick: RatingPick) => {
      const k = pick.id || pick.label.toLowerCase();
      if (!seen.has(k)) { seen.add(k); picks.push(pick); }
    };
    const current = draft ? live.filter(t => draft.replaces.includes(t.id)) : live;
    for (const t of current) {
      const m = matchProduct(ratings, t.name, t.supplier, t.category);
      if (m) push({ id: m.id, label: m.name, note: 'You use it' });
      else if (draft) push({ label: t.name, note: 'You use it' });
    }
    if (draft && (draft.name.trim() || draft.supplier.trim())) {
      const m = matchProduct(ratings, draft.name, draft.supplier, draft.category);
      push(m ? { id: m.id, label: m.name, note: 'Quoted' } : { label: draft.name.trim() || draft.supplier.trim(), note: 'Quoted' });
    }
    return picks.slice(0, 8);
    // Only recomputed when the proposal or what it replaces changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingsKey, live, ratings]);

  function open(p?: Proposal) {
    setDraft(draftFrom(p));
    setFromFile(false);
    setWarning(null);
    setError('');
    setSavedNote('');
    setConfirmDelete(false);
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => (d ? { ...d, [k]: v } : d));
    setSavedNote('');
  }

  function setLine(i: number, patch: Partial<LineDraft>) {
    setDraft(d => (d ? { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d));
    setSavedNote('');
  }

  function toggleTool(id: string) {
    setDraft(d => (d ? { ...d, replaces: d.replaces.includes(id) ? d.replaces.filter(x => x !== id) : [...d.replaces, id] } : d));
    setSavedNote('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/renewals/proposals/extract', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Upload failed.');
        return;
      }
      const f = json.fields as ExtractedProposal | null;
      const category = (f?.category && (RENEWAL_CATEGORIES as readonly string[]).includes(f.category) ? f.category : 'pos') as RenewalCategory;
      // Start by assuming it replaces what you already have in that category.
      const sameCategory = live.filter(t => t.category === category).map(t => t.id);
      setDraft({
        name: f?.name || file.name.replace(/\.pdf$/i, ''),
        supplier: f?.supplier || '',
        category,
        replaces: sameCategory,
        sites: f?.sites ? String(f.sites) : '',
        term_months: f?.term_months ? String(f.term_months) : '',
        lines: f?.lines.length ? f.lines.map(lineDraft) : [{ ...BLANK_LINE }],
        notes: f?.notes || '',
        file_path: json.file_path,
        file_name: json.file_name,
      });
      setFromFile(Boolean(f?.lines.length));
      setWarning(json.warning || null);
      setSavedNote('');
      setConfirmDelete(false);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    const body = {
      name: draft.name,
      supplier: draft.supplier,
      category: draft.category,
      replaces: draft.replaces,
      sites: draft.sites,
      term_months: draft.term_months,
      lines: parsedLines(draft),
      notes: draft.notes,
      file_path: draft.file_path,
      file_name: draft.file_name,
    };
    try {
      const res = await fetch(draft.id ? `/api/renewals/proposals/${draft.id}` : '/api/renewals/proposals', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not save.');
        return;
      }
      const p = json.proposal as Proposal;
      setProposals(prev => [p, ...prev.filter(x => x.id !== p.id)]);
      setDraft(draftFrom(p));
      setFromFile(false);
      setWarning(null);
      setSavedNote('Saved');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/renewals/proposals/${draft.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not delete.');
        return;
      }
      const rest = proposals.filter(p => p.id !== draft.id);
      setProposals(rest);
      setDraft(rest[0] ? draftFrom(rest[0]) : null);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20';
  const lineField = `${field} ${fromFile ? 'border-warning' : ''}`;
  const label = (text: string) => <span className="block text-xs font-medium text-muted mb-1">{text}</span>;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Compare a proposal</p>
          <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none">Got a quote?</h1>
          <p className="text-sm text-muted mt-3 max-w-xl leading-relaxed">
            Upload a supplier&apos;s proposal and see it next to what you pay today: run rate, cost per site, hardware up front and the total over the contract.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => open()} className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm">Add by hand</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-60 text-white rounded-full px-5 py-2.5 text-sm font-semibold">
            {uploading ? 'Reading proposal…' : 'Upload a proposal'}
          </button>
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-negative-dark">{error}</p>}

      {proposals.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          {proposals.map(p => {
            const c = compareProposal(p, tools, orgSiteCount, today);
            const active = draft?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => open(p)}
                className={`shrink-0 text-left rounded-2xl border px-4 py-3 text-sm ${active ? 'bg-primary-wash border-primary' : 'bg-surface border-border'}`}
              >
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-muted">{p.supplier || RENEWAL_CATEGORY_LABELS[p.category]}</span>
                <span className={`block font-mono text-xs mt-1 ${c.saving.total >= 0 ? 'text-positive' : 'text-negative-dark'}`}>
                  {c.saving.total >= 0 ? `Saves ${money(c.saving.total)}` : `Costs ${money(-c.saving.total)} more`} over {c.months} mo
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!draft ? (
        <div className="rounded-[22px] bg-panel px-5 py-6 text-sm leading-relaxed max-w-2xl">
          <strong>No proposals yet.</strong> When a supplier sends you a quote, upload the PDF. We&apos;ll list every price in it, then you pick which of your current tools it would replace. Nothing here is shared with the supplier.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr] items-start">
          {/* ── The proposal ── */}
          <section className="bg-surface border border-border rounded-[22px] p-5 sm:p-6">
            <h2 className="text-xs uppercase tracking-[0.12em] text-muted mb-4">The proposal</h2>

            {fromFile && (
              <div className="mb-5 rounded-2xl bg-warning-tint/60 border border-warning px-4 py-3 text-sm">
                We read {draft.lines.length} price{draft.lines.length === 1 ? '' : 's'} from <strong>{draft.file_name || 'the proposal'}</strong>. Check each line against the quote before saving.
              </div>
            )}
            {warning && <div className="mb-5 rounded-2xl bg-surface-2 border border-border px-4 py-3 text-sm">{warning}</div>}

            <div className="grid grid-cols-2 gap-4">
              <label className="col-span-2 sm:col-span-1">{label('Product')}<input value={draft.name} onChange={e => set('name', e.target.value)} className={field} placeholder="e.g. New EPOS" /></label>
              <label className="col-span-2 sm:col-span-1">{label('Supplier')}<input value={draft.supplier} onChange={e => set('supplier', e.target.value)} className={field} /></label>
              <label className="col-span-2 sm:col-span-1">{label('Category')}
                <select value={draft.category} onChange={e => set('category', e.target.value as RenewalCategory)} className={field}>
                  {RENEWAL_CATEGORIES.map(c => <option key={c} value={c}>{RENEWAL_CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <label>{label('Sites')}<input inputMode="numeric" value={draft.sites} onChange={e => set('sites', e.target.value.replace(/\D/g, ''))} className={`${field} font-mono`} placeholder={String(orgSiteCount || 1)} /></label>
              <label>{label('Term (months)')}<input inputMode="numeric" value={draft.term_months} onChange={e => set('term_months', e.target.value.replace(/\D/g, ''))} className={`${field} font-mono`} placeholder={String(DEFAULT_TERM_MONTHS)} /></label>
            </div>

            <h3 className="text-xs uppercase tracking-[0.12em] text-muted mt-6 mb-3">Prices (£, ex VAT)</h3>
            <ul className="space-y-3">
              {draft.lines.map((l, i) => (
                <li key={i} className="rounded-2xl border border-border bg-bg p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <label className="col-span-12 sm:col-span-8"><span className="sr-only">Item</span><input value={l.label} onChange={e => setLine(i, { label: e.target.value })} className={lineField} placeholder="Item, e.g. Terminal" /></label>
                    <label className="col-span-12 sm:col-span-4"><span className="sr-only">Type</span>
                      <select value={l.kind} onChange={e => setLine(i, { kind: e.target.value as LineKind })} className={lineField}>
                        {LINE_KINDS.map(k => <option key={k} value={k}>{LINE_KIND_LABELS[k]}</option>)}
                      </select>
                    </label>
                    <label className="col-span-6 sm:col-span-3">{label('Price')}<input inputMode="decimal" value={l.amount} onChange={e => setLine(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} className={`${lineField} font-mono`} placeholder="0" /></label>
                    <label className="col-span-6 sm:col-span-3">{label('Per')}
                      <select value={l.period} onChange={e => setLine(i, { period: e.target.value as LinePeriod })} className={lineField}>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                        <option value="one_off">Once</option>
                      </select>
                    </label>
                    <label className="col-span-6 sm:col-span-4">{label('Applies to')}
                      <select value={l.basis} onChange={e => setLine(i, { basis: e.target.value as LineBasis })} className={lineField}>
                        <option value="per_site">Each site</option>
                        <option value="total">Whole group</option>
                      </select>
                    </label>
                    <label className="col-span-6 sm:col-span-2">{label(l.basis === 'per_site' ? 'Qty / site' : 'Qty')}<input inputMode="decimal" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })} className={`${lineField} font-mono`} /></label>
                  </div>
                  {draft.lines.length > 1 && (
                    <button type="button" onClick={() => set('lines', draft.lines.filter((_, j) => j !== i))} className="mt-2 text-xs text-muted underline">Remove line</button>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => set('lines', [...draft.lines, { ...BLANK_LINE }])} className="mt-3 rounded-full border border-border bg-surface px-4 py-2 text-sm">Add a line</button>

            <h3 className="text-xs uppercase tracking-[0.12em] text-muted mt-6 mb-3">It would replace</h3>
            {live.length === 0 ? (
              <p className="text-sm text-muted">Add your current tools on the Software page to compare against them.</p>
            ) : (
              <ul className="space-y-2">
                {live.map(t => (
                  <li key={t.id}>
                    <label className="flex items-center gap-3 text-sm rounded-xl border border-border bg-bg px-3 py-2.5 cursor-pointer">
                      <input type="checkbox" checked={draft.replaces.includes(t.id)} onChange={() => toggleTool(t.id)} className="w-4 h-4 accent-primary shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-muted"> · {RENEWAL_CATEGORY_LABELS[t.category]}</span>
                      </span>
                      <span className="font-mono text-xs text-muted shrink-0">{t.cost_amount == null ? 'No cost' : `${money(monthlyCost(t))}/mo`}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <label className="block mt-6">{label('Notes')}<textarea rows={3} value={draft.notes} onChange={e => set('notes', e.target.value)} className={field} placeholder="Transaction fees, price rises, free months…" /></label>

            {draft.id && draft.has_file && (
              <p className="mt-4 text-sm"><a href={`/api/renewals/proposals/${draft.id}/file`} target="_blank" rel="noreferrer" className="underline">View proposal{draft.file_name ? ` (${draft.file_name})` : ''}</a></p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button onClick={save} disabled={busy} className="bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-6 py-2.5 text-sm font-semibold">
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Save proposal'}
              </button>
              {savedNote && <span className="text-sm text-positive">{savedNote}</span>}
              {draft.id && (
                confirmDelete ? (
                  <span className="ml-auto flex items-center gap-2 text-sm">
                    Delete this proposal?
                    <button onClick={remove} className="text-negative-dark underline">Delete</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-muted underline">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="ml-auto text-sm text-muted underline">Delete</button>
                )
              )}
            </div>
          </section>

          {/* ── The comparison ── */}
          {comparison && <ComparisonPanel c={comparison} hasTools={draft.replaces.length > 0} />}
        </div>
      )}

      <div className="mt-6">
        <ProductRatings key={ratingsKey} dir={ratings} own={ownRatings} initial={ratingPicks} />
      </div>

      <p className="text-xs text-dim mt-8 max-w-2xl leading-relaxed">
        Proposals are private to your team. Stacked never shares them with suppliers. Current costs per site are your tools&apos; costs split evenly across your sites. Prices read from a proposal are suggestions: check them against the quote.
      </p>
    </main>
  );
}

function ComparisonPanel({ c, hasTools }: { c: ReturnType<typeof compareProposal>; hasTools: boolean }) {
  const yearly = c.saving.monthly * 12;
  const better = c.saving.total >= 0;
  const rows: { label: string; today: number | null; proposed: number; diff?: number }[] = [
    { label: 'Monthly run rate', today: c.current.monthly, proposed: c.proposed.monthly, diff: c.saving.monthly },
    { label: 'Per site, per month', today: c.current.perSiteMonthly, proposed: c.proposed.perSiteMonthly, diff: c.current.perSiteMonthly - c.proposed.perSiteMonthly },
    { label: 'Up front', today: null, proposed: c.proposed.oneOff, diff: -c.proposed.oneOff },
    { label: 'Up front, per site', today: null, proposed: c.proposed.perSiteOneOff, diff: -c.proposed.perSiteOneOff },
    { label: `Total over ${c.months} months`, today: c.current.total, proposed: c.proposed.total, diff: c.saving.total },
    { label: `Per site over ${c.months} months`, today: c.current.perSiteTotal, proposed: c.proposed.perSiteTotal, diff: c.saving.perSiteTotal },
  ];

  return (
    <section className="space-y-4 lg:sticky lg:top-6">
      <div className={`rounded-[22px] border p-5 sm:p-6 ${better ? 'bg-positive-tint/50 border-positive-tint' : 'bg-negative-tint/50 border-negative-tint'}`}>
        <p className="text-xs uppercase tracking-[0.12em] text-muted mb-2">Over {c.months} months, across {c.sites} site{c.sites === 1 ? '' : 's'}</p>
        <p className="text-3xl sm:text-4xl font-bold tracking-[-0.04em] leading-none">
          {better ? `Saves ${money(c.saving.total)}` : `Costs ${money(-c.saving.total)} more`}
        </p>
        <p className="text-sm mt-3 leading-relaxed">
          {c.saving.monthly >= 0 ? `${money(yearly)} a year less to run` : `${money(-yearly)} a year more to run`}
          {c.proposed.oneOff > 0 && <>, after {money(c.proposed.oneOff)} up front</>}.
          {c.paybackMonths != null && c.proposed.oneOff > 0 && (
            c.paybackMonths <= c.months
              ? <> The up-front cost pays back in about <strong>{Math.ceil(c.paybackMonths)} months</strong>.</>
              : <> At that rate the up-front cost takes about {Math.ceil(c.paybackMonths)} months to pay back, <strong>longer than the {c.months}-month term</strong>.</>
          )}
        </p>
        {!hasTools && <p className="text-sm mt-3 text-negative-dark">Tick the tools it would replace to compare against what you pay today.</p>}
        {c.current.missingCost.length > 0 && (
          <p className="text-sm mt-3 text-warning-dark">No cost on {c.current.missingCost.map(t => t.name).join(', ')}. Add it on the Software page for a fair comparison.</p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-[22px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th className="font-medium px-4 py-3"><span className="sr-only">Measure</span></th>
              <th className="font-medium px-3 py-3 text-right">Today</th>
              <th className="font-medium px-3 py-3 text-right">Proposal</th>
              <th className="font-medium px-4 py-3 text-right">Saving</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.label}>
                <td className="px-4 py-3">{r.label}</td>
                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{r.today == null ? <span className="text-dim">—</span> : money(r.today)}</td>
                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{money(r.proposed)}</td>
                <td className={`px-4 py-3 text-right font-mono whitespace-nowrap ${r.diff == null || Math.round(r.diff) === 0 ? '' : r.diff > 0 ? 'text-positive' : 'text-negative-dark'}`}>
                  {r.diff == null ? '' : savingText(r.diff)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.proposed.byKind.length > 0 && (
        <div className="bg-surface border border-border rounded-[22px] p-5">
          <h3 className="text-xs uppercase tracking-[0.12em] text-muted mb-3">What each site pays on the proposal</h3>
          <ul className="divide-y divide-border text-sm">
            {c.proposed.byKind.map(k => (
              <li key={k.kind} className="flex items-center justify-between py-2 gap-3">
                <span>{LINE_KIND_LABELS[k.kind]}</span>
                <span className="font-mono text-right">
                  {k.monthly > 0 && <>{money(k.monthly / c.sites)}/mo</>}
                  {k.monthly > 0 && k.oneOff > 0 && <span className="text-dim"> + </span>}
                  {k.oneOff > 0 && <>{money(k.oneOff / c.sites)} once</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-surface border border-border rounded-[22px] p-5">
        <h3 className="text-xs uppercase tracking-[0.12em] text-muted mb-3">Your whole stack</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted">Today</p>
            <p className="font-mono text-xl">{money(c.stack.today)}/yr</p>
          </div>
          <span className="text-muted pb-1" aria-hidden>→</span>
          <div>
            <p className="text-xs text-muted">With this proposal</p>
            <p className="font-mono text-xl text-primary">{money(c.stack.after)}/yr</p>
          </div>
        </div>
        <p className="text-xs text-muted mt-2">Annual run rate of everything on your Software page, with the replaced tools swapped for this proposal. Up-front costs not included.</p>
      </div>

      {c.exits.length > 0 && (
        <div className="bg-surface border border-border rounded-[22px] p-5">
          <h3 className="text-xs uppercase tracking-[0.12em] text-muted mb-3">When you could switch</h3>
          {c.cleanSwitch && (
            <p className="text-sm leading-relaxed mb-3">
              Start the new contract on <strong>{formatDate(c.cleanSwitch)}</strong> to avoid paying twice
              {c.firstNoticeBy && <>. Give notice by <strong>{formatDate(c.firstNoticeBy)}</strong></>}.
              {c.overlapIfToday > 0 && <> Starting today means paying about <strong>{money(c.overlapIfToday)}</strong> on current contracts until they end.</>}
            </p>
          )}
          <ul className="divide-y divide-border text-sm">
            {c.exits.map(e => (
              <li key={e.tool.id} className="py-2">
                <span className="font-medium">{e.tool.name}</span>
                <span className="block text-xs text-muted">
                  {e.ends ? <>Ends {formatDate(e.ends)}{e.noticeBy ? ` · notice by ${formatDate(e.noticeBy)}` : ''}</> : 'Add a renewal date to see when it can end'}
                  {e.missedThisCycle && ' · this year’s notice deadline has passed, so it runs one more term'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
