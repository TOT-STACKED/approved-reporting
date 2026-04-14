'use client';

import { useState, useEffect } from 'react';

interface Partner {
  name: string;
  slug: string;
  leadCount: number;
}

export default function MetricsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerName, setPartnerName] = useState('');
  const [weekStarting, setWeekStarting] = useState('');
  const [sessions, setSessions] = useState('');
  const [users, setUsers] = useState('');
  const [pageViews, setPageViews] = useState('');
  const [bounceRate, setBounceRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/partners')
      .then(r => r.json())
      .then(data => setPartners(data.partners || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerName,
          weekStarting,
          sessions: Number(sessions),
          users: Number(users),
          pageViews: Number(pageViews),
          bounceRate: Number(bounceRate),
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setSessions('');
        setUsers('');
        setPageViews('');
        setBounceRate('');
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      alert('Failed to submit metrics');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Dashboard</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Enter Weekly Metrics</h1>
        <p className="text-gray-500 mt-1">Add GA4 traffic data for a partner</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
          Metrics saved successfully to Airtable.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
          <select
            value={partnerName}
            onChange={e => setPartnerName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">Select a partner...</option>
            {partners.map(p => (
              <option key={p.slug} value={p.name}>{p.name} ({p.leadCount} leads)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Week Starting</label>
          <input
            type="date"
            value={weekStarting}
            onChange={e => setWeekStarting(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sessions</label>
            <input
              type="number"
              value={sessions}
              onChange={e => setSessions(e.target.value)}
              placeholder="e.g. 1245"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Users</label>
            <input
              type="number"
              value={users}
              onChange={e => setUsers(e.target.value)}
              placeholder="e.g. 892"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Page Views</label>
            <input
              type="number"
              value={pageViews}
              onChange={e => setPageViews(e.target.value)}
              placeholder="e.g. 3420"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bounce Rate (%)</label>
            <input
              type="number"
              step="0.1"
              value={bounceRate}
              onChange={e => setBounceRate(e.target.value)}
              placeholder="e.g. 42.5"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save Metrics'}
        </button>
      </form>
    </div>
  );
}
