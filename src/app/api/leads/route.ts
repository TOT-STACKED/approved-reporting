import { NextResponse } from 'next/server';

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;

const TABLE = 'tblUkL8xKL4ZNUFKV';
const FIELDS = {
  businessName: 'fldaIprcZqrPGRxen',
  partnerReferral: 'fldwsJvK2OXEMnqZv',
  leadStatus: 'fldf4TNAglyB9s2gP',
  source: 'fldMgrGbR7iFwSxij',
  leadOwner: 'fldVDhPPUQuW4OTJY',
  stage: 'fldbNGUCnii13HcIm',
  lastModified: 'fldAqG8dAXFX3bdFd',
  size: 'fldwUdKgqSG6E2JZ1',
  location: 'fldTwzHji3JbrvHPU',
  date: 'fldRND3uaiduLQouI',
};

function extractVal(field: any): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (field.name) return field.name;
  return String(field);
}

function extractMulti(field: any): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) return [extractVal(field)];
  return field.map((f: any) => typeof f === 'string' ? f : f.name || '').filter(Boolean);
}

export async function GET() {
  try {
    const allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE}`);
      url.searchParams.set('returnFieldsByFieldId', 'true');
      url.searchParams.set('pageSize', '100');
      Object.values(FIELDS).forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${API_KEY}` },
        next: { revalidate: 60 },
      });
      const data = await res.json();
      allRecords.push(...(data.records || []));
      offset = data.offset;
    } while (offset);

    const leads = allRecords.map((r: any) => ({
      id: r.id,
      businessName: r.fields?.[FIELDS.businessName] || '',
      partners: extractMulti(r.fields?.[FIELDS.partnerReferral]),
      status: extractVal(r.fields?.[FIELDS.leadStatus]),
      source: extractVal(r.fields?.[FIELDS.source]),
      owner: extractVal(r.fields?.[FIELDS.leadOwner]),
      stage: extractVal(r.fields?.[FIELDS.stage]),
      lastModified: r.fields?.[FIELDS.lastModified] || '',
      size: r.fields?.[FIELDS.size] || '',
      location: r.fields?.[FIELDS.location] || '',
      date: r.fields?.[FIELDS.date] || '',
    }));

    return NextResponse.json({ leads, total: leads.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
