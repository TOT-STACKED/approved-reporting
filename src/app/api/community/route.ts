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
const DATE_FIELD = 'fldRND3uaiduLQouI';

const EVENTS_URL = 'https://www.techontoast.community/events';
const PODCAST_RSS = 'https://anchor.fm/s/dbfe4940/podcast/rss';

async function fetchAllLeads() {
  const all: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    [...Object.values(STAGE_FIELDS), DATE_FIELD].forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
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

// Scrape the events page on techontoast.community. Webflow CMS exposes each
// event in a `w-dyn-item` block with `event_date` and `heading-style-h5`.
async function fetchEvents(): Promise<{ title: string; date: string; url: string; description?: string }[]> {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TechOnToastPortal/1.0)' },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Try to grab each w-dyn-item that contains an event card.
    // Pattern: <div class="...w-dyn-item..."> ... <div class="event_date">DATE</div> ... <h2 class="heading-style-h5">TITLE</h2> ... <a href="LINK"
    const itemRegex = /<div[^>]*class="[^"]*w-dyn-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const events: { title: string; date: string; url: string; description?: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(html)) !== null) {
      const block = m[1];
      const dateMatch = block.match(/class="[^"]*event_date[^"]*"[^>]*>([\s\S]*?)<\//);
      const titleMatch = block.match(/<h2[^>]*class="[^"]*heading-style-h5[^"]*"[^>]*>([\s\S]*?)<\/h2>/);
      const linkMatch = block.match(/<a[^>]*href="([^"]+)"/);

      if (!titleMatch) continue;
      const title = stripHtml(titleMatch[1]);
      if (!title) continue;
      const rawDate = dateMatch ? stripHtml(dateMatch[1]) : '';
      const link = linkMatch ? linkMatch[1] : EVENTS_URL;
      const url = link.startsWith('http') ? link : `https://www.techontoast.community${link.startsWith('/') ? link : `/${link}`}`;
      events.push({ title, date: rawDate || 'TBD', url });
    }

    // Dedupe by title and cap at 8
    const seen = new Set<string>();
    const unique = events.filter(e => {
      if (seen.has(e.title)) return false;
      seen.add(e.title);
      return true;
    }).slice(0, 8);

    return unique;
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

    const items: { title: string; pubDate: string; duration: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      const duration = (block.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/) || [])[1] || '';
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
      const description = stripHtml((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '').slice(0, 200);
      if (title) items.push({ title, pubDate, duration, link, description });
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

    const last30Lead = rawLeads.filter(r => withinDays(r.fields?.[DATE_FIELD], 30)).length;
    const last90Lead = rawLeads.filter(r => withinDays(r.fields?.[DATE_FIELD], 90)).length;

    const monthly: Record<string, number> = {};
    for (const b of businesses) {
      const month = (b.created_at || '').slice(0, 7);
      if (!month) continue;
      monthly[month] = (monthly[month] || 0) + 1;
    }
    const reviewsByMonth = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({ month, count }));

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
