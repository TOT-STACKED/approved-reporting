// Netlify Scheduled Function — nightly Tech Usage → Airtable marketplace sync.
// Mirrors sos-sync.mts: all logic lives in the Next.js /api/tech-usage-sync
// route; this just pings it with the shared secret on a schedule.

import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.SOS_SYNC_SECRET;
  if (!secret) {
    console.error('[tech-usage-sync] SOS_SYNC_SECRET not set — skipping');
    return new Response('SOS_SYNC_SECRET missing', { status: 500 });
  }
  const base = process.env.URL || process.env.DEPLOY_URL || 'https://approvedreporting.netlify.app';
  const target = `${base}/api/tech-usage-sync?secret=${encodeURIComponent(secret)}`;

  const res = await fetch(target, { method: 'GET' });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`[tech-usage-sync] /api/tech-usage-sync responded ${res.status}: ${text.slice(0, 500)}`);
    return new Response(text || `HTTP ${res.status}`, { status: res.status });
  }
  console.log('[tech-usage-sync] ok', text.slice(0, 300));
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  // Every hour at :35 (5 min after sos-sync so they don't collide on the
  // Airtable rate limit). Up from twice-daily after the Aug 14–25 2026 outage
  // where Netlify's scheduler went dark for 11 days and nobody noticed until
  // it was flagged manually. Hourly = a fresh Health Check submission's
  // venue + tools land in Airtable within the hour, and any missed
  // invocations self-heal fast the moment scheduling recovers. The route's
  // 14-day delta window still guards against a longer outage.
  schedule: '35 * * * *',
};
