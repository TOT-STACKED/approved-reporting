// Netlify Scheduled Function — nightly SOS → Airtable marketplace sync.
// Mirrors weekly-digest.mts: all logic lives in the Next.js /api/sos-sync
// route; this just pings it with the shared secret on a schedule.

import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.SOS_SYNC_SECRET;
  if (!secret) {
    console.error('[sos-sync] SOS_SYNC_SECRET not set — skipping');
    return new Response('SOS_SYNC_SECRET missing', { status: 500 });
  }
  const base = process.env.URL || process.env.DEPLOY_URL || 'https://approvedreporting.netlify.app';
  const target = `${base}/api/sos-sync?secret=${encodeURIComponent(secret)}`;

  const res = await fetch(target, { method: 'GET' });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`[sos-sync] /api/sos-sync responded ${res.status}: ${text.slice(0, 500)}`);
    return new Response(text || `HTTP ${res.status}`, { status: res.status });
  }
  console.log('[sos-sync] ok', text.slice(0, 300));
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  // Every hour on the half — up from twice-daily (05:30 / 12:30 UTC) after
  // the Aug 14–25 2026 outage where Netlify's scheduled function silently
  // stopped firing for 11 days. Hourly means: (a) a fresh review reaches the
  // marketplace tile within the hour instead of by tomorrow morning, and
  // (b) a run of missed invocations converges in single-digit hours the moment
  // the scheduler wakes up again. Cost is negligible — the sync is a single
  // Supabase read + a batched Airtable PATCH, ~1s round-trip.
  schedule: '30 * * * *',
};
