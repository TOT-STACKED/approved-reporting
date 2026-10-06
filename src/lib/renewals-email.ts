// Emails for Stacked Renewals: sign-in codes, team invites and notice-period
// alerts. All through Resend, like the partner digest.

import { BG, BORDER, INK, MUTED, PRIMARY, SURFACE } from './brand';
import { formatDate, formatGBP, type RenewalTool } from './renewals-shared';

const FROM = process.env.RENEWALS_FROM || process.env.LOGIN_FROM || process.env.DIGEST_FROM || 'Stacked <onboarding@resend.dev>';

export function renewalsBaseUrl(): string {
  return (process.env.RENEWALS_URL || 'https://renewals.wearestacked.io').replace(/\/$/, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function shell(body: string): string {
  const base = renewalsBaseUrl();
  return `<!doctype html>
<html><body style="margin:0;background:${BG};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:${MUTED};margin:0 0 24px;">Stacked · Renewals</p>
    ${body}
    <p style="font-size:12px;color:${MUTED};margin:32px 0 0;border-top:1px solid ${BORDER};padding-top:16px;">
      <a href="${base}" style="color:${INK};text-decoration:none;">${esc(base.replace(/^https?:\/\//, ''))}</a>
      · Your data is private to your team. Stacked never shares it with suppliers.
    </p>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:600;">${esc(label)}</a>`;
}

async function send(to: string[], subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: 'email not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.warn('[renewals-email] resend rejected', res.status, await res.text().catch(() => ''));
      return { sent: false, error: `email provider returned ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn('[renewals-email] send threw', err);
    return { sent: false, error: 'could not reach the email provider' };
  }
}

export function sendRenewalsCode(to: string, code: string, name: string) {
  return send([to], `${code} is your Stacked Renewals code`, shell(`
    <p style="font-size:16px;margin:0 0 8px;">${name ? `Hi ${esc(name)},` : 'Hi,'}</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">Here is your sign-in code.</p>
    <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:18px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="font-size:38px;font-weight:700;letter-spacing:.18em;margin:0;font-variant-numeric:tabular-nums;">${code}</p>
    </div>
    <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0;">It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
  `));
}

export function sendInvite(to: string, inviter: string, orgName: string) {
  return send([to], `${inviter || 'A colleague'} added you to ${orgName} on Stacked Renewals`, shell(`
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">${esc(inviter || 'A colleague')} has added you to <strong>${esc(orgName)}</strong> on Stacked Renewals, where your team tracks its software, costs and contract notice periods.</p>
    <p style="margin:0 0 24px;">${button(`${renewalsBaseUrl()}/renewals/signin`, 'Sign in')}</p>
    <p style="font-size:14px;color:${MUTED};margin:0;">Sign in with this email address. We'll send you a code, so there's no password.</p>
  `));
}

export interface AlertLine {
  tool: RenewalTool;
  deadline: string;
  renewal: string;
  days: number;
}

export function sendAlert(to: string[], orgName: string, lines: AlertLine[]) {
  const soonest = Math.min(...lines.map(l => l.days));
  const subject = lines.length === 1
    ? `${lines[0].tool.name}: ${soonest <= 1 ? 'notice period closes tomorrow' : `${soonest} days left to give notice`}`
    : `${lines.length} contracts need a decision — first notice deadline in ${soonest} day${soonest === 1 ? '' : 's'}`;

  const rows = lines.map(l => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
        <strong>${esc(l.tool.name)}</strong>${l.tool.supplier ? `<br><span style="color:${MUTED};font-size:13px;">${esc(l.tool.supplier)}</span>` : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid ${BORDER};text-align:right;font-size:14px;">
        Give notice by <strong>${formatDate(l.deadline)}</strong><br>
        <span style="color:${MUTED};font-size:13px;">Renews ${formatDate(l.renewal)}${l.tool.cost_amount != null && l.tool.cost_period !== 'one_off' ? ` · ${formatGBP(l.tool.cost_amount)}/${l.tool.cost_period === 'year' ? 'yr' : 'mo'}` : ''}</span>
      </td>
    </tr>`).join('');

  return send(to, subject, shell(`
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">These contracts at <strong>${esc(orgName)}</strong> renew automatically unless you give notice. If you want to cancel, switch or renegotiate, now is the time.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${rows}</table>
    <p style="margin:0 0 16px;">${button(`${renewalsBaseUrl()}/renewals`, 'Review in Stacked Renewals')}</p>
    <p style="font-size:13px;color:${MUTED};margin:0;">Keeping it? Nothing to do. We'll remind you again before next year's deadline. Turn these emails off on the Team page.</p>
  `));
}
