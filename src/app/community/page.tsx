'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface CommunityData {
  leadGen: {
    totalLeads: number;
    malTotal: number;
    mqlTotal: number;
    sqlTotal: number;
    wonTotal: number;
    last30Days: number;
    last90Days: number;
  };
  stackReviews: {
    totalReviews: number;
    totalToolEntries: number;
    reviewsByMonth: { month: string; count: number }[];
    topTools: { name: string; count: number }[];
    topCategories: { category: string; count: number }[];
  };
  events: { title: string; date: string; url: string; description?: string }[];
  podcast: {
    showTitle: string;
    showLink: string;
    showImage: string;
    episodes: { title: string; pubDate: string; duration: string; link: string; description: string }[];
    totalEpisodes: number;
  };
}

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-');
  if (!y || !m) return yyyymm;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function relativeDate(rfc822: string): string {
  if (!rfc822) return '';
  const d = new Date(rfc822);
  if (isNaN(d.getTime())) return rfc822;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function CommunityPage() {
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/community')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-500">Loading community update…</div>;
  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        <p className="font-semibold">Couldn&apos;t load community data</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 rounded-2xl p-6 sm:p-8 text-white mb-6 sm:mb-8 shadow-lg">
        <p className="text-xs sm:text-sm uppercase tracking-wider opacity-80 mb-2">Marketplace Community Update</p>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">What we&apos;re doing for our marketplace partners</h1>
        <p className="text-sm sm:text-base opacity-90 max-w-2xl">
          A snapshot of lead generation, tech stack trends, upcoming events and podcast activity across the Tech on Toast community.
          Same view for every partner — no individual data, just what we&apos;re up to as a network.
        </p>
      </div>

      {/* Lead Gen Overview */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Lead Generation</h2>
            <p className="text-xs text-gray-500">Pipeline volume across the whole community</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{data.leadGen.malTotal.toLocaleString()}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">MAL</p>
            <p className="text-[10px] opacity-50 mt-1">Marketing Awareness Leads</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{data.leadGen.mqlTotal.toLocaleString()}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">MQL</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{data.leadGen.sqlTotal.toLocaleString()}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">SQL</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 text-white">
            <p className="text-2xl sm:text-3xl font-bold">{data.leadGen.wonTotal.toLocaleString()}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">Closed Won</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last 30 days</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.leadGen.last30Days.toLocaleString()} new leads</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last 90 days</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.leadGen.last90Days.toLocaleString()} new leads</p>
          </div>
        </div>
      </section>

      {/* Tech Stack Trends */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Tech Stack Review Trends</h2>
            <p className="text-xs text-gray-500">What hospitality operators are running, gathered via StackCollect</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Reviews submitted (last 6 months)</h3>
            {data.stackReviews.reviewsByMonth.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.stackReviews.reviewsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <Tooltip labelFormatter={(label: unknown) => monthLabel(String(label ?? ''))} />
                  <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Top categories</h3>
            <div className="space-y-2">
              {data.stackReviews.topCategories.map((c, i) => {
                const max = data.stackReviews.topCategories[0]?.count || 1;
                return (
                  <div key={c.category}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700">
                        <span className="text-gray-400 mr-2">{i + 1}.</span>{c.category}
                      </span>
                      <span className="text-xs text-gray-500">{c.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Most-mentioned tools</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {data.stackReviews.topTools.map((t, i) => (
              <div key={t.name} className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] text-gray-400">#{i + 1}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                <p className="text-xs text-orange-600 font-medium mt-0.5">{t.count} mentions</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 mt-3">
          {data.stackReviews.totalReviews.toLocaleString()} total reviews · {data.stackReviews.totalToolEntries.toLocaleString()} tool selections
        </div>
      </section>

      {/* Upcoming Events */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upcoming Events</h2>
            <p className="text-xs text-gray-500">Where you can meet operators and other partners</p>
          </div>
          <a href="https://www.techontoast.community/events" target="_blank" rel="noopener noreferrer"
            className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            All events →
          </a>
        </div>
        {data.events.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-500">No events listed at the moment.</p>
            <a href="https://www.techontoast.community/events" target="_blank" rel="noopener noreferrer"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-2 inline-block">
              View all events on the website →
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.events.map((ev, i) => (
              <a key={i} href={ev.url} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-orange-300 hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">{ev.date}</p>
                    <h4 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors mt-0.5">{ev.title}</h4>
                    {ev.description && <p className="text-sm text-gray-500 mt-1">{ev.description}</p>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Podcast */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Podcast</h2>
            <p className="text-xs text-gray-500">{data.podcast.showTitle || 'Tech on Toast — The Hospitality Tech Podcast'}</p>
          </div>
          <a href={data.podcast.showLink || 'https://anchor.fm/techontoast'} target="_blank" rel="noopener noreferrer"
            className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            All episodes →
          </a>
        </div>

        {/* Show banner */}
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl p-5 sm:p-6 text-white mb-4 flex items-start gap-4">
          {data.podcast.showImage && (
            <img src={data.podcast.showImage} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex-shrink-0 object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider opacity-80">Latest from</p>
            <h3 className="text-lg sm:text-xl font-bold mt-0.5">{data.podcast.showTitle || 'Tech on Toast Podcast'}</h3>
            <p className="text-sm opacity-90 mt-1">{data.podcast.totalEpisodes} episodes · Hosted by Chris Fletcher</p>
          </div>
        </div>

        {/* Recent episodes */}
        {data.podcast.episodes.length > 0 && (
          <div className="space-y-3">
            {data.podcast.episodes.map((ep, i) => (
              <a key={i} href={ep.link} target="_blank" rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-gray-200 p-4 sm:p-5 hover:border-purple-300 hover:shadow-md transition-all group">
                <div className="flex items-start gap-4">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex-shrink-0">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-1">
                      <span>{relativeDate(ep.pubDate)}</span>
                      {ep.duration && <span>· {ep.duration}</span>}
                    </div>
                    <h4 className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors leading-snug">{ep.title}</h4>
                    {ep.description && (
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ep.description}</p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="text-xs text-gray-400 text-center mt-8">
        Tech on Toast Marketplace · Updated automatically · Same view for every partner
      </div>
    </div>
  );
}
