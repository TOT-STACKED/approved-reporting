import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { uploadContract } from '@/lib/renewals-db';
import { extractContract, extractionConfigured } from '@/lib/renewals-extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

// Upload a contract PDF: store it privately, then read the key dates out of
// it. Nothing is saved to a tool yet — the browser shows the extracted fields
// in the edit form for the operator to check, and the save attaches the file.
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 10MB' }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: 'That doesn’t look like a PDF' }, { status: 400 });
    }

    const path = await uploadContract(viewer.org.id, bytes);
    const name = (file.name || 'contract.pdf').slice(0, 200);

    let fields = null;
    let warning: string | null = null;
    if (extractionConfigured()) {
      try {
        fields = await extractContract(bytes, name);
      } catch (err) {
        console.warn('[renewals] extraction failed', err);
        warning = "We saved the file but couldn't read it. Fill in the details yourself.";
      }
    } else {
      warning = 'Automatic reading is off. Fill in the details yourself.';
    }

    return NextResponse.json({ contract_path: path, contract_name: name, fields, warning });
  } catch (err) {
    return failed('extract', err, 'Upload failed. Try again.');
  }
}
