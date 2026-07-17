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
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  location: string | null;
  numberOfLocations: string | null;
  vertical: string | null;
  industry: string | null;
}

interface WhatsAppSummary {
  yes: WhatsAppVenue[];
  no: WhatsAppVenue[];
  yesCount: number;
  noCount: number;
  totalAnswered: number;
}

// Same shape as WhatsApp — venues that answered yes/no to "do you have a
// knowledge base?" on the tech-stack review form.
type KbVenue = WhatsAppVenue;
interface KbSummary {
  yes: KbVenue[];
  no: KbVenue[];
  yesCount: number;
  noCount: number;
  totalAnswered: number;
}

// One expandable venue row for the "all tech checks" drilldown at the
// bottom of the page. Comes pre-shaped from /api/tech-check with tools
// grouped by category and NPS scores already attached.
interface VenueDrilldown {
  submissionId: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  industry: string | null;
  vertical: string | null;
  biggestChallenge: string | null;
  createdAt: string;
  toolCount: number;
  npsCount: number;
  avgNps: number | null;
  recommendations: string | null;
  byCategory: Array<{
    category: string;
    tools: Array<{ tool: string; nps: number | null; comment: string | null }>;
  }>;
  extraNps: Array<{ vendor: string; category: string | null; score: number; comment: string | null }>;
}

interface TechCheckData {
  whatsapp?: WhatsAppSummary;
  knowledgeBase?: KbSummary;
  categories: Category[];
  totalAnswers: number;
  totalVenues: number;
  totalCategories: number;
  venues?: VenueDrilldown[];
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

// Build a Markdown report from a venue's tech check + AI recommendations.
// Everything a partner or the internal team might want in one file: business
// info, biggest challenge, stack grouped by category with per-tool NPS,
// overall NPS, and the AI review parsed from the pipe-separated recommendations.
function downloadVenueReport(v: VenueDrilldown) {
  const safeSlug = (v.businessName || 'venue').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'venue';
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# ${v.businessName} — Tech Check Report`);
  lines.push('');
  lines.push(`_Generated ${date} from Approved Reporting_`);
  lines.push('');
  lines.push('## Venue');
  if (v.contactName)         lines.push(`- **Contact:** ${v.contactName}`);
  if (v.contactEmail)        lines.push(`- **Email:** ${v.contactEmail}`);
  if (v.location)            lines.push(`- **Location:** ${v.location}`);
  if (v.vertical)            lines.push(`- **Vertical:** ${v.vertical}`);
  if (v.industry)            lines.push(`- **Industry:** ${v.industry}`);
  if (v.numberOfLocations)   lines.push(`- **Sites:** ${v.numberOfLocations}`);
  if (v.size)                lines.push(`- **Size:** ${v.size}`);
  if (v.createdAt)           lines.push(`- **Submitted:** ${v.createdAt.slice(0, 10)}`);
  lines.push(`- **Tools recorded:** ${v.toolCount}`);
  lines.push(`- **Tools rated:** ${v.npsCount}${v.avgNps != null ? ` · **Overall NPS avg:** ${v.avgNps.toFixed(1)}/10` : ''}`);
  lines.push('');
  if (v.biggestChallenge) {
    lines.push('## Biggest challenge');
    lines.push('');
    lines.push(`> ${v.biggestChallenge}`);
    lines.push('');
  }
  lines.push('## Tech stack');
  lines.push('');
  if (v.byCategory.length === 0) {
    lines.push('_No tools recorded._');
  } else {
    for (const cat of v.byCategory) {
      lines.push(`### ${cat.category}`);
      lines.push('');
      for (const t of cat.tools) {
        const npsPart = t.nps != null ? ` — **${t.nps}/10**` : '';
        const commentPart = t.comment ? ` _(${t.comment})_` : '';
        lines.push(`- ${t.tool}${npsPart}${commentPart}`);
      }
      lines.push('');
    }
  }
  if (v.extraNps.length > 0) {
    lines.push('## Additional NPS scores');
    lines.push('');
    lines.push('_These scores are attributed to this venue but the vendor name in the review didn\'t match any tool in the form._');
    lines.push('');
    for (const e of v.extraNps) {
      const commentPart = e.comment ? ` _(${e.comment})_` : '';
      const catPart = e.category ? ` · ${e.category}` : '';
      lines.push(`- ${e.vendor}${catPart} — **${e.score}/10**${commentPart}`);
    }
    lines.push('');
  }
  if (v.recommendations) {
    lines.push('## AI review — Tech on Toast');
    lines.push('');
    const recs = v.recommendations.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
    for (const r of recs) lines.push(`- ${r}`);
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tech-check-${safeSlug}-${date}.md`;
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
  const [openKb, setOpenKb] = useState<'yes' | 'no' | null>(null);
  const [search, setSearch] = useState('');
  // Drilldown section state — collapsed by default so 600+ venues don't
  // dominate the page. Search filters by business name / location /
  // contact / any tool the venue picked.
  const [showVenues, setShowVenues] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
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

      {/* All venue tech checks — full drilldown. Pinned at the top of the
          insights so the team can jump straight into any completed check.
          Collapsed by default so 600+ venues don't dominate the page.
          Search filters by venue, location, contact, or any tool the
          venue picked. Each row expands to show every tool the operator
          entered, grouped by category, with the NPS score they gave that
          specific tool. */}
      {data.venues && data.venues.length > 0 && (() => {
        const venues = data.venues;
        const q = venueSearch.trim().toLowerCase();
        const filtered = q
          ? venues.filter(v => {
              if ((v.businessName || '').toLowerCase().includes(q)) return true;
              if ((v.location || '').toLowerCase().includes(q)) return true;
              if ((v.contactName || '').toLowerCase().includes(q)) return true;
              if ((v.contactEmail || '').toLowerCase().includes(q)) return true;
              // Match against any tool the venue picked
              return v.byCategory.some(cat => cat.tools.some(t => t.tool.toLowerCase().includes(q)));
            })
          : venues;

        const npsClass = (n: number | null): string => {
          if (n == null) return 'bg-gray-100 text-gray-500';
          if (n >= 9) return 'bg-emerald-100 text-emerald-800';
          if (n >= 7) return 'bg-amber-100 text-amber-800';
          return 'bg-rose-100 text-rose-800';
        };
        const avgClass = (n: number | null): string => {
          if (n == null) return 'bg-gray-100 text-gray-500';
          if (n >= 8) return 'bg-emerald-500 text-white';
          if (n >= 6) return 'bg-amber-500 text-white';
          return 'bg-rose-500 text-white';
        };

        return (
          <div className="bg-white rounded-xl border border-gray-200 mb-3 overflow-hidden">
            <button
              onClick={() => setShowVenues(s => !s)}
              className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-brand-cream/40"
              aria-expanded={showVenues}
            >
              <div>
                <h3 className="font-semibold text-gray-900">All venue tech checks</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Every completed tech check, with the exact stack each venue picked and their NPS score per product.
                </p>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap inline-flex items-center gap-1">
                {venues.length} venues
                <svg className={`w-3.5 h-3.5 transition-transform ${showVenues ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>

            {showVenues && (
              <div className="border-t border-gray-100">
                <div className="p-3 sm:p-4">
                  <input
                    type="text"
                    value={venueSearch}
                    onChange={e => setVenueSearch(e.target.value)}
                    placeholder="Search venue, contact, location, or tool…"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Showing {filtered.length} of {venues.length} venues{q ? ` matching "${q}"` : ''}
                  </p>
                </div>

                <ul className="max-h-[720px] overflow-y-auto border-t border-gray-100 divide-y divide-gray-100">
                  {filtered.length === 0 && (
                    <li className="p-6 text-center text-sm text-gray-400">No venues match this search.</li>
                  )}
                  {filtered.map(v => {
                    const isOpen = expandedVenue === v.submissionId;
                    return (
                      <li key={v.submissionId}>
                        <button
                          onClick={() => setExpandedVenue(isOpen ? null : v.submissionId)}
                          className={`w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-brand-cream/30 ${isOpen ? 'bg-brand-cream/50' : ''}`}
                        >
                          <span className="text-gray-400 text-[10px] w-3">{isOpen ? '▾' : '▸'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {v.businessName}
                              {v.numberOfLocations && (
                                <span className="text-[11px] text-gray-500 font-normal ml-2">
                                  {v.numberOfLocations} site{v.numberOfLocations === '1' ? '' : 's'}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                              {v.location && <span>{v.location}</span>}
                              {v.vertical && <span>{v.vertical}</span>}
                              <span>{v.toolCount} tools</span>
                              <span>{v.npsCount} rated</span>
                              <span className="text-gray-400">{v.createdAt.slice(0, 10)}</span>
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold tabular-nums whitespace-nowrap ${avgClass(v.avgNps)}`}>
                            {v.avgNps != null ? `${v.avgNps.toFixed(1)} avg` : 'no NPS'}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="bg-brand-cream/30 border-t border-gray-100 p-4 sm:p-5 space-y-4">
                            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-gray-500">
                              {v.contactEmail && (
                                <span>
                                  Contact:{' '}
                                  <span className="text-gray-800">{v.contactName || '—'}</span>
                                  {' · '}
                                  <a href={`mailto:${v.contactEmail}`} className="text-brand-green hover:text-brand-green-soft underline">
                                    {v.contactEmail}
                                  </a>
                                </span>
                              )}
                              <button
                                onClick={() => downloadVenueReport(v)}
                                className="ml-auto text-[11px] text-brand-green hover:text-brand-green-soft underline"
                                title="Download this tech check as a Markdown report"
                              >
                                ↓ Download report (.md)
                              </button>
                            </div>

                            {v.biggestChallenge && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">Biggest challenge</p>
                                <p className="text-xs sm:text-sm text-gray-800 italic">&ldquo;{v.biggestChallenge}&rdquo;</p>
                              </div>
                            )}

                            {v.byCategory.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No tools recorded.</p>
                            ) : (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">Tech stack</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                                  {v.byCategory.map(cat => (
                                    <div key={cat.category}>
                                      <p className="text-[11px] text-gray-600 font-medium mb-1">{cat.category}</p>
                                      <ul className="space-y-1">
                                        {cat.tools.map((t, i) => (
                                          <li key={`${cat.category}-${t.tool}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="text-gray-800">{t.tool}</span>
                                            <span
                                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums whitespace-nowrap ${npsClass(t.nps)}`}
                                              title={t.comment || undefined}
                                            >
                                              {t.nps != null ? `${t.nps}/10` : '—'}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {v.extraNps.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                                  Additional NPS scores{' '}
                                  <span className="normal-case text-gray-400 font-normal">
                                    · vendor named differently than the tool in the form
                                  </span>
                                </p>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                                  {v.extraNps.map((e, i) => (
                                    <li key={`${e.vendor}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="text-gray-800">
                                        {e.vendor}
                                        {e.category && <span className="text-gray-400 ml-1">· {e.category}</span>}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums whitespace-nowrap ${npsClass(e.score)}`}
                                        title={e.comment || undefined}
                                      >
                                        {e.score}/10
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {v.recommendations && (
                              <div className="bg-white border border-brand-green/20 rounded-md p-3 sm:p-4">
                                <p className="text-[10px] uppercase tracking-wider text-brand-green font-medium mb-2">
                                  AI review · Tech on Toast
                                </p>
                                <ul className="space-y-1.5 text-xs sm:text-sm text-gray-800 list-disc pl-4">
                                  {v.recommendations
                                    .split(/\s*\|\s*/)
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                    .map((rec, i) => (
                                      <li key={i} className="leading-relaxed">{rec}</li>
                                    ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* WhatsApp yes/no panel — pinned above the categories */}
      {data.whatsapp && (() => {
        const w = data.whatsapp;
        const exportWhatsappCsv = (label: 'Yes' | 'No', venues: WhatsAppVenue[]) => {
          const header = [
            'Answer', 'Business', 'Contact', 'Email', 'Phone',
            'Location', 'Locations', 'Vertical', 'Industry', 'Submitted',
          ];
          const rows = venues.map(v => [
            label,
            v.businessName || '',
            v.contactName || '',
            v.contactEmail || '',
            v.phoneNumber || '',
            v.location || '',
            v.numberOfLocations || '',
            v.vertical || '',
            v.industry || '',
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
                    {venues.map(v => {
                      const verticalChip = v.vertical || v.industry;
                      return (
                        <li key={v.id} className="text-xs">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-gray-900">{v.businessName || '—'}</span>
                            {verticalChip && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 text-brand-green whitespace-nowrap">
                                {verticalChip}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {v.contactName && <span>{v.contactName}</span>}
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
                        </li>
                      );
                    })}
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

      {/* Knowledge-base yes/no panel — same shape as WhatsApp. The "No" side
          is a lead list for KB / help-centre tool pitches. */}
      {data.knowledgeBase && (() => {
        const k = data.knowledgeBase;
        const exportKbCsv = (label: 'Yes' | 'No', venues: KbVenue[]) => {
          const header = [
            'Answer', 'Business', 'Contact', 'Email', 'Phone',
            'Location', 'Locations', 'Vertical', 'Industry', 'Submitted',
          ];
          const rows = venues.map(v => [
            label,
            v.businessName || '',
            v.contactName || '',
            v.contactEmail || '',
            v.phoneNumber || '',
            v.location || '',
            v.numberOfLocations || '',
            v.vertical || '',
            v.industry || '',
            v.created_at?.slice(0, 10) || '',
          ]);
          const date = new Date().toISOString().slice(0, 10);
          downloadCsv(`knowledge-base-${label.toLowerCase()}-${date}.csv`, [header, ...rows]);
        };

        const Panel = ({ side, label, venues, color }: {
          side: 'yes' | 'no'; label: string; venues: KbVenue[]; color: string;
        }) => {
          const open = openKb === side;
          const pct = k.totalAnswered ? Math.round((venues.length / k.totalAnswered) * 100) : 0;
          return (
            <div className={`${color} rounded-xl p-4`}>
              <button onClick={() => setOpenKb(open ? null : side)} className="w-full text-left">
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
                      onClick={() => exportKbCsv(label as 'Yes' | 'No', venues)}
                      className="text-[11px] text-gray-500 hover:text-brand-green"
                      title={`Export these ${venues.length} venues as CSV`}
                    >
                      ↓ CSV
                    </button>
                  </div>
                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {venues.map(v => {
                      const verticalChip = v.vertical || v.industry;
                      return (
                        <li key={v.id} className="text-xs">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-gray-900">{v.businessName || '—'}</span>
                            {verticalChip && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 text-brand-green whitespace-nowrap">
                                {verticalChip}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {v.contactName && <span>{v.contactName}</span>}
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
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">Do you have a knowledge base?</h3>
              <p className="text-[11px] text-gray-500">
                Yes vs no — click either to see the venue list (= the &ldquo;No&rdquo; side is a lead list for KB / help-centre pitches).
                {' '}
                <span className="text-gray-400">({k.totalAnswered} answered)</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Panel side="yes" label="Yes" venues={k.yes} color="bg-brand-lime/30" />
              <Panel side="no" label="No" venues={k.no} color="bg-brand-sky" />
            </div>
            {k.totalAnswered === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
                No answers showing yet. The <code>has_knowledge_base</code> column on
                <code className="mx-1">business_submissions</code> may need RLS SELECT,
                or the column may not be populated yet.
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
