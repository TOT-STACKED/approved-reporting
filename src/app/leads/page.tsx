'use client';

import { useEffect, useState } from 'react';

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [sortField, setSortField] = useState<'businessName' | 'lastModified' | 'status'>('lastModified');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/leads')
      .then(r => r.json())
      .then(data => {
        setLeads(data.leads || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Extract unique values for filters
  const statuses = [...new Set(leads.map(l => l.status).filter(Boolean))].sort();
  const owners = [...new Set(leads.map(l => l.owner).filter(Boolean))].sort();
  const partners = [...new Set(leads.flatMap(l => l.partners).filter(Boolean))].sort();

  // Filter
  const filtered = leads.filter(l => {
    if (search && !l.businessName.toLowerCase().includes(search.toLowerCase()) &&
        !l.location.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (ownerFilter && l.owner !== ownerFilter) return false;
    if (partnerFilter && !l.partners.includes(partnerFilter)) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'businessName') cmp = a.businessName.localeCompare(b.businessName);
    else if (sortField === 'lastModified') cmp = (a.lastModified || '').localeCompare(b.lastModified || '');
    else if (sortField === 'status') cmp = (a.status || '').localeCompare(b.status || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

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

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500">Loading all leads...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Leads</h1>
        <p className="text-gray-500 mt-1">{total.toLocaleString()} total leads in the pipeline</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search business name or location..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
            <option value="">All Owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
            <option value="">All Partners</option>
            {partners.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {sorted.length.toLocaleString()} of {total.toLocaleString()} leads
          {(search || statusFilter || ownerFilter || partnerFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setOwnerFilter(''); setPartnerFilter(''); }}
              className="ml-3 text-orange-500 hover:text-orange-600">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
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
                  <td className="py-3 px-4 font-medium text-gray-900">{lead.businessName}</td>
                  <td className="py-3 px-4">
                    {lead.status && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${statusColor(lead.status)}`}>
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
