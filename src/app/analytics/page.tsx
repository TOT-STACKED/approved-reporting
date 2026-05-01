'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = {
  orange: '#e67e22',
  blue: '#2980b9',
  emerald: '#27ae60',
  purple: '#8e44ad',
  red: '#c0392b',
  teal: '#16a085',
  navy: '#2c3e50',
  amber: '#f39c12',
};

const PIE_COLORS = [
  COLORS.blue, COLORS.orange, COLORS.emerald, COLORS.purple,
  COLORS.red, COLORS.teal, COLORS.navy, COLORS.amber,
  '#3498db', '#e74c3c', '#1abc9c', '#9b59b6',
];

interface AnalyticsData {
  leadStatusData: { status: string; count: number }[];
  leadsByPartner: { name: string; leads: number }[];
  trafficOverTime: { week: string; sessions: number; users: number; pageViews: number }[];
  marketingOverTime: { month: string; impressions: number; engagements: number; count: number }[];
  topTools: { name: string; count: number }[];
  categoryData: { category: string; count: number }[];
  summary: {
    totalLeads: number;
    totalPartners: number;
    totalReviews: number;
    totalToolEntries: number;
    malCount: number;
    mqlCount: number;
    sqlCount: number;
    closedWon: number;
    closedLost: number;
  };
}

function ChartCard({ title, subtitle, children, scrollable }: { title: string; subtitle?: string; children: React.ReactNode; scrollable?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mb-3 sm:mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3 sm:mb-4" />}
      {scrollable ? (
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="min-w-[500px]">
            {children}
          </div>
        </div>
      ) : children}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-lg">Loading analytics...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        <p className="font-semibold">Error loading analytics</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1 text-sm">Visual breakdown of traffic, pipeline, and tech stack data</p>
      </div>

      {/* Summary KPIs — match the main dashboard */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6 sm:mb-8">
        {[
          { label: 'MAL', value: data.summary.totalLeads.toLocaleString(), color: 'from-blue-600 to-blue-700' },
          { label: 'MQL', value: data.summary.mqlCount.toLocaleString(), color: 'from-amber-500 to-amber-600' },
          { label: 'SQL', value: data.summary.sqlCount.toLocaleString(), color: 'from-emerald-500 to-emerald-600' },
          { label: 'Closed Won', value: data.summary.closedWon.toLocaleString(), color: 'from-purple-600 to-purple-700' },
          { label: 'Stack Reviews', value: data.summary.totalReviews.toLocaleString(), color: 'from-teal-500 to-teal-600' },
          { label: 'Tool Entries', value: data.summary.totalToolEntries.toLocaleString(), color: 'from-red-500 to-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-gradient-to-br ${kpi.color} rounded-xl p-3 sm:p-4 text-white text-center`}>
            <p className="text-lg sm:text-2xl font-bold">{kpi.value}</p>
            <p className="text-[10px] sm:text-xs opacity-80 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Traffic Trends */}
        {data.trafficOverTime.length > 0 && (
          <ChartCard title="Traffic Trends" subtitle="Weekly sessions, users & page views across all partners" scrollable>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.trafficOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sessions" stroke={COLORS.blue} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="users" stroke={COLORS.orange} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pageViews" stroke={COLORS.emerald} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Lead Pipeline */}
        <ChartCard title="Lead Pipeline" subtitle="Status breakdown across all partners">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.leadStatusData}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={90}
                paddingAngle={2}
              >
                {data.leadStatusData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Leads by Partner */}
        <ChartCard title="Leads by Partner" subtitle="Total lead count per partner">
          <div className="overflow-y-auto max-h-[500px] -mx-4 sm:-mx-6 px-4 sm:px-6">
            <ResponsiveContainer width="100%" height={Math.max(300, data.leadsByPartner.length * 32)}>
              <BarChart data={data.leadsByPartner} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="leads" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Marketing Reach */}
        {data.marketingOverTime.length > 0 && (
          <ChartCard title="Marketing Reach" subtitle="Monthly impressions & engagements" scrollable>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.marketingOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="impressions" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
                <Bar dataKey="engagements" fill={COLORS.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Top Tools */}
        {data.topTools.length > 0 && (
          <ChartCard title="Top Tools (StackCollect)" subtitle="Most selected tools across all tech stack reviews">
            <div className="overflow-y-auto max-h-[500px] -mx-4 sm:-mx-6 px-4 sm:px-6">
              <ResponsiveContainer width="100%" height={Math.max(300, data.topTools.length * 30)}>
                <BarChart data={data.topTools} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.teal} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Tech Stack Categories */}
        {data.categoryData.length > 0 && (
          <ChartCard title="Tech Stack Categories" subtitle="Tool selections grouped by category">
            <div className="overflow-y-auto max-h-[500px] -mx-4 sm:-mx-6 px-4 sm:px-6">
              <ResponsiveContainer width="100%" height={Math.max(300, data.categoryData.length * 30)}>
                <BarChart data={data.categoryData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 10 }} width={130} />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
