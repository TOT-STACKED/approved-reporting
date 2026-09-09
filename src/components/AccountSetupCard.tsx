'use client';

import { useState } from 'react';

// Shown at the top of a partner's token link when they haven't set up an
// account yet. Skippable on purpose: the link already works, and a hard gate
// here would lock out anyone the setup flow doesn't suit. It converts a link
// they have to keep into a sign-in they can repeat.

export default function AccountSetupCard({
  token,
  partnerName,
}: {
  token: string;
  partnerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (dismissed) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/partner/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, email, mobile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not set that up. Try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
        <p className="font-semibold text-emerald-800">You&apos;re set up.</p>
        <p className="text-sm text-gray-600 mt-1">
          Next time, go straight to{' '}
          <a href="/signin" className="underline hover:no-underline font-medium">
            partners.wearestacked.io
          </a>{' '}
          and sign in with {email} — we&apos;ll send you a code. No need to keep this link.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-brand-yellow rounded-xl p-5 mb-6">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Set up your {partnerName} account</p>
            <p className="text-sm text-gray-600 mt-0.5">
              So you can sign in at partners.wearestacked.io instead of keeping this link.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-gray-600 underline hover:no-underline"
            >
              Not now
            </button>
            <button
              onClick={() => setOpen(true)}
              className="bg-brand-orange hover:bg-orange-400 active:bg-orange-600 text-brand-green rounded-full px-4 py-2 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors whitespace-nowrap"
            >
              Set up account
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 max-w-lg">
          <p className="font-semibold">Set up your {partnerName} account</p>
          <p className="text-sm text-gray-600">
            Anyone at {partnerName} can set one up from this link — your colleagues don&apos;t
            need an invite.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
            <input
              required
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Work email"
              autoComplete="email"
              className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
          </div>
          <input
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            placeholder="Mobile (optional — for codes by text later)"
            autoComplete="tel"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-5 py-2.5 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
            >
              {busy ? 'Setting up…' : 'Create my account'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-600 underline hover:no-underline"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">
            No password needed. We send a six-digit code each time you sign in.
          </p>
        </form>
      )}
    </div>
  );
}
