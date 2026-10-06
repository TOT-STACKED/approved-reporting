import crypto from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { alertRecipients, alertsSent, allActiveTools, getOrg, recordAlerts } from '@/lib/renewals-db';
import { sendAlert, type AlertLine } from '@/lib/renewals-email';
import { ALERT_THRESHOLDS, deadlineFor, todayISO } from '@/lib/renewals-shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(given: string | null): boolean {
  const secret = process.env.DIGEST_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Daily notice-period alerts, called by netlify/functions/renewals-alerts.
//
// A tool is due an email when its notice deadline is within one of the
// thresholds (60, 30, 14, 7, 1 days) and that threshold hasn't been sent for
// this renewal. Only the tightest threshold fires, and every looser one is
// marked sent with it — so a contract added with 10 days to go gets one email,
// not four. One email per venue per day, listing everything due.
export async function GET(request: NextRequest) {
  if (!authorised(request.nextUrl.searchParams.get('secret'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  try {
    const today = todayISO();
    const candidates = await allActiveTools();
    const sent = await alertsSent(candidates.map(c => c.tool.id));

    const due = new Map<string, { lines: AlertLine[]; marks: { tool_id: string; threshold: number; renewal_date: string }[] }>();
    for (const { tool, orgId } of candidates) {
      const d = deadlineFor(tool, today);
      if (!d || d.days < 0) continue;
      const hits = ALERT_THRESHOLDS.filter(t => d.days <= t);
      if (!hits.length) continue;
      const tightest = Math.min(...hits);
      if (sent.has(`${tool.id}:${tightest}:${d.renewal}`)) continue;
      const entry = due.get(orgId) || { lines: [], marks: [] };
      entry.lines.push({ tool, deadline: d.date, renewal: d.renewal, days: d.days });
      for (const t of hits) entry.marks.push({ tool_id: tool.id, threshold: t, renewal_date: d.renewal });
      due.set(orgId, entry);
    }

    const recipients = await alertRecipients([...due.keys()]);
    let emails = 0;
    for (const [orgId, { lines, marks }] of due) {
      const to = (recipients.get(orgId) || []).map(m => m.email);
      if (!to.length) continue;
      const org = await getOrg(orgId);
      lines.sort((a, b) => a.days - b.days);
      const result = await sendAlert(to, org?.name || 'your venue', lines);
      if (result.sent) {
        await recordAlerts(marks);
        emails++;
      }
    }
    return NextResponse.json({ ok: true, venues: due.size, emails });
  } catch (err) {
    console.warn('[renewals] alerts run failed', err);
    return NextResponse.json({ error: 'alerts run failed' }, { status: 500 });
  }
}
