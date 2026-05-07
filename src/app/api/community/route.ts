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

const EVENTS_URL = 'https://www.techontoast.community/events';
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

// Fetch description from an event detail page (best-effort).
async function fetchEventDescription(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TechOnToastPortal/1.0)' },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return '';
    const html = await res.text();
    // Webflow rich-text blocks hold the event copy.
    const m = html.match(/class="[^"]*rich-text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!m) return '';
    const text = stripHtml(m[1]);
    return text.length > 350 ? text.slice(0, 347).trimEnd() + '…' : text;
  } catch {
    return '';
  }
}

// Scrape the events page on techontoast.community. Webflow CMS exposes each
// event in a `w-dyn-item` block with `event_date`, `heading-style-h5`, and an
// image and link.
async function fetchEvents(): Promise<{ title: string; date: string; url: string; description?: string; image?: string }[]> {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TechOnToastPortal/1.0)' },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const itemRegex = /<div[^>]*class="[^"]*w-dyn-item[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/div>\s*<\/div>/g;
    const events: { title: string; date: string; url: string; image?: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(html)) !== null) {
      const block = m[1];
      const titleMatch = block.match(/<h2[^>]*heading-style-h5[^>]*>([\s\S]*?)<\/h2>/);
      const dateMatch = block.match(/event_date[^>]*>[\s\S]*?<\/svg>([\s\S]*?)<\/div>/);
      const linkMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);

      if (!titleMatch) continue;
      const title = stripHtml(titleMatch[1]);
      if (!title) continue;
      const rawDate = dateMatch ? stripHtml(dateMatch[1]) : '';
      const link = linkMatch ? linkMatch[1] : EVENTS_URL;
      const url = link.startsWith('http') ? link : `https://www.techontoast.community${link.startsWith('/') ? link : `/${link}`}`;
      events.push({ title, date: rawDate || 'TBD', url, image: imgMatch ? imgMatch[1] : undefined });
    }

    // Dedupe by title — Webflow renders some cards twice
    const seen = new Set<string>();
    const unique = events.filter(e => {
      if (seen.has(e.title)) return false;
      seen.add(e.title);
      return true;
    }).slice(0, 6);

    // Enrich each with description from its detail page
    const withDesc = await Promise.all(
      unique.map(async ev => ({
        ...ev,
        description: await fetchEventDescription(ev.url),
      }))
    );

    return withDesc;
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
