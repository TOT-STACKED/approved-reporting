'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PartnerNps, { type PartnerNpsData } from '@/components/PartnerNps';
import ConversionTimeline from '@/components/ConversionTimeline';
import StacksDashboard from '@/components/StacksDashboard';
import AskBox from '@/components/AskBox';
import LeadStatusGlossary from '@/components/LeadStatusGlossary';
import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  MAL: '#94a3b8',
  MQL: '#f59e0b',
  SQL: '#10b981',
  Demo: '#3b82f6',
  'Closed Won': '#a855f7',
  'Closed Lost': '#ef4444',
};
const PIE_FALLBACKS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

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
      <div className="min-h-screen bg-brand-cream-soft flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-brand-cream-soft flex items-center justify-center">
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
      <div className="min-h-screen bg-brand-cream-soft flex items-center justify-center">
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
    <div className="min-h-screen bg-brand-cream-soft">
      {/* Standalone header */}
      <nav className="bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-200/80 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/tech-on-toast-logo.svg"
              alt="Tech on Toast"
              className="h-9 w-auto text-brand-green"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold text-brand-green text-sm sm:text-base">{partner.name}</span>
              <span className="text-[10px] sm:text-xs text-gray-500 -mt-0.5">Partner Portal</span>
            </span>
          </div>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-brand-green-soft font-medium hidden sm:inline">
            Tech on Toast
          </span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-green">{partner.name} Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">{partner.leadCount} total leads referred by Tech on Toast</p>
          </div>
          <button
            onClick={() => setShowNarrative(true)}
            disabled={generating}
            className="bg-brand-green hover:bg-brand-green-soft text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {/* Narrative Input */}
        {showNarrative && (
          <div className="bg-white rounded-xl border-2 border-brand-orange/40 p-5 sm:p-6 mb-8 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-2">Add context for the report summary</h2>
            <p className="text-sm text-gray-500 mb-4">Notes about this month — we&apos;ll write a professional narrative for the report.</p>
            <textarea
              value={narrativeInput}
              onChange={e => setNarrativeInput(e.target.value)}
              rows={3}
              placeholder="e.g. Great month — featured in 3 Spread editions, strong uptick in inbound leads..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green mb-4"
            />
            <div className="flex gap-3">
              <button onClick={generateReport} disabled={generating}
                className="bg-brand-green hover:bg-brand-green-soft text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate Report'}
              </button>
              <button onClick={() => setShowNarrative(false)}
                className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* KPI Cards — MAL → MQL → SQL → Won (pipeline progression) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <div className="bg-brand-sky rounded-2xl p-4 sm:p-5 text-brand-green shadow-sm" title={LEAD_STATUS_EXPLAINER.MAL}>
            <p className="text-2xl sm:text-3xl font-bold">{partner.leadCount}</p>
            <p className="text-xs sm:text-sm font-medium opacity-75 mt-1">MAL</p>
            <p className="text-[10px] opacity-60 mt-0.5">Marketing Awareness Leads</p>
            <p className="text-[10px] sm:text-xs opacity-60 mt-2">{partner.recentLeads.length} active last 90d</p>
          </div>
          <div className="bg-brand-yellow rounded-2xl p-4 sm:p-5 text-brand-green shadow-sm" title={LEAD_STATUS_EXPLAINER.MQL}>
            <p className="text-2xl sm:text-3xl font-bold">{mqlCount}</p>
            <p className="text-xs sm:text-sm font-medium opacity-75 mt-1">MQL</p>
          </div>
          <div className="bg-brand-orange rounded-2xl p-4 sm:p-5 text-white shadow-sm" title={LEAD_STATUS_EXPLAINER.SQL}>
            <p className="text-2xl sm:text-3xl font-bold">{sqlCount}</p>
            <p className="text-xs sm:text-sm font-medium opacity-90 mt-1">SQL</p>
          </div>
          <div className="bg-brand-green rounded-2xl p-4 sm:p-5 text-white shadow-sm">
            <p className="text-2xl sm:text-3xl font-bold">{closedWon}</p>
            <p className="text-xs sm:text-sm font-medium opacity-90 mt-1">Closed Won</p>
          </div>
        </div>

        <LeadStatusGlossary className="mb-6 sm:mb-8" />

        {/* Partner-scoped AI query box */}
        <AskBox partnerSlug={partner.slug} partnerName={partner.name} />

        {/* Conversion Timeline */}
        <div className="mb-6 sm:mb-8">
          <ConversionTimeline
            leads={partner.leads}
            mqlCount={mqlCount}
            sqlCount={sqlCount}
            closedWonCount={closedWon}
          />
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Status Breakdown - Pie chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <h2 className="font-semibold text-gray-900 mb-2 text-sm">Lead Status</h2>
            {(() => {
              const statusData = Object.entries(partner.statusBreakdown)
                .filter(([s]) => s && s !== 'N/A')
                .map(([status, count]) => ({ status, count }))
                .sort((a, b) => b.count - a.count);
              if (statusData.length === 0) return <p className="text-sm text-gray-400 italic">No status data</p>;
              return (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      label={({ status, count }: any) => `${status}: ${count}`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {statusData.map((entry, i) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] || PIE_FALLBACKS[i % PIE_FALLBACKS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Source Breakdown - Horizontal bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <h2 className="font-semibold text-gray-900 mb-2 text-sm">Lead Sources</h2>
            {(() => {
              const sourceData = Object.entries(partner.sourceBreakdown)
                .map(([source, count]) => ({ source, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);
              if (sourceData.length === 0) return <p className="text-sm text-gray-400 italic">No source data</p>;
              return (
                <ResponsiveContainer width="100%" height={Math.max(200, sourceData.length * 28)}>
                  <BarChart data={sourceData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
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
              <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-brand-green">{stackCollect.mentions}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Times selected</p>
              </div>
              <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-brand-green">{stackCollect.marketShare}%</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Market share</p>
              </div>
              <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-brand-green">{stackCollect.totalReviews}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Total reviews</p>
              </div>
            </div>
            {stackCollect.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stackCollect.categories.map(c => (
                  <span key={c.category} className="text-xs bg-brand-sky text-brand-green px-2.5 py-1 rounded-full">
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

        {/* Marketplace Stacks (same general view as the main dashboard — recent reviews hidden) */}
        <div className="mb-6 sm:mb-8">
          <StacksDashboard hideRecentReviews />
        </div>

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
                    <th className="text-left py-3 px-3 text-gray-500 font-medium">Date Added</th>
                  </tr>
                </thead>
                <tbody>
                  {[...partner.recentLeads]
                    .filter(l => {
                      const s = (l.status || '').trim().toLowerCase();
                      return s === 'mql' || s === 'sql';
                    })
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 20)
                    .map(lead => (
                    <tr key={lead.id} className="border-b border-gray-100">
                      <td className="py-3 px-3 text-gray-900">{lead.businessName}</td>
                      <td className="py-3 px-3">
                        <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">{lead.status}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{lead.source}</td>
                      <td className="py-3 px-3 text-gray-600">{lead.date?.split('T')[0] || 'N/A'}</td>
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
            <div className="bg-white rounded-xl border-2 border-brand-orange/40 shadow-lg overflow-hidden">
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
