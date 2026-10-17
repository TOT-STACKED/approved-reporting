import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { listVisits } from '@/lib/field-db';
import { FIELD_CATEGORIES, type FieldStackEntry } from '@/lib/field-shared';

export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function stackCell(e: FieldStackEntry | undefined): string {
  if (!e) return '';
  if (e.none) return 'None seen';
  return [...(e.tools || []), e.other].filter(Boolean).join('; ');
}

// Managers only: every visit as a CSV, one column per tech category.
export async function GET(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;

  const p = request.nextUrl.searchParams;
  const visits = await listVisits({
    agentId: p.get('agent') || undefined,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
    limit: 20000,
  });

  const head = [
    'Visited', 'Agent', 'Venue', 'Address', 'Postcode', 'Lat', 'Lng', 'Venue type', 'Covers', 'Ownership', 'Group',
    'Busyness', ...FIELD_CATEGORIES.map(c => c.label), 'Notes', 'Contact', 'Contact role', 'Contact email',
    'Contact phone', 'Demo interest', 'Photos', 'GPS accuracy (m)', 'Visit id',
  ];
  const rows = visits.map(v => [
    v.visited_at, v.agent_name, v.venue_name, v.address, v.postcode, v.lat, v.lng, v.venue_type, v.covers,
    v.ownership, v.group_name, v.busyness, ...FIELD_CATEGORIES.map(c => stackCell(v.stack[c.id])), v.notes,
    v.contact_name, v.contact_role, v.contact_email, v.contact_phone, v.demo_interest, v.photos.length,
    v.gps_accuracy_m, v.id,
  ]);

  const csv = [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="field-visits-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
