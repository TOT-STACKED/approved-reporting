'use client';

import { useEffect, useState } from 'react';
import {
  RENEWAL_CATEGORIES,
  RENEWAL_CATEGORY_LABELS,
  formatDate,
  noticeDeadline,
  nextRenewal,
  type RenewalTool,
} from '@/lib/renewals-shared';

// Add or edit one tool. When a contract has just been read, the fields it
// filled are marked so the operator checks them before saving — nothing an
// AI read out of a PDF is saved without a human looking at it.

export interface Draft {
  id?: string;
  name: string;
  supplier: string;
  category: string;
  sites: string;
  cost_amount: string;
  cost_period: string;
  contract_start: string;
  term_months: string;
  renewal_date: string;
  notice_days: string;
  auto_renew: boolean;
  owner: string;
  notes: string;
  status: string;
  contract_path?: string;
  contract_name?: string;
  has_contract?: boolean;
}

export type Extracted = Partial<Record<keyof Draft, string | number | boolean | null>>;

export function draftFrom(t?: RenewalTool): Draft {
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    id: t?.id,
    name: s(t?.name),
    supplier: s(t?.supplier),
    category: t?.category || 'other',
    sites: s(t?.sites),
    cost_amount: s(t?.cost_amount),
    cost_period: t?.cost_period || 'month',
    contract_start: s(t?.contract_start),
    term_months: s(t?.term_months),
    renewal_date: s(t?.renewal_date),
    notice_days: s(t?.notice_days),
    auto_renew: t ? t.auto_renew : true,
    owner: s(t?.owner),
    notes: s(t?.notes),
    status: t?.status || 'active',
    contract_name: t?.contract_name || undefined,
    has_contract: t?.has_contract,
  };
}

/** Lay extracted values over a draft. Returns the merged draft and which fields came from the contract. */
export function applyExtracted(d: Draft, fields: Extracted | null): { draft: Draft; filled: Set<string> } {
  const filled = new Set<string>();
  if (!fields) return { draft: d, filled };
  const next = { ...d } as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '' || !(k in d)) continue;
    // Don't let a contract overwrite a name the operator already knows the tool by.
    if (k === 'name' && d.name) continue;
    next[k] = typeof v === 'boolean' ? v : String(v);
    filled.add(k);
  }
  return { draft: next as unknown as Draft, filled };
}

interface Props {
  initial: Draft;
  filled: Set<string>;
  warning?: string | null;
  onClose: () => void;
  onSaved: (t: RenewalTool) => void;
  onDeleted: (id: string) => void;
}

export default function ToolEditor({ initial, filled, warning, onClose, onSaved, onDeleted }: Props) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }));

  const preview = d.renewal_date
    ? {
        renewal: nextRenewal({ renewal_date: d.renewal_date, auto_renew: d.auto_renew, term_months: Number(d.term_months) || null }),
        deadline: noticeDeadline({ renewal_date: d.renewal_date, auto_renew: d.auto_renew, term_months: Number(d.term_months) || null, notice_days: Number(d.notice_days) || 0 }),
      }
    : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { id, has_contract: _h, ...body } = d;
    void _h;
    try {
      const res = await fetch(id ? `/api/renewals/tools/${id}` : '/api/renewals/tools', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || 'Could not save.');
      else onSaved(json.tool);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!d.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/renewals/tools/${d.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(d.id);
      else setError('Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  const label = (k: string, text: string) => (
    <span className="flex items-center gap-2 text-xs font-medium text-muted mb-1">
      {text}
      {filled.has(k) && <span className="rounded-full bg-warning-tint text-warning-dark px-2 py-0.5 text-[10px] uppercase tracking-wide">From contract · check</span>}
    </span>
  );
  const field = (k: string) =>
    `w-full bg-surface border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20 ${filled.has(k) ? 'border-warning' : 'border-border'}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl h-full overflow-y-auto bg-bg border-l border-border p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">{d.id ? 'Edit tool' : 'Add tool'}</p>
            <h2 className="font-display uppercase text-2xl">{d.name || 'New tool'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none" aria-label="Close">×</button>
        </div>

        {filled.size > 0 && (
          <div className="mb-5 rounded-2xl bg-warning-tint/60 border border-warning px-4 py-3 text-sm">
            We read {filled.size} detail{filled.size === 1 ? '' : 's'} from <strong>{d.contract_name || 'your contract'}</strong>. Check each highlighted field against the contract before saving — especially the notice period.
          </div>
        )}
        {warning && <div className="mb-5 rounded-2xl bg-surface-2 border border-border px-4 py-3 text-sm">{warning}</div>}

        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2 sm:col-span-1">{label('name', 'Tool')}<input required value={d.name} onChange={e => set('name', e.target.value)} className={field('name')} placeholder="e.g. Lightspeed" /></label>
          <label className="col-span-2 sm:col-span-1">{label('supplier', 'Supplier')}<input value={d.supplier} onChange={e => set('supplier', e.target.value)} className={field('supplier')} /></label>
          <label className="col-span-2 sm:col-span-1">{label('category', 'Category')}
            <select value={d.category} onChange={e => set('category', e.target.value)} className={field('category')}>
              {RENEWAL_CATEGORIES.map(c => <option key={c} value={c}>{RENEWAL_CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">{label('sites', 'Sites')}<input value={d.sites} onChange={e => set('sites', e.target.value)} className={field('sites')} placeholder="All sites" /></label>

          <label>{label('cost_amount', 'Cost (£, ex VAT)')}<input inputMode="decimal" value={d.cost_amount} onChange={e => set('cost_amount', e.target.value.replace(/[^\d.]/g, ''))} className={`${field('cost_amount')} font-mono`} /></label>
          <label>{label('cost_period', 'Per')}
            <select value={d.cost_period} onChange={e => set('cost_period', e.target.value)} className={field('cost_period')}>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="one_off">One-off</option>
            </select>
          </label>

          <label>{label('contract_start', 'Contract start')}<input type="date" value={d.contract_start} onChange={e => set('contract_start', e.target.value)} className={field('contract_start')} /></label>
          <label>{label('term_months', 'Term (months)')}<input inputMode="numeric" value={d.term_months} onChange={e => set('term_months', e.target.value.replace(/\D/g, ''))} className={`${field('term_months')} font-mono`} placeholder="12" /></label>
          <label>{label('renewal_date', 'Renews on')}<input type="date" value={d.renewal_date} onChange={e => set('renewal_date', e.target.value)} className={field('renewal_date')} /></label>
          <label>{label('notice_days', 'Notice (days)')}<input inputMode="numeric" value={d.notice_days} onChange={e => set('notice_days', e.target.value.replace(/\D/g, ''))} className={`${field('notice_days')} font-mono`} placeholder="90" /></label>

          <label className="col-span-2 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={d.auto_renew} onChange={e => set('auto_renew', e.target.checked)} className="w-4 h-4 accent-ink" />
            Renews automatically unless we give notice
            {filled.has('auto_renew') && <span className="rounded-full bg-warning-tint text-warning-dark px-2 py-0.5 text-[10px] uppercase tracking-wide">From contract · check</span>}
          </label>

          {preview?.deadline && d.auto_renew && (
            <div className="col-span-2 rounded-2xl bg-surface border border-border px-4 py-3 text-sm">
              Next renewal <strong>{formatDate(preview.renewal)}</strong> · give notice by <strong>{formatDate(preview.deadline)}</strong>
            </div>
          )}

          <label className="col-span-2 sm:col-span-1">{label('owner', 'Owner at your venue')}<input value={d.owner} onChange={e => set('owner', e.target.value)} className={field('owner')} placeholder="Who looks after it" /></label>
          <label className="col-span-2 sm:col-span-1">{label('status', 'Status')}
            <select value={d.status} onChange={e => set('status', e.target.value)} className={field('status')}>
              <option value="active">Active</option>
              <option value="cancelling">Cancelling</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="col-span-2">{label('notes', 'Notes')}<textarea rows={3} value={d.notes} onChange={e => set('notes', e.target.value)} className={field('notes')} /></label>
        </div>

        {d.id && d.has_contract && (
          <p className="mt-4 text-sm">
            <a href={`/api/renewals/tools/${d.id}/contract`} target="_blank" rel="noreferrer" className="underline">View contract{d.contract_name ? ` (${d.contract_name})` : ''}</a>
          </p>
        )}

        {error && <p className="text-sm text-negative-dark mt-4">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-6 py-2.5 text-sm font-semibold">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm">Cancel</button>
          {d.id && (
            confirmDelete ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                Delete this tool{d.has_contract ? ' and its contract' : ''}?
                <button type="button" onClick={remove} className="text-negative-dark underline">Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted underline">Keep</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto text-sm text-muted underline">Delete</button>
            )
          )}
        </div>
      </form>
    </div>
  );
}
