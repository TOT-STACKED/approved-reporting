'use client';

import { useEffect, useRef, useState } from 'react';

// Ask Renewals: a chat panel over the operator's own software and contracts.
// A floating button opens it from anywhere on the dashboard. The conversation
// lives only in this tab; nothing is stored.

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How does my tech stack look?',
  'Which notice deadlines do I need to act on this month?',
  'What am I spending on software in total?',
  'Am I paying for anything twice?',
  'Where are the gaps in my stack?',
  'Draft a cancellation email for my next renewal',
];

export default function AskRenewals() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/renewals/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || 'Something went wrong.');
      else setTurns([...next, { role: 'assistant', content: json.answer }]);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink text-white pl-4 pr-5 py-3 text-sm font-semibold shadow-lg hover:bg-ink-deep"
        >
          <span aria-hidden className="text-base leading-none">✦</span> Ask Renewals
        </button>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 w-full sm:w-[400px] h-[80vh] sm:h-[600px] flex flex-col bg-bg border border-border sm:rounded-[18px] rounded-t-[18px] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-surface border-b border-border">
            <div>
              <p className="font-display uppercase text-lg leading-none">Ask Renewals</p>
              <p className="text-xs text-muted mt-1">About your stack, spend and contracts</p>
            </div>
            <div className="flex items-center gap-3">
              {turns.length > 0 && (
                <button onClick={() => { setTurns([]); setError(''); }} className="text-xs text-muted underline">New chat</button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink text-2xl leading-none" aria-label="Close">×</button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted px-1 pb-1">Try asking:</p>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => ask(s)} className="block w-full text-left text-sm bg-surface border border-border rounded-xl px-3 py-2.5 hover:border-ink/30">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex'}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    t.role === 'user' ? 'bg-ink text-white rounded-br-md' : 'bg-surface border border-border rounded-bl-md'
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex">
                <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-muted">Checking your data…</div>
              </div>
            )}
            {error && <p className="text-sm text-negative-dark px-1">{error}</p>}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); ask(input); }}
            className="border-t border-border bg-surface p-3 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
              }}
              placeholder="Ask about your stack, renewals or a contract…"
              maxLength={2000}
              className="flex-1 resize-none max-h-32 bg-bg border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
            <button type="submit" disabled={busy || !input.trim()} className="bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-full px-4 py-2.5 text-sm font-semibold">
              Ask
            </button>
          </form>
          <p className="text-[11px] text-dim px-4 pb-3 bg-surface">Answers come from your own data. Always check notice terms in the contract itself.</p>
        </div>
      )}
    </>
  );
}
