'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import ConversionTimeline from '@/components/ConversionTimeline';
import ConversionFunnelStrip from '@/components/ConversionFunnelStrip';
import PartnerNps, { type PartnerNpsData } from '@/components/PartnerNps';
import StacksDashboard from '@/components/StacksDashboard';
import StackCollectSection from '@/components/StackCollectSection';
import AskBox from '@/components/AskBox';
import LeadStatusGlossary from '@/components/LeadStatusGlossary';
import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';

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
  firstName?: string;
  lastName?: string;
  position?: string;
  contactEmail?: string;
  contactNumber?: string;
  totNotes?: string;
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

type SortCol = 'businessName' | 'source' | 'date';

function SortableTh({
  col, cur, onClick, children,
}: {
  col: SortCol;
  cur: { col: SortCol; dir: 'asc' | 'desc' };
  onClick: (col: SortCol) => void;
  children: React.ReactNode;
}) {
  const active = cur.col === col;
  const arrow = !active ? '↕' : cur.dir === 'asc' ? '↑' : '↓';
  return (
    <th
      onClick={() => onClick(col)}
      className={`text-left py-3 px-3 font-medium cursor-pointer select-none transition-colors ${active ? 'text-brand-green' : 'text-gray-500 hover:text-gray-700'}`}
    >
      {children} <span className="text-[10px] opacity-60">{arrow}</span>
    </th>
  );
}

export default function PartnerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsEntry[]>([]);
  // any — the shape lives inside StackCollectSection; page just passes it through.
  const [stackCollect, setStackCollect] = useState<any>(null);
  const [nps, setNps] = useState<PartnerNpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Cold-start safety: if the first fetch returns no partner, wait 1.5s
    // and try once more. Airtable pagination sometimes returns partial data
    // on a cold serverless invocation; a retry lands on a warm cache.
    const load = async (attempt: number) => {
      try {
        const r = await fetch(`/api/partners/${slug}`, { cache: 'no-store' });
        const data = await r.json();
        if (cancelled) return;
        if (data.partner) {
          setPartner(data.partner);
          setMetrics(data.metrics || []);
          setStackCollect(data.stackCollect || null);
          setNps(data.nps || null);
          setLoading(false);
          return;
        }
        if (attempt === 1) { setTimeout(() => load(2), 1500); return; }
        setLoading(false);
      } catch {
        if (attempt === 1) { setTimeout(() => load(2), 1500); return; }
        if (!cancelled) setLoading(false);
      }
    };
    load(1);
    return () => { cancelled = true; };
  }, [slug]);

  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [narrativeInput, setNarrativeInput] = useState('');

  // Which stage the Lead Progress table is scoped to. MQL is the default.
  type StageFilter = 'MQL' | 'SQL' | 'Closed Won';
  const [stageFilter, setStageFilter] = useState<StageFilter>('MQL');
  // Lead Progress search + sort + "stale only" toggle
  const [leadSearch, setLeadSearch] = useState('');
  const [leadSort, setLeadSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });
  const [staleOnly, setStaleOnly] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const STALE_DAYS = 30;

  // Feedback modal — mirrors /p/[token], but posts to the internal
  // /api/partners/[slug]/feedback endpoint (behind the dashboard auth
  // proxy). Same shape, same Slack ping, same Supabase table — just the
  // source token is tagged 'internal' server-side.
  const FEEDBACK_OPTIONS = ['MQL', 'SQL', 'Demo booked', 'Closed Won', 'Closed Lost', 'On hold / nurture', 'Other'] as const;
  type FeedbackOption = typeof FEEDBACK_OPTIONS[number];
  const [feedbackFor, setFeedbackFor] = useState<{ id: string; businessName: string } | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackOption>('SQL');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  function openFeedback(lead: { id: string; businessName: string }) {
    setFeedbackFor(lead);
    setFeedbackStatus('SQL');
    setFeedbackComment('');
    setFeedbackSent(false);
    setFeedbackError('');
  }
  function closeFeedback() { setFeedbackFor(null); }
  async function submitFeedback() {
    if (!feedbackFor) return;
    setFeedbackSubmitting(true);
    setFeedbackError('');
    try {
      const r = await fetch(`/api/partners/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leadId: feedbackFor.id,
          leadBusinessName: feedbackFor.businessName,
          reportedStatus: feedbackStatus,
          comment: feedbackComment.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Submit failed');
      setFeedbackSent(true);
      setTimeout(() => setFeedbackFor(null), 1800);
    } catch (e: unknown) {
      setFeedbackError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setFeedbackSubmitting(false);
    }
  }
  function toggleSort(col: SortCol) {
    setLeadSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'date' ? 'desc' : 'asc' });
  }

  // Partner-submitted lead feedback (from the /p/<token> "Update status" button)
  interface LeadFeedback {
    id: string;
    created_at: string;
    lead_business_name: string | null;
    reported_status: string;
    comment: string | null;
  }
  const [feedback, setFeedback] = useState<LeadFeedback[]>([]);
  useEffect(() => {
    fetch(`/api/partners/${slug}/feedback`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setFeedback(d.feedback || []))
      .catch(() => setFeedback([]));
  }, [slug]);

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
  const malCount = partner.statusBreakdown['MAL'] || 0;
  const mqlCount = partner.statusBreakdown['MQL'] || 0;
  const sqlCount = partner.statusBreakdown['SQL'] || 0;
  // statusBreakdown only — the same lead also appears in stageBreakdown,
  // so summing both double-counted every Closed Won. Trailing-space variant
  // kept defensively for Airtable values like 'Closed Won '.
  const closedWon = (partner.statusBreakdown['Closed Won'] || 0) +
    (partner.statusBreakdown['Closed Won '] || 0);

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
          className="bg-brand-green hover:bg-brand-green-soft text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Narrative Input */}
      {showNarrative && (
        <div className="bg-white rounded-xl border-2 border-brand-orange/40 p-6 mb-8 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Add context for the report summary</h2>
          <p className="text-sm text-gray-500 mb-4">Give some notes about what happened this month and AI will write a professional narrative summary for the report. Leave blank to skip.</p>
          <textarea
            value={narrativeInput}
            onChange={e => setNarrativeInput(e.target.value)}
            rows={4}
            placeholder={"e.g. Great month for SKY - featured in 3 Spread editions, podcast interview with their CEO went live, strong uptick in inbound leads from the hospitality sector. Launched new partner page which drove solid traffic..."}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={generateReport}
              disabled={generating}
              className="bg-brand-green hover:bg-brand-green-soft text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
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

      {/* KPI Cards — MAL → MQL → SQL → Won. MQL / SQL / Won are click-to-filter
          the Lead Progress table below; active card gets a brand-green ring. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <button
          type="button"
          onClick={() => setStageFilter('MQL')}
          aria-pressed={stageFilter === 'MQL'}
          title={`${LEAD_STATUS_EXPLAINER.MQL} — click to see MQL leads below`}
          className={`bg-brand-yellow rounded-2xl p-5 text-brand-green shadow-sm text-left transition-all hover:shadow-md ${stageFilter === 'MQL' ? 'ring-4 ring-brand-green/40' : ''}`}
        >
          <p className="text-3xl font-bold">{mqlCount}</p>
          <p className="text-sm font-medium opacity-75 mt-1">MQL</p>
          <p className="text-[10px] opacity-60 mt-0.5">{stageFilter === 'MQL' ? 'Showing below' : 'Click to show'}</p>
        </button>
        <button
          type="button"
          onClick={() => setStageFilter('SQL')}
          aria-pressed={stageFilter === 'SQL'}
          title={`${LEAD_STATUS_EXPLAINER.SQL} — click to see SQL leads below`}
          className={`bg-brand-orange rounded-2xl p-5 text-white shadow-sm text-left transition-all hover:shadow-md ${stageFilter === 'SQL' ? 'ring-4 ring-brand-green/40' : ''}`}
        >
          <p className="text-3xl font-bold">{sqlCount}</p>
          <p className="text-sm font-medium opacity-90 mt-1">SQL</p>
          <p className="text-[10px] opacity-75 mt-0.5">{stageFilter === 'SQL' ? 'Showing below' : 'Click to show'}</p>
        </button>
        <button
          type="button"
          onClick={() => setStageFilter('Closed Won')}
          aria-pressed={stageFilter === 'Closed Won'}
          title="Click to see Closed Won leads below"
          className={`bg-brand-green rounded-2xl p-5 text-white shadow-sm text-left transition-all hover:shadow-md ${stageFilter === 'Closed Won' ? 'ring-4 ring-brand-lime/60' : ''}`}
        >
          <p className="text-3xl font-bold">{closedWon}</p>
          <p className="text-sm font-medium opacity-90 mt-1">Closed Won</p>
          <p className="text-[10px] opacity-75 mt-0.5">{stageFilter === 'Closed Won' ? 'Showing below' : 'Click to show'}</p>
        </button>
        <div className="bg-brand-sky rounded-2xl p-5 text-brand-green shadow-sm" title={LEAD_STATUS_EXPLAINER.MAL}>
          <p className="text-3xl font-bold">{malCount}</p>
          <p className="text-sm font-medium opacity-75 mt-1">MAL</p>
          <p className="text-[10px] opacity-60 mt-0.5">Marketing Awareness Leads</p>
          <p className="text-xs opacity-60 mt-2">{partner.leadCount} total referred · {partner.recentLeads.length} active last 90d</p>
        </div>
      </div>

      {/* Pipeline conversion rates — under the KPI cards, above the table. */}
      <ConversionFunnelStrip leadCount={partner.leadCount} statusBreakdown={partner.statusBreakdown} />

      {/* Watch-Out: MQL leads need action to qualify. Click filters the table
          to MQL so the user lands on the leads they need to chase. */}
      {mqlCount > 0 && (() => {
        const now = Date.now();
        const staleMql = partner.leads.filter(l => {
          if ((l.status || '').trim() !== 'MQL' || !l.lastModified) return false;
          return (now - new Date(l.lastModified).getTime()) / 86_400_000 > STALE_DAYS;
        }).length;
        return (
          <button
            type="button"
            onClick={() => setStageFilter('MQL')}
            className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3 text-left hover:bg-amber-100 transition-colors"
          >
            <span className="text-2xl leading-none mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-900">
                Watch out — {mqlCount} lead{mqlCount === 1 ? '' : 's'} at MQL involving your product
              </p>
              <p className="text-sm text-amber-800/80 mt-0.5">
                {staleMql > 0
                  ? `${staleMql} ${staleMql === 1 ? 'has' : 'have'} had no activity for 30+ days — chase to qualify or drop`
                  : 'These are warm but unqualified — chase them to move to SQL'}
              </p>
            </div>
            <span className="text-xs text-amber-700 font-medium mt-1 whitespace-nowrap">View MQL →</span>
          </button>
        );
      })()}

      {/* Lead Progress — interactive table scoped to whichever stage was
          clicked above. Sits directly under the KPI cards. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        {(() => {
          const stageRows = partner.leads.filter(
            l => (l.status || '').trim().toLowerCase() === stageFilter.toLowerCase()
          );
          const now = Date.now();
          const isStale = (l: { lastModified?: string }) => {
            if (stageFilter === 'Closed Won') return false;
            if (!l.lastModified) return false;
            const days = (now - new Date(l.lastModified).getTime()) / 86_400_000;
            return days > STALE_DAYS;
          };
          const staleCount = stageRows.filter(isStale).length;

          const q = leadSearch.trim().toLowerCase();
          const filtered = stageRows.filter(l => {
            if (staleOnly && !isStale(l)) return false;
            if (q && !(l.businessName || '').toLowerCase().includes(q) && !(l.source || '').toLowerCase().includes(q)) return false;
            return true;
          });

          const sorted = [...filtered].sort((a, b) => {
            const dir = leadSort.dir === 'asc' ? 1 : -1;
            if (leadSort.col === 'businessName') return (a.businessName || '').localeCompare(b.businessName || '') * dir;
            if (leadSort.col === 'source')       return (a.source || '').localeCompare(b.source || '') * dir;
            return (a.date || '').localeCompare(b.date || '') * dir;
          });

          return (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Lead Progress
                    <span className="text-gray-400 font-normal ml-2 text-sm">All {stageFilter} leads</span>
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Showing {sorted.length} of {stageRows.length} {stageFilter} lead{stageRows.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={e => setLeadSearch(e.target.value)}
                    placeholder="Search venue or source…"
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-xs sm:w-56 focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                  />
                  {staleCount > 0 && (
                    <button
                      onClick={() => setStaleOnly(s => !s)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${staleOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                      title={`${staleCount} ${stageFilter} lead${staleCount === 1 ? '' : 's'} with no activity in 30+ days`}
                    >
                      ⚠ {staleCount} stale {staleOnly ? '· clear' : ''}
                    </button>
                  )}
                </div>
              </div>

              {sorted.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  {stageRows.length === 0
                    ? `No ${stageFilter} leads yet.`
                    : 'No leads match this filter.'}
                </p>
              ) : (
                <div className="overflow-auto max-h-[600px] border border-gray-100 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 sticky top-0">
                      <tr className="border-b border-gray-200">
                        <SortableTh col="businessName" cur={leadSort} onClick={toggleSort}>Business</SortableTh>
                        <th className="text-left py-3 px-3 text-gray-500 font-medium">Status</th>
                        <SortableTh col="source" cur={leadSort} onClick={toggleSort}>Source</SortableTh>
                        <SortableTh col="date" cur={leadSort} onClick={toggleSort}>Date Added</SortableTh>
                        <th className="text-right py-3 px-3 text-gray-500 font-medium">Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((lead) => {
                        const stale = isStale(lead);
                        const isExpanded = expandedLeadId === lead.id;
                        // Same MQL gating as /p/[token] — even the internal
                        // view hides contact for MQL. Keeps a screen-share
                        // safe (no accidental leak if a partner sees the
                        // screen) and keeps both pages behaviourally identical
                        // so there's only one thing to reason about.
                        const stageKey = (lead.status || '').trim();
                        const isMql = stageKey === 'MQL';
                        const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
                        return (
                          <Fragment key={lead.id}>
                            <tr
                              onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
                              className={`border-b border-gray-100 cursor-pointer hover:bg-brand-cream/40 ${stale ? 'bg-amber-50/40' : ''} ${isExpanded ? 'bg-brand-cream/60' : ''}`}
                            >
                              <td className="py-3 px-3 text-gray-900">
                                <span className="inline-block mr-1.5 text-gray-400 text-[10px]">{isExpanded ? '▾' : '▸'}</span>
                                {lead.businessName}
                                {stale && <span className="ml-2 text-[10px] text-amber-700">⚠ stale</span>}
                              </td>
                              <td className="py-3 px-3">
                                <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                                  {lead.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-gray-600">{lead.source}</td>
                              <td className="py-3 px-3 text-gray-600">{lead.date?.split('T')[0] || 'N/A'}</td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={e => { e.stopPropagation(); openFeedback({ id: lead.id, businessName: lead.businessName }); }}
                                  className="text-xs text-brand-green hover:text-brand-green-soft underline"
                                  title="Log a status update against this lead"
                                >
                                  Update status
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-brand-cream/40 border-b border-gray-100">
                                <td colSpan={5} className="py-3 px-4 sm:px-5">
                                  {isMql ? (
                                    // MQL — role + source only, no contact route.
                                    <div className="text-xs sm:text-sm text-gray-700 space-y-2">
                                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                                        <p>
                                          <span className="text-gray-500">Position: </span>
                                          <span className="font-medium text-gray-900">{lead.position || '—'}</span>
                                        </p>
                                        <p>
                                          <span className="text-gray-500">Source: </span>
                                          <span className="font-medium text-gray-900">{lead.source || '—'}</span>
                                        </p>
                                      </div>
                                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                        MQL leads — contact details hidden until the lead progresses to SQL. Tech on Toast handles all MQL outreach.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Contact</p>
                                        <p className="font-medium text-gray-900">{fullName || '—'}</p>
                                        {lead.position && <p className="text-gray-600 mt-0.5">{lead.position}</p>}
                                        <div className="mt-1.5 space-y-0.5">
                                          {lead.contactEmail && (
                                            <p>
                                              <a href={`mailto:${lead.contactEmail}`} className="text-brand-green hover:text-brand-green-soft underline">
                                                {lead.contactEmail}
                                              </a>
                                            </p>
                                          )}
                                          {lead.contactNumber && (
                                            <p>
                                              <a href={`tel:${lead.contactNumber.replace(/\s+/g, '')}`} className="text-brand-green hover:text-brand-green-soft underline">
                                                {lead.contactNumber}
                                              </a>
                                            </p>
                                          )}
                                          {!lead.contactEmail && !lead.contactNumber && (
                                            <p className="text-gray-400 italic text-xs">No email or phone on file — check Airtable.</p>
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">TOT notes</p>
                                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                                          {lead.totNotes || <span className="text-gray-400 italic">No notes yet.</span>}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Feedback modal — mirrors /p/[token]. Posts to the internal
          /api/partners/[slug]/feedback POST endpoint (added alongside GET).
          Same Slack ping and Supabase row shape; source token = 'internal'
          so we can distinguish team-submitted updates from partner ones. */}
      {feedbackFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-brand-green/30" onClick={closeFeedback} />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-lg w-full max-w-md p-6">
            {feedbackSent ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-lime/40 text-brand-green mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-brand-green">Logged. Slack notified.</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-brand-green">Update lead status</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Log where <span className="font-medium text-gray-800">{feedbackFor.businessName}</span> actually is.
                  </p>
                </div>

                <label className="block mb-3">
                  <span className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wide">Real status</span>
                  <select
                    value={feedbackStatus}
                    onChange={e => setFeedbackStatus(e.target.value as FeedbackOption)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                  >
                    {FEEDBACK_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                <label className="block mb-4">
                  <span className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wide">Notes (optional)</span>
                  <textarea
                    value={feedbackComment}
                    onChange={e => setFeedbackComment(e.target.value)}
                    rows={3}
                    placeholder="e.g. demo booked 24 May · contract sent · budget pushed to Q4"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green resize-none"
                  />
                </label>

                {feedbackError && (
                  <div className="mb-3 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
                    {feedbackError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={closeFeedback}
                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                    disabled={feedbackSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitFeedback}
                    disabled={feedbackSubmitting}
                    className="bg-brand-green hover:bg-brand-green-soft disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    {feedbackSubmitting ? 'Sending…' : 'Log update'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <LeadStatusGlossary className="mb-8" />

      {/* Partner-scoped AI query box */}
      <AskBox partnerSlug={partner.slug} partnerName={partner.name} />

      {/* Conversion Timeline */}
      <div className="mb-8">
        <ConversionTimeline
          leads={partner.leads}
          mqlCount={mqlCount}
          sqlCount={sqlCount}
          closedWonCount={closedWon}
        />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8">
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
                  <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      </div>

      {/* StackCollect / Tech Stack Reviews */}
      {stackCollect && partner && (
        <StackCollectSection partnerName={partner.name} data={stackCollect} />
      )}

      {/* Partner NPS */}
      {nps && partner && (
        <PartnerNps data={nps} partnerName={partner.name} />
      )}

      {/* Marketplace Stacks (general, same data shown on main dashboard — recent reviews hidden) */}
      <div className="mb-8">
        <StacksDashboard hideRecentReviews />
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

      {/* Partner-submitted feedback (from the /p/<token> "Update status" button) */}
      {feedback.length > 0 && (
        <div className="bg-white rounded-xl border border-brand-green/20 p-6 mb-6">
          <h2 className="font-semibold text-brand-green mb-1">Recent partner feedback</h2>
          <p className="text-xs text-gray-500 mb-4">
            Status updates submitted by {partner.name} via their private dashboard.
          </p>
          <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {feedback.slice(0, 30).map(f => (
              <li key={f.id} className="text-sm border-b border-gray-100 last:border-b-0 pb-3 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900">{f.lead_business_name || '(no business name)'}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="inline-block bg-brand-cream text-brand-green text-xs px-2 py-0.5 rounded-full font-medium">
                    {f.reported_status}
                  </span>
                </div>
                {f.comment && (
                  <p className="text-xs text-gray-600 mt-1.5 italic">&ldquo;{f.comment}&rdquo;</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          <div className="bg-white rounded-xl border-2 border-brand-orange/40 shadow-lg overflow-hidden">
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
