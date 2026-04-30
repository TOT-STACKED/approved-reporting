import { BetaAnalyticsDataClient } from '@google-analytics/data';

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const CLIENT_EMAIL = process.env.GA4_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n');

let client: BetaAnalyticsDataClient | null = null;

function getClient() {
  if (client) return client;
  if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error('GA4 env vars missing (GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)');
  }
  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    },
  });
  return client;
}

export interface PartnerPageStat {
  slug: string;
  path: string;
  views: number;
  users: number;
}

export interface DailyTraffic {
  date: string; // YYYY-MM-DD
  views: number;
  users: number;
}

export interface Ga4Summary {
  totalViews: number;
  totalUsers: number;
  marketplaceViews: number;
  marketplaceUsers: number;
  partners: PartnerPageStat[];
  daily: DailyTraffic[];
  rangeDays: number;
}

// Per-page-path views & users for partner pages, plus daily totals.
export async function getMarketplaceTraffic(rangeDays = 30): Promise<Ga4Summary> {
  const ga = getClient();
  const property = `properties/${PROPERTY_ID}`;
  const startDate = `${rangeDays}daysAgo`;
  const endDate = 'today';

  const [pagesRes, dailyRes, totalsRes] = await Promise.all([
    ga.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'BEGINS_WITH', value: '/partners/' },
        },
      },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 100,
    }),
    ga.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'BEGINS_WITH', value: '/partners/' },
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 200,
    }),
    ga.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    }),
  ]);

  const partners: PartnerPageStat[] = (pagesRes[0].rows || []).map(row => {
    const path = row.dimensionValues?.[0]?.value || '';
    const slug = path.replace(/^\/partners\//, '').replace(/\/$/, '').toLowerCase();
    return {
      slug,
      path,
      views: Number(row.metricValues?.[0]?.value || 0),
      users: Number(row.metricValues?.[1]?.value || 0),
    };
  });

  const marketplaceViews = partners.reduce((s, p) => s + p.views, 0);
  const marketplaceUsers = partners.reduce((s, p) => s + p.users, 0);

  const daily: DailyTraffic[] = (dailyRes[0].rows || []).map(row => {
    const raw = row.dimensionValues?.[0]?.value || ''; // YYYYMMDD
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      views: Number(row.metricValues?.[0]?.value || 0),
      users: Number(row.metricValues?.[1]?.value || 0),
    };
  });

  const totalViews = Number(totalsRes[0].totals?.[0]?.metricValues?.[0]?.value || totalsRes[0].rows?.[0]?.metricValues?.[0]?.value || 0);
  const totalUsers = Number(totalsRes[0].totals?.[0]?.metricValues?.[1]?.value || totalsRes[0].rows?.[0]?.metricValues?.[1]?.value || 0);

  return {
    totalViews,
    totalUsers,
    marketplaceViews,
    marketplaceUsers,
    partners,
    daily,
    rangeDays,
  };
}

// Single partner's stats by slug — used on partner pages.
export async function getPartnerTraffic(slug: string, rangeDays = 30) {
  const summary = await getMarketplaceTraffic(rangeDays);
  const match = summary.partners.find(p => p.slug === slug.toLowerCase()) || null;
  return {
    slug,
    rangeDays,
    views: match?.views || 0,
    users: match?.users || 0,
    path: match?.path || `/partners/${slug}`,
  };
}
