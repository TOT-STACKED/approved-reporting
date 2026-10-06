import { NextResponse } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { listTools } from '@/lib/renewals-db';
import { RENEWAL_CATEGORY_LABELS, monthlyCost, nextRenewal, noticeDeadline } from '@/lib/renewals-shared';

export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Stop spreadsheet apps treating a value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const tools = await listTools(viewer.org.id);
    const head = ['Tool', 'Supplier', 'Category', 'Sites', 'Cost', 'Per', 'Monthly equivalent', 'Contract start',
      'Term (months)', 'Next renewal', 'Notice (days)', 'Give notice by', 'Auto-renews', 'Status', 'Owner', 'Notes'];
    const rows = tools.map(t => [
      t.name, t.supplier, RENEWAL_CATEGORY_LABELS[t.category], t.sites, t.cost_amount, t.cost_period,
      monthlyCost(t).toFixed(2), t.contract_start, t.term_months, nextRenewal(t), t.notice_days,
      t.auto_renew ? noticeDeadline(t) : '', t.auto_renew ? 'yes' : 'no', t.status, t.owner, t.notes,
    ]);
    const csv = [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    const slug = viewer.org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'venue';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}-software.csv"`,
      },
    });
  } catch (err) {
    return failed('export', err);
  }
}
