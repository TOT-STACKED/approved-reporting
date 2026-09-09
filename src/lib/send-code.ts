// Delivery for sign-in codes. Email today via Resend, which the weekly digest
// already sends through. SMS is stubbed deliberately: the Partner Users table
// captures a mobile at setup, so when a provider is added the only change is
// filling in sendCodeBySms — nothing above it has to move.

import { BG, BORDER, INK, MUTED, PRIMARY, SURFACE } from './brand';

const FROM = process.env.LOGIN_FROM || process.env.DIGEST_FROM || 'Stacked <onboarding@resend.dev>';

function codeEmailHtml(code: string, name: string): string {
  const hello = name ? `Hi ${name},` : 'Hi,';
  return `<!doctype html>
<html><body style="margin:0;background:${BG};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:${MUTED};margin:0 0 24px;">Stacked · Partner Intelligence</p>
    <p style="font-size:16px;margin:0 0 8px;">${hello}</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">Here is your sign-in code.</p>
    <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:18px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="font-size:38px;font-weight:700;letter-spacing:.18em;margin:0;font-variant-numeric:tabular-nums;">${code}</p>
    </div>
    <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 8px;">It expires in 10 minutes and can only be used once.</p>
    <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 32px;">If you didn't ask to sign in, you can ignore this — nobody can get in without the code.</p>
    <p style="font-size:12px;color:${MUTED};margin:0;border-top:1px solid ${BORDER};padding-top:16px;">
      <a href="https://partners.wearestacked.io" style="color:${PRIMARY};text-decoration:none;">partners.wearestacked.io</a>
    </p>
  </div>
</body></html>`;
}

export async function sendCodeByEmail(
  to: string,
  code: string,
  name = ''
): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[send-code] RESEND_API_KEY not set');
    return { sent: false, error: 'email not configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${code} is your Stacked sign-in code`,
        html: codeEmailHtml(code, name),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.warn('[send-code] resend rejected', res.status, detail);
      return { sent: false, error: `email provider returned ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn('[send-code] send threw', err);
    return { sent: false, error: 'could not reach the email provider' };
  }
}

/** Not wired up yet — see the note at the top of this file. */
export async function sendCodeBySms(): Promise<{ sent: boolean; error?: string }> {
  return { sent: false, error: 'SMS codes are not switched on yet' };
}
