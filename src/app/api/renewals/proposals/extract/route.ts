import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { uploadProposalFile } from '@/lib/renewals-db';
import { extractProposal, extractionConfigured } from '@/lib/renewals-extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

// Upload a supplier's proposal PDF: store it privately, then list its prices.
// Nothing is saved as a proposal yet — the browser shows every line for the
// operator to check, and the save attaches the file.
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

    const path = await uploadProposalFile(viewer.org.id, bytes);
    const name = (file.name || 'proposal.pdf').slice(0, 200);

    let fields = null;
    let warning: string | null = null;
    if (extractionConfigured()) {
      try {
        fields = await extractProposal(bytes, name);
        if (!fields.lines.length) warning = "We couldn't find any prices in that file. Add the lines yourself.";
      } catch (err) {
        console.warn('[renewals] proposal extraction failed', err);
        warning = "We saved the file but couldn't read it. Add the prices yourself.";
      }
    } else {
      warning = 'Automatic reading is off. Add the prices yourself.';
    }

    return NextResponse.json({ file_path: path, file_name: name, fields, warning });
  } catch (err) {
    return failed('extract proposal', err, 'Upload failed. Try again.');
  }
}
