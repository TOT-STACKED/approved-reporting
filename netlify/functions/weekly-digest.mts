// Netlify Scheduled Function — fires every Monday at 08:00 UTC.
// 08:00 UTC lands at 09:00 UK during BST (≈ late March → late October)
// and 08:00 UK during GMT. Switch to `0 9 * * 1` for a strict 9:00 UK
// year-round (but that pushes it to 10:00 during BST).
//
// All this function does is POST to the portal's /api/digest route with
// the shared DIGEST_SECRET — keeps all the data fetching + HTML +
// Resend calls in one place (the Next.js app) rather than duplicating
// them here.

import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.DIGEST_SECRET;
  if (!secret) {
    console.error('[weekly-digest] DIGEST_SECRET not set — skipping');
    return new Response('DIGEST_SECRET missing', { status: 500 });
  }

  // URL resolution: Netlify injects URL env var at runtime.
  const base = process.env.URL || process.env.DEPLOY_URL || 'https://approvedreporting.netlify.app';
  const target = `${base}/api/digest?secret=${encodeURIComponent(secret)}`;

  const res = await fetch(target, { method: 'GET' });
  const text = await res.text().catch(() => '');

  if (!res.ok) {
    console.error(`[weekly-digest] /api/digest responded ${res.status}: ${text.slice(0, 500)}`);
    return new Response(text || `HTTP ${res.status}`, { status: res.status });
  }
  console.log('[weekly-digest] sent', text.slice(0, 200));
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  schedule: '0 8 * * 1', // Mondays, 08:00 UTC (≈ 09:00 UK during BST)
};
