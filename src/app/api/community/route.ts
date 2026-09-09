import { NextResponse } from 'next/server';
import { getStackCollectStats, getBusinessSubmissions } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 minutes

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const LEADS_TABLE = 'tblUkL8xKL4ZNUFKV';

const STAGE_FIELDS = {
  MAL:           'fldeqDBBIEBrTCUz7',
  MQL:           'fldwsJvK2OXEMnqZv',
  SQL:           'fldX3oJVfCPqBaB2E',
  'Closed Won':  'fldvWQ5uF7AovgfFo',
  'Closed Lost': 'fld0D3InAxjneoAYe',
} as const;
const DATE_FIELD = 'fldRND3uaiduLQouI';        // user-entered "Date" (often blank)
const CREATED_FIELD = 'fld6NrBqMViSsFSRd';     // Airtable createdTime — reliable "when lead entered system"

const EVENTS_URL = 'https://www.wearestacked.io/events';
const PODCAST_RSS = 'https://anchor.fm/s/dbfe4940/podcast/rss';

async function fetchAllLeads() {
  const all: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    [...Object.values(STAGE_FIELDS), DATE_FIELD, CREATED_FIELD].forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 60 },
    });
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

function withinDays(iso: string, days: number) {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (isNaN(ts)) return false;
  return Date.now() - ts <= days * 86400000;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}

// Events come from the Events table in the Stacked website base — the same
// base the Package/tier lookup and the SOS sync already use, so no new
// credentials. This replaced a scraper that parsed the old Webflow events
// page: wearestacked.io is Framer and renders its listing client-side, so
// there is no server HTML to read. Airtable is where the events are authored
// anyway, which makes this the source rather than a copy of it.
const EVENTS_BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID;
const EVENTS_KEY = process.env.MARKETPLACE_AIRTABLE_KEY;
const EVENTS_TABLE = 'tblh9srfzwN78P6sF';
const EVENT_FIELDS = {
  name: 'fldLuB56dK3eSvUjv',
  start: 'fldT3VL4ZM5fy6DvN',
  location: 'fldKmaNUMgGmk6aVD',
  summary: 'fldAada4mI1sDCI5W',
  ticketLink: 'fldRaDOIJzqWEkIjN',
  thumbnail: 'fldsCt5ego3estaiw',
} as const;

async function fetchEvents(): Promise<
  { title: string; date: string; url: string; description?: string; image?: string }[]
> {
  if (!EVENTS_BASE || !EVENTS_KEY) return [];
  try {
    const url = new URL(`https://api.airtable.com/v0/${EVENTS_BASE}/${EVENTS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '50');
    for (const f of Object.values(EVENT_FIELDS)) url.searchParams.append('fields[]', f);
    url.searchParams.set('sort[0][field]', EVENT_FIELDS.start);
    url.searchParams.set('sort[0][direction]', 'asc');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${EVENTS_KEY}` },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as { records?: { fields?: Record<string, unknown> }[] };
    const now = Date.now();

    return (json.records || [])
      .map(r => {
        const f = r.fields || {};
        const title = String(f[EVENT_FIELDS.name] || '').trim();
        const start = String(f[EVENT_FIELDS.start] || '');
        const location = String(f[EVENT_FIELDS.location] || '').trim();
        const summary = String(f[EVENT_FIELDS.summary] || '').trim();
        const attachments = f[EVENT_FIELDS.thumbnail] as { url?: string }[] | undefined;
        return {
          title,
          start,
          // The Framer site has no per-event page, so the ticket link is the
          // useful destination. Falls back to the events listing.
          url: String(f[EVENT_FIELDS.ticketLink] || '') || EVENTS_URL,
          date: start
            ? new Date(start).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })
            : 'TBD',
          description: [location, summary].filter(Boolean).join(' · ').slice(0, 350),
          image: attachments?.[0]?.url,
        };
      })
      // Upcoming only, soonest first — a listing of last year's events is
      // worse than an empty one.
      .filter(e => e.title && e.start && new Date(e.start).getTime() >= now)
      .slice(0, 6)
      .map(({ title, date, url, description, image }) => ({ title, date, url, description, image }));
  } catch {
    return [];
  }
}

// Parse podcast RSS to extract latest episodes.
async function fetchPodcastEpisodes(): Promise<{
  showTitle: string;
  showLink: string;
  showImage: string;
  episodes: { title: string; pubDate: string; duration: string; link: string; description: string }[];
  totalEpisodes: number;
}> {
  try {
    const res = await fetch(PODCAST_RSS, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return { showTitle: '', showLink: '', showImage: '', episodes: [], totalEpisodes: 0 };
    const xml = await res.text();

    const showTitle = stripHtml((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const showLink = stripHtml((xml.match(/<channel>[\s\S]*?<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const showImage = (xml.match(/<itunes:image[^>]*href="([^"]+)"/) || [])[1] || '';

    const items: { title: string; pubDate: string; duration: string; link: string; description: string; audioUrl: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      const duration = (block.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/) || [])[1] || '';
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
      const description = stripHtml((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '').slice(0, 200);
      const audioUrl = (block.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || '';
      if (title) items.push({ title, pubDate, duration, link, description, audioUrl });
    }

    return {
      showTitle,
      showLink,
      showImage,
      episodes: items.slice(0, 5),
      totalEpisodes: items.length,
    };
  } catch {
    return { showTitle: '', showLink: '', showImage: '', episodes: [], totalEpisodes: 0 };
  }
}

export async function GET() {
  try {
    const [rawLeads, stackStats, businesses, events, podcast] = await Promise.all([
      fetchAllLeads(),
      getStackCollectStats(),
      getBusinessSubmissions(),
      fetchEvents(),
      fetchPodcastEpisodes(),
    ]);

    const malTotal = rawLeads.filter(r => Array.isArray(r.fields?.[STAGE_FIELDS.MAL]) && r.fields[STAGE_FIELDS.MAL].length > 0).length;
    const mqlTotal = rawLeads.filter(r => Array.isArray(r.fields?.[STAGE_FIELDS.MQL]) && r.fields[STAGE_FIELDS.MQL].length > 0).length;
    const sqlTotal = rawLeads.filter(r => Array.isArray(r.fields?.[STAGE_FIELDS.SQL]) && r.fields[STAGE_FIELDS.SQL].length > 0).length;
    const wonTotal = rawLeads.filter(r => Array.isArray(r.fields?.[STAGE_FIELDS['Closed Won']]) && r.fields[STAGE_FIELDS['Closed Won']].length > 0).length;

    // Prefer the createdTime field (every record has it); fall back to the
    // user-entered Date field if for some reason it's missing.
    const leadDate = (r: any) => r.fields?.[CREATED_FIELD] || r.fields?.[DATE_FIELD] || r.createdTime || '';
    const last30Lead = rawLeads.filter(r => withinDays(leadDate(r), 30)).length;
    const last90Lead = rawLeads.filter(r => withinDays(leadDate(r), 90)).length;

    const monthly: Record<string, number> = {};
    for (const b of businesses) {
      const month = (b.created_at || '').slice(0, 7);
      if (!month) continue;
      monthly[month] = (monthly[month] || 0) + 1;
    }

    // Smooth the February import spike: take its volume, redistribute evenly
    // across the 6 months we're displaying so the chart reflects a realistic
    // ongoing cadence rather than a one-time data dump.
    const lastSix = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({ month, count }));

    const febIndex = lastSix.findIndex(r => r.month.endsWith('-02'));
    if (febIndex !== -1 && lastSix.length > 0) {
      const febCount = lastSix[febIndex].count;
      const perMonth = Math.round(febCount / lastSix.length);
      lastSix.forEach((r, i) => {
        // Replace Feb's count with the spread amount; bump every other month too
        r.count = i === febIndex ? perMonth : r.count + perMonth;
      });
    }
    const reviewsByMonth = lastSix;

    const topCategories = Object.entries(stackStats.categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }));

    return NextResponse.json({
      leadGen: {
        totalLeads: rawLeads.length,
        malTotal, mqlTotal, sqlTotal, wonTotal,
        last30Days: last30Lead,
        last90Days: last90Lead,
      },
      stackReviews: {
        totalReviews: stackStats.totalReviews,
        totalToolEntries: stackStats.totalToolEntries,
        reviewsByMonth,
        topTools: stackStats.topTools.slice(0, 10).map(t => ({
          name: t.name.charAt(0).toUpperCase() + t.name.slice(1),
          count: t.count,
        })),
        topCategories,
      },
      events,
      podcast,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
