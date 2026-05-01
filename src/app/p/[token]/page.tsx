'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PartnerNps, { type PartnerNpsData } from '@/components/PartnerNps';
import ConversionTimeline from '@/components/ConversionTimeline';

interface Lead {
  id: string;
  businessName: string;
  status: string;
  source: string;
  owner: string;
  stage: string;
  lastModified: string;
  date?: string;
}

interface MetricsEntry {
  weekStarting: string;
  sessions: number;
  users: number;
  pageViews: number;
  bounceRate: number;
}

interface Activity {
  activityTitle: string;
  activityType: string;
  date: string;
  impressions: number;
  engagements: number;
}

interface PartnerDetail {
  name: string;
  slug: string;
  leadCount: number;
  statusBreakdown: Record<string, number>;
  stageBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  ownerBreakdown: Record<string, number>;
  leads: Lead[];
  recentLeads: Lead[];
}

export default function SecurePartnerPage() {
  const params = useParams();
  const token = params.token as string;
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stackCollect, setStackCollect] = useState<{
    mentions: number;
    categories: { category: string; count: number }[];
    totalReviews: number;
    marketShare: string;
  } | null>(null);
  const [nps, setNps] = useState<PartnerNpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [narrativeInput, setNarrativeInput] = useState('');

  useEffect(() => {
    fetch(`/api/p/${token}`)
      .then(r => {
        if (r.status === 401) {
          setUnauthorized(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setPartner(data.partner);
        setMetrics(data.metrics || []);
        setActivities(data.activities || []);
        setStackCollect(data.stackCollect || null);
        setNps(data.nps || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const generateReport = async () => {
    if (!partner) return;
    setGenerating(true);
    setShowNarrative(false);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerName: partner.name, slug: partner.slug, narrativeContext: narrativeInput }),
      });
      const html = await res.text();
      setReportHtml(html);

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${partner.name.replace(/[^a-zA-Z0-9]/g, '_')}_Value_Report.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('Failed to generate report');
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center shadow-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11-7a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500">This link is invalid or has expired. Please contact Tech on Toast for a new link.</p>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Partner not found</div>
      </div>
    );
  }

  const totalSessions = metrics.reduce((s, m) => s + m.sessions, 0);
  const totalUsers = metrics.reduce((s, m) => s + m.users, 0);
  const totalPageViews = metrics.reduce((s, m) => s + m.pageViews, 0);
  const avgBounce = metrics.length > 0
    ? (metrics.reduce((s, m) => s + m.bounceRate, 0) / metrics.length * 100).toFixed(1)
    : 'N/A';

  const mqlCount = partner.statusBreakdown['MQL'] || 0;
  const sqlCount = partner.statusBreakdown['SQL'] || 0;
  const closedWon = (partner.statusBreakdown['Closed Won'] || 0) +
    (partner.statusBreakdown['Closed Won '] || 0) +
    (partner.stageBreakdown['Closed Won'] || 0) +
    (partner.stageBreakdown['Closed Won '] || 0);

  const totalImpressions = activities.reduce((s, a) => s + a.impressions, 0);
  const totalEngagements = activities.reduce((s, a) => s + a.engagements, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Standalone header */}
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              ToT
            </div>
            <span className="font-semibold text-gray-900 text-lg">{partner.name}</span>
          </div>
          <span className="text-xs text-gray-400">Partner Portal</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{partner.name} Dashboard</h1>
            <p className="text-gray-500 text-sm">{partner.leadCount} total leads referred by Tech on Toast</p>
          </div>
          <button
            onClick={() => setShowNarrative(true)}
            disabled={generating}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {/* Narrative Input */}
        {showNarrative && (
          <div className="bg-white rounded-xl border-2 border-orange-200 p-5 sm:p-6 mb-8 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-2">Add context for the report summary</h2>
            <p className="text-sm text-gray-500 mb-4">Notes about this month — we&apos;ll write a professional narrative for the report.</p>
            <textarea
              value={narrativeInput}
              onChange={e => setNarrativeInput(e.target.value)}
              rows={3}
              placeholder="e.g. Great month — featured in 3 Spread editions, strong uptick in inbound leads..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={generateReport} disabled={generating}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate Report'}
              </button>
              <button onClick={() => setShowNarrative(false)}
                className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* KPI Cards — MQL, SQL, Closed Won + Total Leads */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 sm:p-5 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{mqlCount}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">MQL</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 sm:p-5 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{sqlCount}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">SQL</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 sm:p-5 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{closedWon}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">Closed Won</p>
          </div>
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{partner.leadCount}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">Total Leads</p>
            <p className="text-[10px] sm:text-xs opacity-60 mt-2">{partner.recentLeads.length} active last 90d</p>
          </div>
        </div>

        {/* Conversion Timeline */}
        <div className="mb-6 sm:mb-8">
          <ConversionTimeline
            leads={partner.leads}
            mqlCount={mqlCount}
            sqlCount={sqlCount}
            closedWonCount={closedWon}
          />
        </div>

        {/* GA4 Traffic */}
        <div className="bg-gradient-to-br from-white to-orange-50/40 rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 mb-6 sm:mb-8">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-100 text-orange-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </span>
              <h2 className="text-base font-semibold text-gray-900">Page Traffic</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Live GA4
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 ml-8">
              Filter to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 text-[11px]">/partners/{partner.slug}</code> in the dropdown
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-inner">
            <iframe
              src="https://datastudio.google.com/embed/reporting/a2df8bed-3635-4a61-ab35-d4e370ce7b09/page/HqswF"
              className="w-full block"
              style={{ height: '520px', border: 0 }}
              allowFullScreen
              sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              title="Page Traffic"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Status Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Lead Status</h2>
            <div className="space-y-2">
              {Object.entries(partner.statusBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{status}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 sm:w-32 bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 rounded-full h-2"
                          style={{ width: `${(count / partner.leadCount) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Source Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Lead Sources</h2>
            <div className="space-y-2">
              {Object.entries(partner.sourceBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{source}</span>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Marketing Activities */}
        {activities.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
            <h2 className="font-semibold text-gray-900 mb-4">
              Marketing Activity
              <span className="text-gray-400 font-normal ml-2 text-sm">{totalImpressions.toLocaleString()} reach · {totalEngagements.toLocaleString()} engagements</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Activity</th>
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Type</th>
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Date</th>
                    <th className="text-right py-3 px-3 text-gray-500 font-medium">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, 15).map((a, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3 px-3 text-gray-900">{a.activityTitle}</td>
                      <td className="py-3 px-3">
                        <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">{a.activityType}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{a.date}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{a.impressions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* StackCollect */}
        {stackCollect && stackCollect.mentions > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
            <h2 className="font-semibold text-gray-900 mb-4">StackCollect - Tech Stack Reviews</h2>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
              <div className="bg-indigo-50 rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-indigo-600">{stackCollect.mentions}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Times selected</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-indigo-600">{stackCollect.marketShare}%</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Market share</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-indigo-600">{stackCollect.totalReviews}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Total reviews</p>
              </div>
            </div>
            {stackCollect.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stackCollect.categories.map(c => (
                  <span key={c.category} className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    {c.category} ({c.count})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Partner NPS */}
        {nps && partner && (
          <PartnerNps data={nps} partnerName={partner.name} />
        )}

        {/* Metrics Table */}
        {metrics.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
            <h2 className="font-semibold text-gray-900 mb-4">Site Traffic - Weekly</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Week</th>
                    <th className="text-right py-3 px-3 text-gray-500 font-medium">Sessions</th>
                    <th className="text-right py-3 px-3 text-gray-500 font-medium">Users</th>
                    <th className="text-right py-3 px-3 text-gray-500 font-medium">Page Views</th>
                    <th className="text-right py-3 px-3 text-gray-500 font-medium">Bounce</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3 px-3 text-gray-900">{m.weekStarting}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{m.sessions.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{m.users.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{m.pageViews.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{(m.bounceRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-3 px-3">Total</td>
                    <td className="py-3 px-3 text-right">{totalSessions.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">{totalUsers.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">{totalPageViews.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">{avgBounce}% avg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Leads */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            Recently Active Leads
            <span className="text-gray-400 font-normal ml-2 text-sm">Last 90 days</span>
          </h2>
          {partner.recentLeads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Business</th>
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Source</th>
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {[...partner.recentLeads].sort((a, b) => {
                    const priority = (s: string) => {
                      const k = (s || '').trim().toLowerCase();
                      if (k === 'closed won') return 0;
                      if (k === 'sql') return 1;
                      if (k === 'demo') return 2;
                      if (k === 'mql') return 3;
                      if (k === 'mal') return 5;
                      return 4;
                    };
                    const pa = priority(a.status), pb = priority(b.status);
                    if (pa !== pb) return pa - pb;
                    return (b.lastModified || '').localeCompare(a.lastModified || '');
                  }).slice(0, 30).map(lead => (
                    <tr key={lead.id} className="border-b border-gray-100">
                      <td className="py-3 px-3 text-gray-900">{lead.businessName}</td>
                      <td className="py-3 px-3">
                        <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">{lead.status}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{lead.source}</td>
                      <td className="py-3 px-3 text-gray-600">{lead.lastModified?.split('T')[0] || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No leads modified in the last 90 days</p>
          )}
        </div>

        {/* Inline Report Preview */}
        {reportHtml && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 text-lg">Generated Report Preview</h2>
              <button onClick={() => setReportHtml(null)} className="text-sm text-gray-500 hover:text-gray-700">Close preview</button>
            </div>
            <div className="bg-white rounded-xl border-2 border-orange-200 shadow-lg overflow-hidden">
              <iframe srcDoc={reportHtml} className="w-full border-0" style={{ minHeight: '900px' }} title="Report Preview" />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">Tech on Toast Partner Portal</p>
        </div>
      </main>
    </div>
  );
}
