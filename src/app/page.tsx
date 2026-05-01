'use client';

import { useEffect, useState } from 'react';
import AskBox from '@/components/AskBox';
import StacksDashboard from '@/components/StacksDashboard';
import ConversionTimeline from '@/components/ConversionTimeline';
import NpsDashboard from '@/components/NpsDashboard';

interface Partner {
  name: string;
  slug: string;
  leadCount: number;
  statusBreakdown: Record<string, number>;
}

interface LeadStages {
  MAL: string[];
  MQL: string[];
  SQL: string[];
  'Closed Won': string[];
  'Closed Lost': string[];
}

interface Lead {
  id?: string;
  businessName?: string;
  status: string;
  date: string;
  lastModified: string;
  source?: string;
  partners?: string[];
  stages?: LeadStages;
}


export default function Dashboard() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenPartners, setHiddenPartners] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('hiddenPartners');
    if (saved) setHiddenPartners(JSON.parse(saved));

    Promise.all([
      fetch('/api/partners').then(r => r.json()),
      fetch('/api/leads').then(r => r.json()),
    ])
      .then(([partnerData, leadsData]) => {
        setPartners(partnerData.partners || []);
        setAllLeads(leadsData.leads || []);
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

  const totalLeads = allLeads.length;

  // Stage counts from the new MAL/MQL/SQL/Closed Won/Closed Lost multi-select fields.
  // A lead is counted at a stage if any partner is attached to that stage on that lead.
  const countAtStage = (stage: keyof LeadStages) =>
    allLeads.filter(l => (l.stages?.[stage]?.length ?? 0) > 0).length;

  const malCount = countAtStage('MAL');
  const mqlCount = countAtStage('MQL');
  const sqlCount = countAtStage('SQL');
  const closedWonCount = countAtStage('Closed Won');
  const closedLostCount = countAtStage('Closed Lost');

  const allStatuses: Record<string, number> = {
    MAL: malCount,
    MQL: mqlCount,
    SQL: sqlCount,
    'Closed Won': closedWonCount,
    'Closed Lost': closedLostCount,
  };

  // For the pipeline breakdown bar — exclude Closed Lost from the visible mix.
  const sortedStatuses = (Object.entries(allStatuses) as [string, number][])
    .filter(([status, count]) => count > 0 && status !== 'Closed Lost')
    .sort(([, a], [, b]) => b - a);

  const STATUS_COLORS = ['bg-gray-300', 'bg-blue-500', 'bg-amber-400', 'bg-emerald-500', 'bg-purple-500', 'bg-red-400', 'bg-teal-500', 'bg-pink-400', 'bg-indigo-400', 'bg-orange-400'];

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

      {/* Hero KPIs - Pipeline stages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{malCount}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">MAL</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{mqlCount}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">MQL</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{sqlCount}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">SQL</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{closedWonCount}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Closed Won</p>
        </div>
      </div>

      <div className="mb-4">
        <ConversionTimeline
          leads={allLeads}
          malCount={malCount}
          mqlCount={mqlCount}
          sqlCount={sqlCount}
          closedWonCount={closedWonCount}
        />
      </div>

      {/* Pipeline breakdown bar — dynamic from Airtable */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Pipeline Breakdown</h2>
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

      {/* GA4 Marketplace Traffic */}
      <div className="bg-gradient-to-br from-white to-orange-50/40 rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-100 text-orange-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </span>
              <h2 className="text-base font-semibold text-gray-900">Marketplace Traffic</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Live GA4
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 ml-8">Partner page views on techontoast.community</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-inner">
          <iframe
            src="https://datastudio.google.com/embed/reporting/a2df8bed-3635-4a61-ab35-d4e370ce7b09/page/HqswF"
            className="w-full block"
            style={{ height: '520px', border: 0 }}
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            title="Marketplace Traffic"
          />
        </div>
      </div>

      {/* Recent Activity — MQL+ leads only, max 10 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Most recently updated leads at MQL stage or above</p>
          </div>
        </div>
        {(() => {
          const filtered = allLeads
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
            .slice(0, 10);

          if (filtered.length === 0) {
            return <p className="text-sm text-gray-400 italic">No recent MQL+ leads to show.</p>;
          }

          return (
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium">Business</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Partners</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Source</th>
                    <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium whitespace-nowrap">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => {
                    const statusColor = (() => {
                      const s = (lead.status || '').trim().toLowerCase();
                      if (s === 'closed won') return 'bg-purple-100 text-purple-700';
                      if (s === 'sql') return 'bg-emerald-100 text-emerald-700';
                      if (s === 'demo') return 'bg-blue-100 text-blue-700';
                      if (s === 'mql') return 'bg-amber-100 text-amber-700';
                      return 'bg-gray-100 text-gray-700';
                    })();
                    return (
                      <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-4 sm:px-5 text-gray-900 font-medium">{lead.businessName || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600 text-xs">
                          {lead.partners && lead.partners.length > 0
                            ? lead.partners.slice(0, 3).join(', ') + (lead.partners.length > 3 ? ` +${lead.partners.length - 3}` : '')
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{lead.source || '—'}</td>
                        <td className="py-2 px-4 sm:px-5 text-gray-500 text-xs whitespace-nowrap">
                          {lead.lastModified ? lead.lastModified.split('T')[0] : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Stacks Section */}
      <div className="mb-8">
        <StacksDashboard />
      </div>

      {/* NPS Section */}
      <div className="mb-8">
        <NpsDashboard />
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
