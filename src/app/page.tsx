'use client';

import { useEffect, useState } from 'react';
import AskBox from '@/components/AskBox';
import StacksDashboard from '@/components/StacksDashboard';

interface Partner {
  name: string;
  slug: string;
  leadCount: number;
  statusBreakdown: Record<string, number>;
}

interface Activity {
  impressions: number;
  engagements: number;
  leadsGenerated: number;
  pipelineValue: number;
}

export default function Dashboard() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenPartners, setHiddenPartners] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('hiddenPartners');
    if (saved) setHiddenPartners(JSON.parse(saved));

    Promise.all([
      fetch('/api/partners').then(r => r.json()),
      fetch('/api/activity').then(r => r.json()),
    ])
      .then(([partnerData, activityData]) => {
        setPartners(partnerData.partners || []);
        setActivities(activityData.activities || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggleHide = (slug: string) => {
    setHiddenPartners(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug];
      localStorage.setItem('hiddenPartners', JSON.stringify(next));
      return next;
    });
  };

  const visiblePartners = partners.filter(p => !hiddenPartners.includes(p.slug));
  const hiddenList = partners.filter(p => hiddenPartners.includes(p.slug));

  const totalLeads = partners.reduce((s, p) => s + p.leadCount, 0);

  // Aggregate all statuses dynamically from Airtable
  const allStatuses: Record<string, number> = {};
  partners.forEach(p => {
    Object.entries(p.statusBreakdown).forEach(([status, count]) => {
      const key = status.trim();
      if (key) allStatuses[key] = (allStatuses[key] || 0) + count;
    });
  });

  // Sort statuses by count for display
  const sortedStatuses = Object.entries(allStatuses)
    .sort(([, a], [, b]) => b - a)
    .filter(([status]) => status !== 'N/A' && status !== 'Closed Lost');

  // Assign colours dynamically to each status
  const STATUS_COLORS = ['bg-gray-300', 'bg-blue-500', 'bg-amber-400', 'bg-emerald-500', 'bg-purple-500', 'bg-red-400', 'bg-teal-500', 'bg-pink-400', 'bg-indigo-400', 'bg-orange-400'];

  // Marketing reach
  const totalReach = activities.reduce((s, a) => s + a.impressions, 0);
  const totalEngagements = activities.reduce((s, a) => s + a.engagements, 0);
  const totalPipeline = activities.reduce((s, a) => s + a.pipelineValue, 0);

  // Top 3 statuses for KPI cards (after N/A)
  const topStatuses = sortedStatuses.slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-lg">Loading partner data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        <p className="font-semibold">Error loading data</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Partner Dashboard</h1>
        <p className="text-gray-500 mt-1">Performance snapshot across all approved partners</p>
      </div>

      <AskBox />

      {/* Hero KPIs - The Story */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{totalLeads.toLocaleString()}</p>
          <p className="text-sm opacity-80 mt-1">Total Leads</p>
          <p className="text-xs opacity-60 mt-2">Across {partners.length} partners</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{totalReach.toLocaleString()}</p>
          <p className="text-sm opacity-80 mt-1">Total Reach</p>
          <p className="text-xs opacity-60 mt-2">{totalEngagements.toLocaleString()} engagements</p>
        </div>
        {topStatuses.map(([status, count], i) => {
          const gradients = [
            'from-emerald-500 to-emerald-600',
            'from-purple-600 to-purple-700',
            'from-teal-500 to-teal-600',
          ];
          return (
            <div key={status} className={`bg-gradient-to-br ${gradients[i]} rounded-xl p-5 text-white`}>
              <p className="text-3xl font-bold">{count}</p>
              <p className="text-sm opacity-80 mt-1">{status}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline breakdown bar — dynamic from Airtable */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Pipeline Breakdown</h2>
          {totalPipeline > 0 && (
            <span className="text-sm font-semibold text-green-600">£{totalPipeline.toLocaleString()} pipeline value</span>
          )}
        </div>
        <div className="flex rounded-full overflow-hidden h-4 bg-gray-100">
          {totalLeads > 0 && sortedStatuses.map(([status, count], i) => (
            <div
              key={status}
              className={`${STATUS_COLORS[i % STATUS_COLORS.length]} h-full`}
              style={{ width: `${(count / totalLeads) * 100}%` }}
              title={`${status}: ${count}`}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-3 text-xs text-gray-500 flex-wrap">
          {sortedStatuses.map(([status, count], i) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[i % STATUS_COLORS.length]} inline-block`}></span>
              {status} ({count})
            </span>
          ))}
          {(allStatuses['N/A'] || 0) > 0 && (
            <span className="flex items-center gap-1 text-gray-400">
              + {allStatuses['N/A']} unclassified
            </span>
          )}
        </div>
      </div>

      {/* Stacks Section */}
      <div className="mb-8">
        <StacksDashboard />
      </div>

      {/* Partner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visiblePartners.map(partner => {
          // Show top 2 non-N/A statuses dynamically
          const partnerStatuses = Object.entries(partner.statusBreakdown)
            .map(([s, c]) => [s.trim(), c] as [string, number])
            .filter(([s]) => s && s !== 'N/A' && s !== 'Closed Lost')
            .sort(([, a], [, b]) => b - a);

          return (
            <div key={partner.slug} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-orange-300 hover:shadow-md transition-all group relative">
              <button
                onClick={() => toggleHide(partner.slug)}
                className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Hide partner"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.05 6.05m3.828 3.828L6.05 6.05M6.05 6.05l-3 -3m14.95 14.95L21 21" />
                </svg>
              </button>
              <a href={`/partners/${partner.slug}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                    {partner.name}
                  </h3>
                  <span className="text-xs text-gray-400 group-hover:text-orange-400 mr-5">View &rarr;</span>
                </div>
                <div className="flex items-center gap-5">
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{partner.leadCount}</p>
                    <p className="text-xs text-gray-500">leads</p>
                  </div>
                  {partnerStatuses.slice(0, 2).map(([status, count]) => (
                    <div key={status}>
                      <p className="text-lg font-bold text-gray-700">{count}</p>
                      <p className="text-xs text-gray-500">{status}</p>
                    </div>
                  ))}
                </div>
              </a>
            </div>
          );
        })}
      </div>

      {/* Hidden Partners */}
      {hiddenList.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <svg className={`w-4 h-4 transition-transform ${showHidden ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {hiddenList.length} hidden {hiddenList.length === 1 ? 'partner' : 'partners'}
          </button>
          {showHidden && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hiddenList.map(p => (
                <button
                  key={p.slug}
                  onClick={() => toggleHide(p.slug)}
                  className="text-xs bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600 px-3 py-1.5 rounded-full border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
