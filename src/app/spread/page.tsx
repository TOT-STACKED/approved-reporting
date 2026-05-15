'use client';

import { useState, useEffect } from 'react';

interface SpreadEntry {
  id?: string;
  editionTitle: string;
  weekStarting: string;
  summary: string;
  keyHighlights: string;
  linkedinUrl: string;
  author: string;
}

export default function SpreadPage() {
  const [spreads, setSpreads] = useState<SpreadEntry[]>([]);
  const [editionTitle, setEditionTitle] = useState('');
  const [weekStarting, setWeekStarting] = useState('');
  const [summary, setSummary] = useState('');
  const [keyHighlights, setKeyHighlights] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [author, setAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadSpreads = () => {
    fetch('/api/spread')
      .then(r => r.json())
      .then(data => setSpreads(data.spreads || []));
  };

  useEffect(() => { loadSpreads(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/spread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editionTitle, weekStarting, summary, keyHighlights, linkedinUrl, author }),
      });

      if (res.ok) {
        setSuccess(true);
        setEditionTitle('');
        setSummary('');
        setKeyHighlights('');
        setLinkedinUrl('');
        loadSpreads();
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      alert('Failed to save spread entry');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Dashboard</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">The Weekly Spread</h1>
        <p className="text-gray-500 mt-1">Enter your weekly LinkedIn newsletter summary for partner reports</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
          Spread entry saved successfully.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Edition Title</label>
            <input
              type="text"
              value={editionTitle}
              onChange={e => setEditionTitle(e.target.value)}
              placeholder="e.g. Tech on Toast Weekly Spread #42"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Week Starting</label>
              <input
                type="date"
                value={weekStarting}
                onChange={e => setWeekStarting(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="e.g. Chris"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={4}
              placeholder="Paste or write the main body of this week's spread..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key Highlights</label>
            <textarea
              value={keyHighlights}
              onChange={e => setKeyHighlights(e.target.value)}
              rows={3}
              placeholder="Bullet points of key things that happened this week (one per line)&#10;- New partner onboarded&#10;- Event attended&#10;- Product update shipped"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn Post URL</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              placeholder="https://www.linkedin.com/pulse/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-green hover:bg-brand-green-soft text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Spread Entry'}
          </button>
        </form>

        {/* Recent Spreads */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Recent Editions</h2>
          <div className="space-y-3">
            {spreads.length === 0 && (
              <p className="text-gray-400 text-sm">No editions yet. Add your first one!</p>
            )}
            {spreads.slice(0, 8).map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="font-medium text-gray-900 text-sm">{s.editionTitle}</p>
                <p className="text-xs text-gray-500 mt-1">Week of {s.weekStarting}{s.author ? ` by ${s.author}` : ''}</p>
                {s.summary && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2">{s.summary}</p>
                )}
                {s.linkedinUrl && (
                  <a href={s.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-green hover:text-brand-green-soft mt-2 inline-block">
                    View on LinkedIn &rarr;
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
