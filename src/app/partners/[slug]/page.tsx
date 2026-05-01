'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ConversionTimeline from '@/components/ConversionTimeline';
import PartnerNps, { type PartnerNpsData } from '@/components/PartnerNps';
import StacksDashboard from '@/components/StacksDashboard';

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

export default function PartnerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsEntry[]>([]);
  const [stackCollect, setStackCollect] = useState<{
    mentions: number;
    categories: { category: string; count: number }[];
    totalReviews: number;
    marketShare: string;
  } | null>(null);
  const [nps, setNps] = useState<PartnerNpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/partners/${slug}`)
      .then(r => r.json())
      .then(data => {
        setPartner(data.partner);
        setMetrics(data.metrics || []);
        setStackCollect(data.stackCollect || null);
        setNps(data.nps || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [narrativeInput, setNarrativeInput] = useState('');

  const generateReport = async () => {
    if (!partner) return;
    setGenerating(true);
    setShowNarrative(false);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerName: partner.name, slug, narrativeContext: narrativeInput }),
      });
      const html = await res.text();

      // Show inline
      setReportHtml(html);

      // Also download as file
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${partner.name.replace(/[^a-zA-Z0-9]/g, '_')}_Value_Report.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Failed to generate report');
    }
    setGenerating(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500">Loading partner data...</div>;
  }

  if (!partner) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">Partner not found</div>;
  }

  const totalSessions = metrics.reduce((s, m) => s + m.sessions, 0);
  const totalUsers = metrics.reduce((s, m) => s + m.users, 0);
  const totalPageViews = metrics.reduce((s, m) => s + m.pageViews, 0);
  const avgBounce = metrics.length > 0
    ? (metrics.reduce((s, m) => s + m.bounceRate, 0) / metrics.length * 100).toFixed(1)
    : 'N/A';

  // Pipeline KPIs aligned with main dashboard
  const mqlCount = partner.statusBreakdown['MQL'] || 0;
  const sqlCount = partner.statusBreakdown['SQL'] || 0;
  const closedWon = (partner.statusBreakdown['Closed Won'] || 0) +
    (partner.statusBreakdown['Closed Won '] || 0) +
    (partner.stageBreakdown['Closed Won'] || 0) +
    (partner.stageBreakdown['Closed Won '] || 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Dashboard</a>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{partner.name}</h1>
          <p className="text-gray-500">{partner.leadCount} total leads referred</p>
        </div>
        <button
          onClick={() => setShowNarrative(true)}
          disabled={generating}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Narrative Input */}
      {showNarrative && (
        <div className="bg-white rounded-xl border-2 border-orange-200 p-6 mb-8 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Add context for the report summary</h2>
          <p className="text-sm text-gray-500 mb-4">Give some notes about what happened this month and AI will write a professional narrative summary for the report. Leave blank to skip.</p>
          <textarea
            value={narrativeInput}
            onChange={e => setNarrativeInput(e.target.value)}
            rows={4}
            placeholder={"e.g. Great month for SKY - featured in 3 Spread editions, podcast interview with their CEO went live, strong uptick in inbound leads from the hospitality sector. Launched new partner page which drove solid traffic..."}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={generateReport}
              disabled={generating}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
            <button
              onClick={() => setShowNarrative(false)}
              className="text-gray-500 hover:text-gray-700 px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards — MQL, SQL, Closed Won + Traffic */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{mqlCount}</p>
          <p className="text-sm opacity-80 mt-1">MQL</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{sqlCount}</p>
          <p className="text-sm opacity-80 mt-1">SQL</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{closedWon}</p>
          <p className="text-sm opacity-80 mt-1">Closed Won</p>
        </div>
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{partner.leadCount}</p>
          <p className="text-sm opacity-80 mt-1">Total Leads</p>
          <p className="text-xs opacity-60 mt-2">{partner.recentLeads.length} active last 90d</p>
        </div>
      </div>

      {/* Conversion Timeline */}
      <div className="mb-8">
        <ConversionTimeline
          leads={partner.leads}
          mqlCount={mqlCount}
          sqlCount={sqlCount}
          closedWonCount={closedWon}
        />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Lead Status</h2>
          <div className="space-y-2">
            {Object.entries(partner.statusBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{status}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 rounded-full h-2"
                        style={{ width: `${(count / partner.leadCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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

      {/* StackCollect / Tech Stack Reviews */}
      {stackCollect && stackCollect.mentions > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">
            StackCollect - Tech Stack Reviews
            <span className="text-gray-400 font-normal ml-2 text-sm">from techontoast.community</span>
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{stackCollect.mentions}</p>
              <p className="text-xs text-gray-500 mt-1">Times selected by operators</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{stackCollect.marketShare}%</p>
              <p className="text-xs text-gray-500 mt-1">Market share (of reviews)</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{stackCollect.totalReviews}</p>
              <p className="text-xs text-gray-500 mt-1">Total tech stack reviews</p>
            </div>
          </div>
          {stackCollect.categories.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Selected in categories:</p>
              <div className="flex flex-wrap gap-2">
                {stackCollect.categories.map(c => (
                  <span key={c.category} className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    {c.category} ({c.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Partner NPS */}
      {nps && partner && (
        <PartnerNps data={nps} partnerName={partner.name} />
      )}

      {/* Marketplace Stacks (general, same data shown on main dashboard) */}
      <div className="mb-8">
        <StacksDashboard />
      </div>

      {/* Metrics Table */}
      {metrics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Site Traffic - Weekly</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-gray-500 font-medium">Week</th>
                  <th className="text-right py-3 px-3 text-gray-500 font-medium">Sessions</th>
                  <th className="text-right py-3 px-3 text-gray-500 font-medium">Users</th>
                  <th className="text-right py-3 px-3 text-gray-500 font-medium">Page Views</th>
                  <th className="text-right py-3 px-3 text-gray-500 font-medium">Bounce Rate</th>
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
                {[...partner.recentLeads]
                  .filter(l => {
                    const s = (l.status || '').trim().toLowerCase();
                    return s === 'mql' || s === 'sql' || s === 'demo' || s === 'closed won';
                  })
                  .sort((a, b) => {
                    const priority = (s: string) => {
                      const k = (s || '').trim().toLowerCase();
                      if (k === 'closed won') return 0;
                      if (k === 'sql') return 1;
                      if (k === 'demo') return 2;
                      if (k === 'mql') return 3;
                      return 4;
                    };
                    const pa = priority(a.status), pb = priority(b.status);
                    if (pa !== pb) return pa - pb;
                    return (b.lastModified || '').localeCompare(a.lastModified || '');
                  })
                  .slice(0, 10)
                  .map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-100">
                    <td className="py-3 px-3 text-gray-900">{lead.businessName}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600">{lead.source}</td>
                    <td className="py-3 px-3 text-gray-600">{lead.lastModified?.split('T')[0] || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No leads modified in the last 30 days</p>
        )}
      </div>

      {/* Inline Report Preview */}
      {reportHtml && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-lg">Generated Report Preview</h2>
            <button onClick={() => setReportHtml(null)}
              className="text-sm text-gray-500 hover:text-gray-700">
              Close preview
            </button>
          </div>
          <div className="bg-white rounded-xl border-2 border-orange-200 shadow-lg overflow-hidden">
            <iframe
              srcDoc={reportHtml}
              className="w-full border-0"
              style={{ minHeight: '900px' }}
              title="Report Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
