'use client';

import { useEffect, useMemo, useState } from 'react';
import { scoreLead, PRIORITY_LABEL, PRIORITY_CLASS, type LeadPriority } from '@/lib/scoring';
import { toCsv, downloadCsv } from '@/lib/csv';
import LeadStatusGlossary from '@/components/LeadStatusGlossary';
import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';

interface Lead {
  id: string;
  businessName: string;
  partners: string[];
  status: string;
  source: string;
  owner: string;
  stage: string;
  lastModified: string;
  size: string;
  location: string;
  date: string;
}

interface ScoredLead extends Lead {
  score: number;
  priority: LeadPriority;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'' | LeadPriority>('');
  const [sortField, setSortField] = useState<'businessName' | 'lastModified' | 'status' | 'score'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/leads')
      .then(r => r.json())
      .then(data => {
        // Only show leads at MQL or SQL stage — MAL is too noisy.
        const filtered = (data.leads || []).filter((l: Lead) => {
          const s = (l.status || '').trim().toUpperCase();
          return s === 'MQL' || s === 'SQL';
        });
        setLeads(filtered);
        setTotal(filtered.length);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Extract unique values for filters
  const statuses = [...new Set(leads.map(l => l.status).filter(Boolean))].sort();
  const owners = [...new Set(leads.map(l => l.owner).filter(Boolean))].sort();
  const partners = [...new Set(leads.flatMap(l => l.partners).filter(Boolean))].sort();

  // Score every lead once — memoised because scoreLead is pure and leads are
  // big (hundreds to thousands of rows).
  const scoredLeads: ScoredLead[] = useMemo(
    () => leads.map(l => ({ ...l, ...scoreLead(l) })),
    [leads]
  );

  // Filter
  const filtered = scoredLeads.filter(l => {
    if (search && !l.businessName.toLowerCase().includes(search.toLowerCase()) &&
        !l.location.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (ownerFilter && l.owner !== ownerFilter) return false;
    if (partnerFilter && !l.partners.includes(partnerFilter)) return false;
    if (priorityFilter && l.priority !== priorityFilter) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'businessName') cmp = a.businessName.localeCompare(b.businessName);
    else if (sortField === 'lastModified') cmp = (a.lastModified || '').localeCompare(b.lastModified || '');
    else if (sortField === 'status') cmp = (a.status || '').localeCompare(b.status || '');
    else if (sortField === 'score') cmp = a.score - b.score;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function exportCsv() {
    const headers = [
      'Business', 'Priority', 'Score', 'Status', 'Stage', 'Source',
      'Owner', 'Partners', 'Size', 'Location', 'Last modified',
    ];
    const rows = sorted.map(l => [
      l.businessName,
      PRIORITY_LABEL[l.priority].replace(/^\W+\s*/, ''), // strip emoji for CSV
      l.score,
      l.status,
      l.stage,
      l.source,
      l.owner,
      l.partners.join('; '),
      l.size,
      l.location,
      l.lastModified ? l.lastModified.split('T')[0] : '',
    ]);
    const date = new Date().toISOString().slice(0, 10);
    const suffix = (search || statusFilter || ownerFilter || partnerFilter || priorityFilter)
      ? '-filtered' : '';
    downloadCsv(`leads${suffix}-${date}.csv`, toCsv(headers, rows));
  }

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIcon = (field: typeof sortField) => {
    if (sortField !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      'MAL': 'bg-green-100 text-green-700',
      'SQL': 'bg-orange-100 text-orange-700',
      'MQL': 'bg-yellow-100 text-yellow-700',
      'In Conversation': 'bg-red-100 text-red-700',
      'Opportunity': 'bg-blue-100 text-blue-700',
      'nurture': 'bg-amber-100 text-amber-700',
      'Live Closed': 'bg-cyan-100 text-cyan-700',
      'Lost': 'bg-gray-100 text-gray-500',
      'Lead': 'bg-purple-100 text-purple-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const STATUS_EXPLAINER: Record<string, string> = LEAD_STATUS_EXPLAINER;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500">Loading all leads...</div>;
  }

  const hotCount  = scoredLeads.filter(l => l.priority === 'hot').length;
  const highCount = scoredLeads.filter(l => l.priority === 'high').length;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Leads</h1>
          <p className="text-gray-500 mt-1">
            {total.toLocaleString()} total · <span className="text-rose-600 font-medium">{hotCount} hot</span> ·{' '}
            <span className="text-amber-600 font-medium">{highCount} high priority</span>
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="bg-gray-900 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap"
          title={sorted.length === leads.length ? 'Export all leads' : `Export ${sorted.length} filtered leads`}
        >
          ↓ Export CSV{sorted.length !== leads.length ? ` (${sorted.length})` : ''}
        </button>
      </div>

      <LeadStatusGlossary className="mb-4" />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search business name or location..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green">
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green">
            <option value="">All Owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green">
            <option value="">All Partners</option>
            {partners.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as '' | LeadPriority)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-green focus:border-brand-green">
            <option value="">All Priorities</option>
            <option value="hot">🔥 Hot ({scoredLeads.filter(l => l.priority === 'hot').length})</option>
            <option value="high">⭐ High ({scoredLeads.filter(l => l.priority === 'high').length})</option>
            <option value="normal">Normal</option>
            <option value="cold">Cold</option>
          </select>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {sorted.length.toLocaleString()} of {total.toLocaleString()} leads
          {(search || statusFilter || ownerFilter || partnerFilter || priorityFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setOwnerFilter(''); setPartnerFilter(''); setPriorityFilter(''); }}
              className="ml-3 text-brand-green hover:text-brand-green-soft">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1024px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort('score')}>
                  Priority {sortIcon('score')}
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort('businessName')}>
                  Business {sortIcon('businessName')}
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort('status')}>
                  Status {sortIcon('status')}
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Stage</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Source</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Owner</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Partners</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Size</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Location</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort('lastModified')}>
                  Modified {sortIcon('lastModified')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((lead) => (
                <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block text-xs px-2 py-1 rounded-full whitespace-nowrap ${PRIORITY_CLASS[lead.priority]}`}
                      title={`Score ${lead.score}/100`}
                    >
                      {PRIORITY_LABEL[lead.priority]}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-900">{lead.businessName}</td>
                  <td className="py-3 px-4">
                    {lead.status && (
                      <span
                        className={`inline-block text-xs px-2 py-1 rounded-full ${statusColor(lead.status)}`}
                        title={STATUS_EXPLAINER[lead.status] || lead.status}
                      >
                        {lead.status}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{lead.stage}</td>
                  <td className="py-3 px-4 text-gray-600">{lead.source}</td>
                  <td className="py-3 px-4 text-gray-600">{lead.owner}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {lead.partners.slice(0, 3).map(p => (
                        <span key={p} className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                      {lead.partners.length > 3 && (
                        <span className="text-xs text-gray-400">+{lead.partners.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{lead.size}</td>
                  <td className="py-3 px-4 text-gray-600">{lead.location}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {lead.lastModified ? lead.lastModified.split('T')[0] : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 200 && (
          <div className="p-4 text-center text-sm text-gray-500 bg-gray-50">
            Showing first 200 of {sorted.length.toLocaleString()} results. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );
}
