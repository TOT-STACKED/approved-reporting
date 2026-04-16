'use client';

import { useEffect, useState } from 'react';

type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

interface Review {
  id: string;
  businessName: string;
  industry: string;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  created_at: string;
  submissionType: string;
  tools: { category: string; tool_name: string }[];
}

interface StacksData {
  reviews: Review[];
  totalReviews: number;
  totalEntries: number;
  topTools: { name: string; category: string; count: number; uniqueBusinesses: number }[];
  categories: { category: string; count: number }[];
}

function getDateCutoff(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case 'quarter':
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case 'year':
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'all':
      return null;
  }
}

function filterByPeriod(reviews: Review[], period: Period) {
  const cutoff = getDateCutoff(period);
  if (!cutoff) return reviews;
  return reviews.filter(r => new Date(r.created_at) >= cutoff);
}

function computeStats(reviews: Review[]) {
  const toolCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  let totalEntries = 0;

  for (const r of reviews) {
    for (const t of r.tools) {
      const key = t.tool_name.toLowerCase().trim();
      toolCounts[key] = (toolCounts[key] || 0) + 1;
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      totalEntries++;
    }
  }

  const topTools = Object.entries(toolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }));

  const categories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  return { totalEntries, topTools, categories };
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
  year: 'This Year',
  all: 'All Time',
};

export default function StacksDashboard() {
  const [data, setData] = useState<StacksData | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stacks')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-400 text-sm">Loading stacks data...</p>
      </div>
    );
  }

  if (!data) return null;

  const filtered = filterByPeriod(data.reviews, period);
  const stats = computeStats(filtered);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Stacks</h2>
          <p className="text-xs text-gray-500">StackCollect tech stack review data</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white text-center">
          <p className="text-2xl sm:text-3xl font-bold">{filtered.length}</p>
          <p className="text-xs opacity-80 mt-1">Reviews</p>
        </div>
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white text-center">
          <p className="text-2xl sm:text-3xl font-bold">{stats.totalEntries.toLocaleString()}</p>
          <p className="text-xs opacity-80 mt-1">Tool Selections</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white text-center">
          <p className="text-2xl sm:text-3xl font-bold">{stats.categories.length}</p>
          <p className="text-xs opacity-80 mt-1">Categories</p>
        </div>
      </div>

      {/* Top Tools + Categories side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Tools */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Tools</h3>
          {stats.topTools.length === 0 ? (
            <p className="text-xs text-gray-400">No data for this period</p>
          ) : (
            <div className="space-y-2">
              {stats.topTools.map((tool, i) => {
                const maxCount = stats.topTools[0].count;
                return (
                  <div key={tool.name} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-gray-700">{tool.name}</span>
                        <span className="text-xs text-gray-500">{tool.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${(tool.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Categories</h3>
          {stats.categories.length === 0 ? (
            <p className="text-xs text-gray-400">No data for this period</p>
          ) : (
            <div className="space-y-2">
              {stats.categories.slice(0, 10).map(cat => {
                const maxCount = stats.categories[0].count;
                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-gray-700">{cat.category}</span>
                        <span className="text-xs text-gray-500">{cat.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${(cat.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Reviews */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Recent Reviews
            <span className="text-xs font-normal text-gray-400 ml-2">({filtered.length} total)</span>
          </h3>
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium">Venue</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Location</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Date</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Tools</th>
                  <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium">Top Picks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 20).map(review => (
                  <tr key={review.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 sm:px-5 text-gray-800 font-medium whitespace-nowrap">
                      {review.businessName}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {review.location || '—'}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="py-2 px-2 text-center text-gray-800 font-medium">{review.tools.length}</td>
                    <td className="py-2 px-4 sm:px-5">
                      <div className="flex flex-wrap gap-1">
                        {review.tools.slice(0, 4).map((t, i) => (
                          <span key={i} className="inline-block bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px]">
                            {t.tool_name}
                          </span>
                        ))}
                        {review.tools.length > 4 && (
                          <span className="text-gray-400 text-[10px]">+{review.tools.length - 4}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
