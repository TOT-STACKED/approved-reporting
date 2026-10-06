// Netlify Scheduled Function — daily at 07:00 UTC (08:00 UK in summer).
// Calls the portal's /api/renewals/alerts with the shared DIGEST_SECRET; all
// the logic and the Resend calls live in the Next.js app.

import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.DIGEST_SECRET;
  if (!secret) {
    console.error('[renewals-alerts] DIGEST_SECRET not set, skipping');
    return new Response('DIGEST_SECRET missing', { status: 500 });
  }
  const base = process.env.URL || process.env.DEPLOY_URL || 'https://partners.wearestacked.io';
  const res = await fetch(`${base}/api/renewals/alerts?secret=${encodeURIComponent(secret)}`);
  const text = await res.text().catch(() => '');
  if (!res.ok) console.error(`[renewals-alerts] ${res.status}: ${text.slice(0, 500)}`);
  else console.log(`[renewals-alerts] ${text}`);
  return new Response(text, { status: res.status });
};

export const config: Config = {
  schedule: '0 7 * * *',
};
