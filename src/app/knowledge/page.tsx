'use client';

import { useEffect, useState } from 'react';

interface KnowledgeEntry {
  id: string;
  created_at: string;
  url: string;
  title: string | null;
  notes: string | null;
  domain: string | null;
  fetch_ok: boolean;
  fetch_error: string | null;
}

interface Source {
  n: number;
  title: string;
  url: string;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [askError, setAskError] = useState('');

  const [search, setSearch] = useState('');

  async function load() {
    try {
      const r = await fetch('/api/kb', { credentials: 'include' });
      const d = await r.json();
      setEntries(d.entries || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const r = await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), notes: notes.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to add link');
      setUrl('');
      setNotes('');
      setEntries(prev => [d.entry, ...prev]);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add link');
    } finally {
      setAdding(false);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAskError('');
    setAnswer('');
    setSources([]);
    try {
      const r = await fetch('/api/kb/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to answer');
      setAnswer(d.answer);
      setSources(d.sources || []);
    } catch (err: any) {
      setAskError(err.message || 'Failed to answer');
    } finally {
      setAsking(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this link from the knowledge base?')) return;
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await fetch(`/api/kb?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      load(); // resync on failure
    }
  }

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.title || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q) ||
      (e.url || '').toLowerCase().includes(q) ||
      (e.domain || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-green">Knowledge Base</h1>
        <p className="text-gray-500 mt-1">
          A searchable library of links — quotes, proposals, articles, research.
          Add a URL and the AI can answer questions from the page content.
        </p>
      </div>

      {/* AI ask */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mb-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-brand-cream text-brand-green">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <h2 className="font-semibold text-gray-900">Ask the knowledge base</h2>
        </div>
        <form onSubmit={ask} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. what did we quote Bizimply for the EPOS rollout?"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-sm text-gray-800 placeholder-gray-400"
            disabled={asking}
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="px-5 py-3 bg-brand-green hover:bg-brand-green-soft disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {asking ? 'Thinking…' : 'Ask AI'}
          </button>
        </form>
        {askError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {askError}
          </div>
        )}
        {answer && (
          <div className="mt-4 bg-brand-cream border border-brand-green/15 rounded-lg p-4">
            <p className="text-xs font-medium text-brand-green mb-2">AI Answer</p>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{answer}</p>
            {sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-brand-green/15">
                <p className="text-[11px] font-medium text-gray-500 mb-1.5">Sources</p>
                <ul className="space-y-1">
                  {sources.map(s => (
                    <li key={s.n} className="text-xs">
                      <span className="text-gray-400">[{s.n}]</span>{' '}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-green hover:text-brand-green-soft underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add link */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">Add a link</h2>
        <form onSubmit={addLink} className="space-y-3">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-sm text-gray-800 placeholder-gray-400"
            disabled={adding}
          />
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional note — what is this, why it matters…"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-sm text-gray-800 placeholder-gray-400"
            disabled={adding}
          />
          {addError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {addError}
            </div>
          )}
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="bg-brand-green hover:bg-brand-green-soft disabled:bg-gray-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {adding ? 'Fetching page…' : 'Add to knowledge base'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-900">
            Saved links
            <span className="text-xs font-normal text-gray-400 ml-2">({entries.length})</span>
          </h2>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by title, note, domain…"
            className="px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 outline-none text-sm text-gray-800 placeholder-gray-400 sm:w-72"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6">
            {entries.length === 0 ? 'No links yet. Add one above.' : 'No links match that filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(e => (
              <li key={e.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-green hover:text-brand-green-soft underline break-words"
                  >
                    {e.title || e.url}
                  </a>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {e.domain && (
                      <span className="text-[11px] text-gray-400">{e.domain}</span>
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        e.fetch_ok
                          ? 'bg-brand-lime/40 text-brand-green'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                      title={e.fetch_ok ? 'Page content indexed for AI search' : e.fetch_error || 'Content not retrievable — searchable by title/notes only'}
                    >
                      {e.fetch_ok ? 'indexed' : 'title/notes only'}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {e.notes && <p className="text-xs text-gray-600 mt-1.5">{e.notes}</p>}
                </div>
                <button
                  onClick={() => remove(e.id)}
                  className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                  title="Remove"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
