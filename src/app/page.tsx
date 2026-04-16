'use client';

import { useEffect, useState } from 'react';
import AskBox from '@/components/AskBox';

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

  useEffect(() => {
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

  const totalLeads = partners.reduce((s, p) => s + p.leadCount, 0);

  // Funnel metrics from status breakdowns across all partners
  const allStatuses: Record<string, number> = {};
  partners.forEach(p => {
    Object.entries(p.statusBreakdown).forEach(([status, count]) => {
      allStatuses[status] = (allStatuses[status] || 0) + count;
    });
  });

  const activeConversations = (allStatuses['In Conversation'] || 0) + (allStatuses['Opportunity'] || 0) + (allStatuses['SQL'] || 0);
  const closedWon = (allStatuses['Live Closed'] || 0) + (allStatuses['Live Closed '] || 0);
  const closedLost = (allStatuses['Lost'] || 0) + (allStatuses['Lost '] || 0);
  const nurturing = allStatuses['nurture'] || 0;

  // Marketing reach
  const totalReach = activities.reduce((s, a) => s + a.impressions, 0);
  const totalEngagements = activities.reduce((s, a) => s + a.engagements, 0);
  const totalPipeline = activities.reduce((s, a) => s + a.pipelineValue, 0);

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
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{activeConversations}</p>
          <p className="text-sm opacity-80 mt-1">Active Conversations</p>
          <p className="text-xs opacity-60 mt-2">In Conversation + SQL + Opps</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-5 text-white">
          <p className="text-3xl font-bold">{closedWon}</p>
          <p className="text-sm opacity-80 mt-1">Closed Won</p>
          <p className="text-xs opacity-60 mt-2">{closedLost} lost | {nurturing} nurturing</p>
        </div>
      </div>

      {/* Pipeline breakdown bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Pipeline Breakdown</h2>
          {totalPipeline > 0 && (
            <span className="text-sm font-semibold text-green-600">£{totalPipeline.toLocaleString()} pipeline value</span>
          )}
        </div>
        <div className="flex rounded-full overflow-hidden h-4 bg-gray-100">
          {totalLeads > 0 && (
            <>
              {(allStatuses['MAL'] || 0) > 0 && (
                <div className="bg-gray-300 h-full" style={{ width: `${((allStatuses['MAL'] || 0) / totalLeads) * 100}%` }}
                  title={`MAL: ${allStatuses['MAL']}`} />
              )}
              {nurturing > 0 && (
                <div className="bg-amber-400 h-full" style={{ width: `${(nurturing / totalLeads) * 100}%` }}
                  title={`Nurture: ${nurturing}`} />
              )}
              {activeConversations > 0 && (
                <div className="bg-blue-500 h-full" style={{ width: `${(activeConversations / totalLeads) * 100}%` }}
                  title={`Active: ${activeConversations}`} />
              )}
              {closedWon > 0 && (
                <div className="bg-emerald-500 h-full" style={{ width: `${(closedWon / totalLeads) * 100}%` }}
                  title={`Won: ${closedWon}`} />
              )}
              {closedLost > 0 && (
                <div className="bg-red-400 h-full" style={{ width: `${(closedLost / totalLeads) * 100}%` }}
                  title={`Lost: ${closedLost}`} />
              )}
            </>
          )}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block"></span> MAL ({allStatuses['MAL'] || 0})</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> Nurture ({nurturing})</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Active ({activeConversations})</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Won ({closedWon})</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span> Lost ({closedLost})</span>
        </div>
      </div>

      {/* Partner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {partners.map(partner => {
          const active = (partner.statusBreakdown['In Conversation'] || 0) +
            (partner.statusBreakdown['Opportunity'] || 0) +
            (partner.statusBreakdown['SQL'] || 0);
          const won = (partner.statusBreakdown['Live Closed'] || 0) +
            (partner.statusBreakdown['Live Closed '] || 0);

          return (
            <a
              key={partner.slug}
              href={`/partners/${partner.slug}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-orange-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                  {partner.name}
                </h3>
                <span className="text-xs text-gray-400 group-hover:text-orange-400">View &rarr;</span>
              </div>
              <div className="flex items-center gap-5">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{partner.leadCount}</p>
                  <p className="text-xs text-gray-500">leads</p>
                </div>
                {active > 0 && (
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{active}</p>
                    <p className="text-xs text-gray-500">active</p>
                  </div>
                )}
                {won > 0 && (
                  <div>
                    <p className="text-lg font-bold text-purple-600">{won}</p>
                    <p className="text-xs text-gray-500">won</p>
                  </div>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
