'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Venue {
  submissionId: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string;
  phoneNumber: string | null;
  role: string | null;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  industry: string | null;
  vertical: string | null;
  biggestChallenge: string | null;
  createdAt: string;
}

interface Tool {
  tool: string;
  count: number;
  venues: Venue[];
}

interface Category {
  category: string;
  totalAnswers: number;
  uniqueVenues: number;
  tools: Tool[];
}

interface WhatsAppVenue {
  id: string;
  created_at: string;
  uses_whatsapp: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  phone_number: string | null;
  location: string | null;
  sites: string | null;
  segment: string | null;
}

interface WhatsAppSummary {
  yes: WhatsAppVenue[];
  no: WhatsAppVenue[];
  yesCount: number;
  noCount: number;
  totalAnswered: number;
}

interface TechCheckData {
  whatsapp?: WhatsAppSummary;
  categories: Category[];
  totalAnswers: number;
  totalVenues: number;
  totalCategories: number;
}

// CSV helper: quote everything so notes/biggest_challenge with commas / quotes
// don't break the file.
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([rows.map(r => r.map(csvEscape).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function TechCheckSummary() {
  const [data, setData] = useState<TechCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const [openWhatsapp, setOpenWhatsapp] = useState<'yes' | 'no' | null>(null);
  const [search, setSearch] = useState('');
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  function jumpToCategory(cat: string) {
    const el = categoryRefs.current.get(cat);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    fetch('/api/tech-check')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [] as Category[];
    if (!search.trim()) return data.categories;
    const q = search.toLowerCase();
    return data.categories
      .map(c => {
        const catMatch = c.category.toLowerCase().includes(q);
        const tools = c.tools
          .map(t => {
            const toolMatch = t.tool.toLowerCase().includes(q);
            const venues = t.venues.filter(
              v =>
                v.businessName.toLowerCase().includes(q) ||
                (v.location || '').toLowerCase().includes(q) ||
                (v.contactName || '').toLowerCase().includes(q) ||
                (v.contactEmail || '').toLowerCase().includes(q) ||
                (v.phoneNumber || '').toLowerCase().includes(q) ||
                (v.industry || '').toLowerCase().includes(q) ||
                (v.vertical || '').toLowerCase().includes(q)
            );
            if (catMatch || toolMatch) return t; // show all venues under the matched tool
            if (venues.length > 0) return { ...t, venues, count: venues.length };
            return null;
          })
          .filter((t): t is Tool => t !== null);
        if (catMatch) return c; // show whole category if its name matched
        if (tools.length === 0) return null;
        return { ...c, tools, totalAnswers: tools.reduce((s, t) => s + t.count, 0) };
      })
      .filter((c): c is Category => c !== null);
  }, [data, search]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">Loading tech check…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Tech Check failed to load: {error}
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-bold text-gray-900">Tech Check Insights</h2>
        <p className="text-sm text-gray-500 mt-1">
          No tech-check answers yet. Once venues complete the questionnaire, their tool answers
          will appear here grouped by category.
        </p>
      </div>
    );
  }

  function venueRows(category: string, tool: string, venues: Venue[]) {
    return venues.map(v => [
      category,
      tool,
      v.businessName,
      v.contactName || '',
      v.role || '',
      v.contactEmail || '',
      v.phoneNumber || '',
      v.location || '',
      v.size || '',
      v.numberOfLocations || '',
      v.industry || '',
      v.vertical || '',
      v.biggestChallenge || '',
      v.createdAt?.slice(0, 10) || '',
    ]);
  }

  const VENUE_CSV_HEADER = [
    'Category', 'Tool', 'Business', 'Contact', 'Role', 'Email', 'Phone',
    'Location', 'Size', 'Locations', 'Industry', 'Vertical',
    'Biggest challenge', 'Submitted',
  ];

  function exportToolCsv(category: string, tool: string, venues: Venue[]) {
    const date = new Date().toISOString().slice(0, 10);
    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-');
    downloadCsv(`tech-check-${safe(category)}-${safe(tool)}-${date}.csv`, [
      VENUE_CSV_HEADER,
      ...venueRows(category, tool, venues),
    ]);
  }

  function exportCategoryCsv(c: Category) {
    const header = VENUE_CSV_HEADER;
    const all = c.tools.flatMap(t => venueRows(c.category, t.tool, t.venues));
    const date = new Date().toISOString().slice(0, 10);
    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-');
    downloadCsv(`tech-check-${safe(c.category)}-${date}.csv`, [header, ...all]);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold text-brand-green">Tech Check Insights</h2>
          <p className="text-xs text-gray-500">
            What your venues are using — click a tool to see who, and export the list to follow up.
            {' '}
            <span className="text-gray-400">
              ({data.totalCategories} categories · {data.totalAnswers.toLocaleString()} answers · {data.totalVenues.toLocaleString()} venues)
            </span>
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search venue, tool, category, email, phone…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green focus:border-brand-green sm:w-80"
        />
      </div>

      {/* Category jump pills — quick nav to any category */}
      {!search && data.categories.length > 4 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data.categories.map(c => (
            <button
              key={c.category}
              onClick={() => jumpToCategory(c.category)}
              className="text-[11px] px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-700 hover:border-brand-green hover:text-brand-green transition-colors"
              title={`Jump to ${c.category} (${c.totalAnswers} answers)`}
            >
              {c.category}
              <span className="ml-1 text-gray-400">{c.totalAnswers}</span>
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp yes/no panel — pinned above the categories */}
      {data.whatsapp && (() => {
        const w = data.whatsapp;
        const exportWhatsappCsv = (label: 'Yes' | 'No', venues: WhatsAppVenue[]) => {
          const header = [
            'Answer', 'Business', 'Contact', 'Email', 'Phone',
            'Location', 'Sites', 'Segment', 'Submitted',
          ];
          const rows = venues.map(v => [
            label,
            v.company || '',
            [v.first_name, v.last_name].filter(Boolean).join(' '),
            v.email || '',
            v.phone_number || '',
            v.location || '',
            v.sites || '',
            v.segment || '',
            v.created_at?.slice(0, 10) || '',
          ]);
          const date = new Date().toISOString().slice(0, 10);
          downloadCsv(`whatsapp-${label.toLowerCase()}-${date}.csv`, [header, ...rows]);
        };

        const Panel = ({ side, label, venues, color }: {
          side: 'yes' | 'no'; label: string; venues: WhatsAppVenue[]; color: string;
        }) => {
          const open = openWhatsapp === side;
          const pct = w.totalAnswered ? Math.round((venues.length / w.totalAnswered) * 100) : 0;
          return (
            <div className={`${color} rounded-xl p-4`}>
              <button
                onClick={() => setOpenWhatsapp(open ? null : side)}
                className="w-full text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-green">{label}</span>
                  <span className="text-[11px] text-brand-green/70">{pct}%</span>
                </div>
                <p className="text-3xl font-bold text-brand-green mt-1">{venues.length}</p>
                <p className="text-[11px] text-brand-green/70 mt-0.5">
                  {venues.length === 1 ? 'venue' : 'venues'} · {open ? 'hide' : 'show'} list
                </p>
              </button>
              {open && (
                <div className="mt-3 bg-white/60 rounded-md p-3 border border-brand-green/10">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-medium text-brand-green">
                      {venues.length} {venues.length === 1 ? 'venue' : 'venues'} answered “{label}”
                    </p>
                    <button
                      onClick={() => exportWhatsappCsv(label as 'Yes' | 'No', venues)}
                      className="text-[11px] text-gray-500 hover:text-brand-green"
                      title={`Export these ${venues.length} venues as CSV`}
                    >
                      ↓ CSV
                    </button>
                  </div>
                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {venues.map(v => (
                      <li key={v.id} className="text-xs">
                        <div className="font-medium text-gray-900">{v.company || '—'}</div>
                        <div className="text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          {(v.first_name || v.last_name) && (
                            <span>{[v.first_name, v.last_name].filter(Boolean).join(' ')}</span>
                          )}
                          {v.email && (
                            <a href={`mailto:${v.email}`} className="text-brand-green hover:text-brand-green-soft underline">
                              {v.email}
                            </a>
                          )}
                          {v.phone_number && <span>{v.phone_number}</span>}
                          {v.location && <span>{v.location}</span>}
                          {v.sites && <span>{v.sites} site{v.sites === '1' ? '' : 's'}</span>}
                          {v.segment && <span>{v.segment}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">WhatsApp for team comms</h3>
              <p className="text-[11px] text-gray-500">
                Yes vs no — click either to see the venue list (= leads for comms-tool pitches).
                {' '}
                <span className="text-gray-400">({w.totalAnswered} answered)</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Panel side="yes" label="Yes" venues={w.yes} color="bg-brand-lime/30" />
              <Panel side="no" label="No" venues={w.no} color="bg-brand-sky" />
            </div>
            {w.totalAnswered === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
                No answers showing yet. If you know venues have answered this on the tech review,
                the portal likely can&apos;t read the <code>submissions</code> table — RLS in
                Supabase may need a SELECT policy for it (same fix we did for the other reporting tables).
              </p>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(c => {
          const open = openCategory === c.category;
          const visibleTools = open ? c.tools : c.tools.slice(0, 5);
          const maxCount = c.tools[0]?.count || 1;
          return (
            <div
              key={c.category}
              ref={el => { if (el) categoryRefs.current.set(c.category, el); else categoryRefs.current.delete(c.category); }}
              className="bg-white rounded-xl border border-gray-200 p-4 scroll-mt-20"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{c.category}</h3>
                  <p className="text-[11px] text-gray-500">
                    {c.totalAnswers} answers · {c.uniqueVenues} venues
                  </p>
                </div>
                <button
                  onClick={() => exportCategoryCsv(c)}
                  className="text-[11px] text-gray-500 hover:text-brand-green whitespace-nowrap"
                  title={`Export all ${c.totalAnswers} answers in ${c.category} as CSV`}
                >
                  ↓ CSV
                </button>
              </div>

              <ul className="space-y-1.5">
                {visibleTools.map(t => {
                  const isOpen = openCategory === c.category && openTool === t.tool;
                  return (
                    <li key={t.tool} className="rounded-md">
                      <button
                        onClick={() => {
                          if (isOpen) {
                            setOpenTool(null);
                          } else {
                            setOpenCategory(c.category);
                            setOpenTool(t.tool);
                          }
                        }}
                        className="w-full text-left group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`text-xs font-medium truncate ${isOpen ? 'text-brand-green' : 'text-gray-700 group-hover:text-brand-green'}`}>
                            {t.tool}
                          </span>
                          <span className="text-[11px] text-gray-500 whitespace-nowrap">
                            {t.count} {t.count === 1 ? 'venue' : 'venues'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-green rounded-full transition-[width]"
                            style={{ width: `${Math.max(4, (t.count / maxCount) * 100)}%` }}
                          />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="mt-2 bg-brand-cream rounded-md p-3 border border-brand-green/10">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-medium text-brand-green">
                              {t.venues.length} {t.venues.length === 1 ? 'venue' : 'venues'} using {t.tool}
                            </p>
                            <button
                              onClick={() => exportToolCsv(c.category, t.tool, t.venues)}
                              className="text-[11px] text-gray-500 hover:text-brand-green"
                              title={`Export these ${t.venues.length} venues as CSV`}
                            >
                              ↓ CSV
                            </button>
                          </div>
                          <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                            {t.venues.map(v => {
                              const verticalChip = v.vertical || v.industry;
                              return (
                                <li key={v.submissionId} className="text-xs">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="font-medium text-gray-900">{v.businessName}</span>
                                    {verticalChip && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-sky/60 text-brand-green whitespace-nowrap">
                                        {verticalChip}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                    {v.contactName && <span>{v.contactName}{v.role ? ` · ${v.role}` : ''}</span>}
                                    {v.contactEmail && (
                                      <a href={`mailto:${v.contactEmail}`} className="text-brand-green hover:text-brand-green-soft underline">
                                        {v.contactEmail}
                                      </a>
                                    )}
                                    {v.phoneNumber && (
                                      <a href={`tel:${v.phoneNumber.replace(/\s+/g, '')}`} className="text-brand-green hover:text-brand-green-soft underline">
                                        {v.phoneNumber}
                                      </a>
                                    )}
                                    {v.location && <span>{v.location}</span>}
                                    {v.numberOfLocations && <span>{v.numberOfLocations} site{v.numberOfLocations === '1' ? '' : 's'}</span>}
                                  </div>
                                  {v.biggestChallenge && (
                                    <p className="text-gray-600 mt-0.5 italic">“{v.biggestChallenge}”</p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {c.tools.length > 5 && (
                <button
                  onClick={() => {
                    if (open) {
                      setOpenCategory(null);
                      setOpenTool(null);
                    } else {
                      setOpenCategory(c.category);
                      setOpenTool(null);
                    }
                  }}
                  className="mt-3 text-[11px] text-gray-500 hover:text-brand-green"
                >
                  {open ? '— Show top 5' : `+ Show all ${c.tools.length} tools`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
