import OpenAI from 'openai';
import { RENEWAL_CATEGORIES, isRenewalCategory } from './renewals-shared';

// Pull the renewal-critical facts out of a software contract PDF. The result
// is only ever a suggestion: the operator sees every field in the edit form
// and confirms before anything is saved. A misread notice period is the one
// mistake this product can't afford, so nothing extracted is trusted silently.
//
// Uses the OpenAI key the portal already has. API inputs aren't used for
// training by default.

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export function extractionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface Extracted {
  name: string | null;
  supplier: string | null;
  category: string | null;
  cost_amount: number | null;
  cost_period: 'month' | 'year' | 'one_off' | null;
  contract_start: string | null;
  term_months: number | null;
  renewal_date: string | null;
  notice_days: number | null;
  auto_renew: boolean | null;
  sites: string | null;
  notes: string | null;
}

const PROMPT = `You read UK hospitality software contracts and order forms and return the facts an operator needs to avoid an unwanted auto-renewal.

Return JSON with exactly these keys. Use null for anything the document does not state — never guess.
- name: the product or service name (e.g. "Lightspeed Restaurant", "Planday")
- supplier: the supplier's company name
- category: one of ${RENEWAL_CATEGORIES.join(', ')}
- cost_amount: the recurring cost as a number, excluding VAT, in GBP. If priced per site, multiply by the number of sites if stated.
- cost_period: "month", "year" or "one_off"
- contract_start: YYYY-MM-DD
- term_months: the initial or renewal term in months
- renewal_date: the date the contract next renews or ends, YYYY-MM-DD. Work it out from start date + term if not stated outright.
- notice_days: how many days' notice must be given to cancel before renewal. Convert months to days (1 month = 30 days, 3 months = 90).
- auto_renew: true if it renews automatically unless cancelled
- sites: which venues or how many sites it covers, as short text
- notes: one or two sentences on anything unusual — price rises on renewal, early-termination fees, minimum terms. No more.`;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[£,\s]/g, '')) : Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
}

function date(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export async function extractContract(pdf: Buffer, filename: string): Promise<Extracted> {
  const completion = await openai().chat.completions.create({
    model: process.env.RENEWALS_EXTRACT_MODEL || 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: { filename: filename || 'contract.pdf', file_data: `data:application/pdf;base64,${pdf.toString('base64')}` },
          },
          { type: 'text', text: 'Extract the contract details as JSON.' },
        ],
      },
    ],
  });

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch {
    raw = {};
  }

  const period = raw.cost_period;
  const notice = num(raw.notice_days);
  const term = num(raw.term_months);
  return {
    name: str(raw.name),
    supplier: str(raw.supplier),
    category: isRenewalCategory(raw.category) ? raw.category : null,
    cost_amount: num(raw.cost_amount),
    cost_period: period === 'month' || period === 'year' || period === 'one_off' ? period : null,
    contract_start: date(raw.contract_start),
    term_months: term && term > 0 && term <= 240 ? Math.round(term) : null,
    renewal_date: date(raw.renewal_date),
    notice_days: notice != null && notice >= 0 && notice <= 730 ? Math.round(notice) : null,
    auto_renew: typeof raw.auto_renew === 'boolean' ? raw.auto_renew : null,
    sites: str(raw.sites),
    notes: str(raw.notes, 600),
  };
}
