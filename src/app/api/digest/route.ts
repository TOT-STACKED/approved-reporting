// Weekly digest email for the TOT team.
// Triggered by a Netlify Scheduled Function (see netlify/functions/weekly-digest.mts)
// every Monday at 08:00 UTC — which is 09:00 UK during BST (roughly end-of-March
// through end-of-October) and 08:00 UK during GMT.
//
// Env vars:
//   RESEND_API_KEY       — required; Resend API key
//   DIGEST_RECIPIENTS    — comma-separated list of "to" emails (required)
//   DIGEST_SECRET        — required; shared secret between the scheduled fn and this route
//   DIGEST_FROM          — optional; "Name <addr@domain>" sender.
//                          Defaults to Resend's onboarding sender, which works out
//                          of the box. Swap for a verified domain later.
//
// Manual test: GET /api/digest?secret=<DIGEST_SECRET>
//              (add &preview=1 to render the HTML without actually sending — useful
//               for eyeballing before Monday)

import { NextResponse } from 'next/server';
import { getMarketingActivities, getPartnerList } from '@/lib/airtable';
import { scoreLead } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const LEADS_TABLE = 'tblUkL8xKL4ZNUFKV';
const LEAD_FIELDS = {
  businessName:    'fldaIprcZqrPGRxen',
  partnerReferral: 'fldwsJvK2OXEMnqZv',
  leadStatus:      'fldf4TNAglyB9s2gP',
  leadOwner:       'fldVDhPPUQuW4OTJY',
  stage:           'fldbNGUCnii13HcIm',
  lastModified:    'fldAqG8dAXFX3bdFd',
  source:          'fldMgrGbR7iFwSxij',
  location:        'fldTwzHji3JbrvHPU',
  size:            'fldwUdKgqSG6E2JZ1',
};

interface DigestLead {
  id: string;
  businessName: string;
  partners: string[];
  status: string;
  source: string;
  owner: string;
  stage: string;
  lastModified: string;
  size: string;
  location: string;
  score: number;
  priority: 'hot' | 'high' | 'normal' | 'cold';
}

function extractVal(field: unknown): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && 'name' in field) {
    return String((field as { name: unknown }).name);
  }
  return String(field);
}
function extractMulti(field: unknown): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) return [extractVal(field)];
  return (field as unknown[])
    .map(f => typeof f === 'string' ? f : (f && typeof f === 'object' && 'name' in f ? String((f as { name: unknown }).name) : ''))
    .filter(Boolean);
}

async function fetchAllLeads(): Promise<DigestLead[]> {
  const all: DigestLead[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    Object.values(LEAD_FIELDS).forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    });
    const data = await res.json();
    for (const r of (data.records || [])) {
      const fields = r.fields || {};
      const base = {
        id: r.id,
        businessName: fields[LEAD_FIELDS.businessName] || '',
        partners: extractMulti(fields[LEAD_FIELDS.partnerReferral]),
        status: extractVal(fields[LEAD_FIELDS.leadStatus]),
        source: extractVal(fields[LEAD_FIELDS.source]),
        owner: extractVal(fields[LEAD_FIELDS.leadOwner]),
        stage: extractVal(fields[LEAD_FIELDS.stage]),
        lastModified: fields[LEAD_FIELDS.lastModified] || '',
        size: fields[LEAD_FIELDS.size] || '',
        location: fields[LEAD_FIELDS.location] || '',
      };
      const { score, priority } = scoreLead(base);
      all.push({ ...base, score, priority });
    }
    offset = data.offset;
  } while (offset);
  return all;
}

// ---- Digest composition ----

const ONE_DAY = 24 * 60 * 60 * 1000;

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * ONE_DAY);
}

interface DigestData {
  weekStart: Date;
  weekEnd: Date;
  totalLeads: number;
  newThisWeek: DigestLead[];
  touchedThisWeek: DigestLead[];
  hotLeads: DigestLead[];
  statusCounts: Array<{ status: string; count: number }>;
  partnersActive: Array<{ name: string; slug: string; activities: number; newLeads: number }>;
  partnersQuiet: Array<{ name: string; slug: string; daysSinceLastLead: number | null }>;
}

async function buildDigestData(): Promise<DigestData> {
  const [leads, activities, partners] = await Promise.all([
    fetchAllLeads(),
    getMarketingActivities(),
    getPartnerList(),
  ]);

  const weekEnd = new Date();
  const weekStart = daysAgo(7);

  const inLastWeek = (iso: string) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t >= weekStart.getTime();
  };

  // "New this week" — we don't have a creation timestamp separate from
  // lastModified, so treat a lead as "new-ish" if it's been touched in the
  // last 7 days and is currently in an early-stage status (MAL/MQL/Lead).
  const earlyStatuses = new Set(['mal', 'mql', 'lead', '']);
  const touchedThisWeek = leads.filter(l => inLastWeek(l.lastModified));
  const newThisWeek = touchedThisWeek.filter(l => earlyStatuses.has(l.status.trim().toLowerCase()));

  const hotLeads = [...leads]
    .filter(l => l.priority === 'hot')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const statusAgg: Record<string, number> = {};
  for (const l of leads) {
    const s = (l.status || 'Unclassified').trim();
    statusAgg[s] = (statusAgg[s] || 0) + 1;
  }
  const statusCounts = Object.entries(statusAgg)
    .filter(([s]) => s.toLowerCase() !== 'closed lost' && s.toLowerCase() !== 'lost')
    .sort(([, a], [, b]) => b - a)
    .map(([status, count]) => ({ status, count }));

  // Partner activity — how many marketing activities posted this week + new leads.
  const partnerActivity = new Map<string, { activities: number; newLeads: number }>();
  for (const a of activities) {
    if (!inLastWeek(a.date)) continue;
    const names = a.partnersFeatured.split(/[,;/]/).map(s => s.trim()).filter(Boolean);
    for (const n of names) {
      const key = n.toLowerCase();
      const prev = partnerActivity.get(key) || { activities: 0, newLeads: 0 };
      partnerActivity.set(key, { activities: prev.activities + 1, newLeads: prev.newLeads });
    }
  }
  for (const l of newThisWeek) {
    for (const p of l.partners) {
      const key = p.trim().toLowerCase();
      const prev = partnerActivity.get(key) || { activities: 0, newLeads: 0 };
      partnerActivity.set(key, { activities: prev.activities, newLeads: prev.newLeads + 1 });
    }
  }

  const partnersByKey = new Map(partners.map(p => [p.name.trim().toLowerCase(), p]));
  const partnersActive = Array.from(partnerActivity.entries())
    .map(([key, v]) => {
      const p = partnersByKey.get(key);
      return {
        name: p?.name ?? key,
        slug: p?.slug ?? key.replace(/[^a-z0-9]+/g, '-'),
        activities: v.activities,
        newLeads: v.newLeads,
      };
    })
    .sort((a, b) => (b.activities + b.newLeads) - (a.activities + a.newLeads))
    .slice(0, 10);

  // Quiet partners — in the roster but nothing happened for 14+ days.
  const lastTouchByPartner = new Map<string, number>();
  for (const l of leads) {
    const ts = Date.parse(l.lastModified);
    if (Number.isNaN(ts)) continue;
    for (const p of l.partners) {
      const key = p.trim().toLowerCase();
      const prev = lastTouchByPartner.get(key) ?? 0;
      if (ts > prev) lastTouchByPartner.set(key, ts);
    }
  }
  const partnersQuiet = partners
    .map(p => {
      const ts = lastTouchByPartner.get(p.name.trim().toLowerCase());
      const daysSinceLastLead = ts ? Math.floor((Date.now() - ts) / ONE_DAY) : null;
      return { name: p.name, slug: p.slug, daysSinceLastLead };
    })
    .filter(p => p.daysSinceLastLead == null || p.daysSinceLastLead >= 14)
    .sort((a, b) => (b.daysSinceLastLead ?? 999) - (a.daysSinceLastLead ?? 999))
    .slice(0, 10);

  return {
    weekStart, weekEnd,
    totalLeads: leads.length,
    newThisWeek,
    touchedThisWeek,
    hotLeads,
    statusCounts,
    partnersActive,
    partnersQuiet,
  };
}

// ---- HTML rendering ----

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderDigestHtml(d: DigestData, siteUrl: string): string {
  const priorityBadge = (p: DigestLead['priority']) => {
    const tone = p === 'hot'    ? 'background:#fee2e2;color:#b91c1c;'
               : p === 'high'   ? 'background:#fef3c7;color:#b45309;'
               : p === 'normal' ? 'background:#f3f4f6;color:#4b5563;'
               :                  'background:#f9fafb;color:#9ca3af;';
    const label = p === 'hot' ? '🔥 Hot' : p === 'high' ? '⭐ High' : p.charAt(0).toUpperCase() + p.slice(1);
    return `<span style="display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;${tone}">${label}</span>`;
  };

  const weekLabel = `${d.weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${d.weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const hotRows = d.hotLeads.length ? d.hotLeads.map(l => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${priorityBadge(l.priority)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827;">
        <a href="${siteUrl}/leads" style="color:#111827;text-decoration:none;">${escapeHtml(l.businessName || '—')}</a>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#4b5563;font-size:13px;">${escapeHtml(l.status)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${escapeHtml(l.partners.join(', '))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:right;">${l.score}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="padding:12px;color:#9ca3af;font-size:13px;">No hot leads right now — keep pushing 👊</td></tr>`;

  const pipelineRows = d.statusCounts.slice(0, 8).map(s => `
    <tr>
      <td style="padding:6px 10px;color:#374151;font-size:13px;">${escapeHtml(s.status)}</td>
      <td style="padding:6px 10px;color:#111827;font-weight:600;text-align:right;">${s.count}</td>
    </tr>`).join('');

  const activeRows = d.partnersActive.length ? d.partnersActive.map(p => `
    <tr>
      <td style="padding:6px 10px;color:#111827;font-weight:500;">${escapeHtml(p.name)}</td>
      <td style="padding:6px 10px;color:#4b5563;font-size:13px;text-align:right;">${p.activities} activit${p.activities === 1 ? 'y' : 'ies'}</td>
      <td style="padding:6px 10px;color:#4b5563;font-size:13px;text-align:right;">${p.newLeads} new lead${p.newLeads === 1 ? '' : 's'}</td>
    </tr>`).join('') : `<tr><td colspan="3" style="padding:12px;color:#9ca3af;font-size:13px;">No partner activity logged this week.</td></tr>`;

  const quietRows = d.partnersQuiet.length ? d.partnersQuiet.map(p => `
    <tr>
      <td style="padding:6px 10px;color:#111827;font-size:13px;">${escapeHtml(p.name)}</td>
      <td style="padding:6px 10px;color:#b91c1c;font-size:13px;text-align:right;">${p.daysSinceLastLead == null ? 'never' : `${p.daysSinceLastLead}d quiet`}</td>
    </tr>`).join('') : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:28px;height:28px;background:#f97316;border-radius:6px;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">ToT</div>
        <span style="font-weight:600;color:#111827;font-size:15px;">Tech on Toast · Weekly Digest</span>
      </div>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;">Week of ${weekLabel}</h1>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
        ${d.touchedThisWeek.length} leads touched · ${d.newThisWeek.length} new · ${d.hotLeads.length} hot ·
        <a href="${siteUrl}" style="color:#f97316;text-decoration:none;">open dashboard →</a>
      </p>

      <!-- Top hot leads -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">🔥 Top leads to action</h2>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Priority</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Business</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Status</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Partners</th>
              <th style="text-align:right;padding:6px 10px;font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Score</th>
            </tr>
          </thead>
          <tbody>${hotRows}</tbody>
        </table>
      </div>

      <!-- Pipeline snapshot + partner activity side-by-side on wide, stacked on mobile -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:260px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Pipeline snapshot</h2>
          <table style="width:100%;border-collapse:collapse;">${pipelineRows}</table>
        </div>
        <div style="flex:1;min-width:260px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Most active partners this week</h2>
          <table style="width:100%;border-collapse:collapse;">${activeRows}</table>
        </div>
      </div>

      ${d.partnersQuiet.length ? `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">😴 Partners gone quiet (14+ days)</h2>
        <table style="width:100%;border-collapse:collapse;">${quietRows}</table>
      </div>` : ''}

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:24px 0 0;">
        Automated by the Tech on Toast portal · <a href="${siteUrl}" style="color:#9ca3af;">approvedreporting.netlify.app</a>
      </p>
    </div>
  </body>
</html>`;
}

// ---- Route handler ----

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const preview = searchParams.get('preview') === '1';
  const expected = process.env.DIGEST_SECRET;

  if (!expected) {
    return NextResponse.json({ error: 'DIGEST_SECRET env var not set on the portal' }, { status: 500 });
  }
  if (secret !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  // Default recipients = the TOT core team. Override via DIGEST_RECIPIENTS env
  // var (comma-separated) to add/remove without a deploy.
  const DEFAULT_RECIPIENTS = [
    'chriscartmell@techontoast.community',
    'caz@techontoast.community',
    'gracie@techontoast.community',
    'chris@techontoast.community',
    'sara@techontoast.community',
  ].join(',');
  const recipients = (process.env.DIGEST_RECIPIENTS ?? DEFAULT_RECIPIENTS)
    .split(',').map(s => s.trim()).filter(Boolean);
  const from = process.env.DIGEST_FROM ?? 'Tech on Toast <onboarding@resend.dev>';

  try {
    const data = await buildDigestData();
    const siteUrl = new URL(request.url).origin;
    const html = renderDigestHtml(data, siteUrl);
    const subject = `TOT Digest · ${data.weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${data.weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${data.hotLeads.length} hot · ${data.newThisWeek.length} new`;

    if (preview) {
      // Return the HTML directly so the user can eyeball it in-browser.
      return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return NextResponse.json({ error: `Resend ${res.status}: ${err}` }, { status: 502 });
    }
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: true,
      id: payload?.id,
      recipients,
      subject,
      stats: {
        totalLeads: data.totalLeads,
        newThisWeek: data.newThisWeek.length,
        touchedThisWeek: data.touchedThisWeek.length,
        hotLeads: data.hotLeads.length,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
