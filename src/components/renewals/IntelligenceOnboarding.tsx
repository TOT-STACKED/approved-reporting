'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONSENT_TEXT,
  REVIEW_CATEGORIES,
  VENUE_TYPES,
  otherKey,
  type Stack,
  type StackEntry,
} from '@/lib/intelligence-review';

// Sign-up for venues new to Stacked: the Intelligence Review, inside Renewals.
// About you → one screen per category → finish. What they pick becomes their
// Renewals tool list, and the review is saved as a normal Intelligence Review.

const EMPTY: StackEntry = { tools: [], other: '', none: false, nps: {} };

interface About {
  firstName: string;
  lastName: string;
  venueName: string;
  venueType: string;
  siteCount: string;
  location: string;
  phone: string;
}

export default function IntelligenceOnboarding({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [about, setAbout] = useState<About>({ firstName: '', lastName: '', venueName: '', venueType: '', siteCount: '', location: '', phone: '' });
  const [stack, setStack] = useState<Stack>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const total = REVIEW_CATEGORIES.length + 2;
  const finish = total - 1;
  const category = step >= 1 && step < finish ? REVIEW_CATEGORIES[step - 1] : null;
  const entry = (category && stack[category.id]) || EMPTY;

  const aboutOk = about.firstName.trim() && about.lastName.trim() && about.venueName.trim() && about.venueType &&
    Number(about.siteCount) >= 1 && about.location.trim() && about.phone.replace(/\D/g, '').length >= 7;

  const picked = Object.values(stack).reduce((n, e) => n + (e.none ? 0 : e.tools.length + (e.other.trim() ? 1 : 0)), 0);
  const rated = Object.values(stack).reduce((n, e) => n + Object.keys(e.nps).length, 0);

  function update(id: string, fn: (e: StackEntry) => StackEntry) {
    setStack(prev => ({ ...prev, [id]: fn(prev[id] || EMPTY) }));
  }

  function toggleTool(tool: string) {
    if (!category) return;
    update(category.id, e => {
      const has = e.tools.includes(tool);
      const nps = { ...e.nps };
      if (has) delete nps[tool];
      return { ...e, none: false, tools: has ? e.tools.filter(t => t !== tool) : [...e.tools, tool], nps };
    });
  }

  function setOther(value: string) {
    if (!category) return;
    update(category.id, e => {
      const nps = { ...e.nps };
      const old = e.other.trim() ? otherKey(e.other) : '';
      const score = old ? nps[old] : undefined;
      if (old) delete nps[old];
      if (value.trim() && typeof score === 'number') nps[otherKey(value)] = score;
      return { ...e, none: false, other: value, nps };
    });
  }

  function rate(key: string, score: number) {
    if (!category) return;
    update(category.id, e => ({ ...e, nps: { ...e.nps, [key]: score } }));
  }

  function toggleNone() {
    if (!category) return;
    update(category.id, e => (e.none ? { ...EMPTY } : { ...EMPTY, none: true }));
  }

  async function submit() {
    if (picked > 0 && rated === 0) {
      setError('Rate at least one of your tools. It takes a second and makes your report far more useful.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/renewals/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...about, siteCount: Number(about.siteCount), stack, consent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong.');
        setBusy(false);
        return;
      }
      router.push('/renewals');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const input = 'w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20';
  const primary = 'bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-40 text-white rounded-full px-6 py-2.5 text-sm font-semibold';
  const ghost = 'rounded-full border border-border bg-surface px-5 py-2.5 text-sm';

  const toolsHere = category ? [...entry.tools, ...(entry.other.trim() ? [entry.other.trim()] : [])] : [];

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex justify-between text-xs text-muted mb-2">
          <span>Step {step + 1} of {total}</span>
          <span>{email}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-series-1 transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        <section>
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-2">Welcome to Stacked Renewals</p>
          <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none mb-3">First, your venue</h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Next, tell us which tech you run. Five minutes, and it does two jobs: it builds your Renewals list, and it gets you a free Intelligence report showing how your stack compares with similar venues.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="First name" autoComplete="given-name" value={about.firstName} onChange={e => setAbout({ ...about, firstName: e.target.value })} />
            <input className={input} placeholder="Last name" autoComplete="family-name" value={about.lastName} onChange={e => setAbout({ ...about, lastName: e.target.value })} />
            <input className={`${input} col-span-2`} placeholder="Venue or brand name" autoComplete="organization" value={about.venueName} onChange={e => setAbout({ ...about, venueName: e.target.value })} />
            <input className={input} placeholder="Town or city" autoComplete="address-level2" value={about.location} onChange={e => setAbout({ ...about, location: e.target.value })} />
            <input className={input} placeholder="Number of sites" inputMode="numeric" value={about.siteCount} onChange={e => setAbout({ ...about, siteCount: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            <input className={`${input} col-span-2`} placeholder="Phone number" type="tel" autoComplete="tel" value={about.phone} onChange={e => setAbout({ ...about, phone: e.target.value })} />
          </div>
          <p className="text-xs font-medium text-muted mt-5 mb-2">What kind of venue?</p>
          <div className="flex flex-wrap gap-2">
            {VENUE_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setAbout({ ...about, venueType: t.id })}
                className={`rounded-full border px-4 py-2 text-sm ${about.venueType === t.id ? 'bg-ink text-white border-ink' : 'bg-surface border-border'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-8">
            <button className={primary} disabled={!aboutOk} onClick={() => setStep(1)}>Next: your tech</button>
          </div>
        </section>
      )}

      {category && (
        <section key={category.id}>
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-2">Your tech</p>
          <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none mb-2">{category.label}</h1>
          <p className="text-sm text-muted mb-6">{category.hint}. Pick everything you use.</p>

          <div className="flex flex-wrap gap-2">
            {category.options.map(tool => {
              const on = entry.tools.includes(tool);
              return (
                <button key={tool} type="button" onClick={() => toggleTool(tool)}
                  className={`rounded-full border px-3.5 py-2 text-sm ${on ? 'bg-ink text-white border-ink' : 'bg-surface border-border hover:border-ink/30'}`}>
                  {tool}
                </button>
              );
            })}
          </div>
          <input className={`${input} mt-4`} placeholder="Something else? Type it here" value={entry.other} onChange={e => setOther(e.target.value)} />
          <label className="flex items-center gap-2 text-sm mt-4">
            <input type="checkbox" checked={entry.none} onChange={toggleNone} className="w-4 h-4 accent-ink" />
            We don&apos;t use anything here, or not sure
          </label>

          {toolsHere.length > 0 && (
            <div className="mt-6 bg-surface border border-border rounded-[18px] p-4 space-y-4">
              <p className="text-sm"><strong>How likely are you to recommend it?</strong> <span className="text-muted">0 = not at all, 10 = definitely</span></p>
              {toolsHere.map(name => {
                const key = entry.tools.includes(name) ? name : otherKey(name);
                const score = entry.nps[key];
                return (
                  <div key={key}>
                    <p className="text-sm font-medium mb-1.5">{name}</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 11 }, (_, n) => (
                        <button key={n} type="button" onClick={() => rate(key, n)}
                          className={`w-8 h-8 rounded-lg text-xs font-mono border ${score === n ? 'bg-ink text-white border-ink' : 'bg-bg border-border hover:border-ink/30'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between mt-8">
            <button className={ghost} onClick={() => setStep(step - 1)}>Back</button>
            <button className={primary} onClick={() => setStep(step + 1)}>Next</button>
          </div>
        </section>
      )}

      {step === finish && (
        <section>
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-2">Nearly there</p>
          <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none mb-3">Create your account</h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            You picked {picked} tool{picked === 1 ? '' : 's'}{picked > 0 ? ` and rated ${rated}` : ''}. We&apos;ll put {picked === 1 ? 'it' : 'them'} on your Renewals list so you can add costs and renewal dates. Your Intelligence report will arrive by email in a few minutes.
          </p>
          <label className="flex items-start gap-3 text-sm bg-surface border border-border rounded-[18px] p-4">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-ink" />
            <span>{CONSENT_TEXT}</span>
          </label>
          <p className="text-xs text-dim mt-3 leading-relaxed">
            The costs, contracts and renewal dates you add to Renewals are private to your team. Stacked never shares them with suppliers.
          </p>
          {error && <p className="text-sm text-negative-dark mt-4">{error}</p>}
          <div className="flex justify-between mt-8">
            <button className={ghost} onClick={() => setStep(step - 1)} disabled={busy}>Back</button>
            <button className={primary} onClick={submit} disabled={busy}>{busy ? 'Setting up…' : 'Create my account'}</button>
          </div>
        </section>
      )}
    </main>
  );
}
