import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { photoExtension, uploadPhoto } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

// One photo per request. The phone shrinks each one before sending, so they
// arrive well under Netlify's request limit. Returns the storage path, which
// the visit then lists.
export async function POST(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  try {
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'No photo' }, { status: 400 });
    if (!photoExtension(file.type)) return NextResponse.json({ error: 'Photos must be JPEG, PNG or WebP' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is too big' }, { status: 413 });

    const path = await uploadPhoto(agent.id, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ path });
  } catch (error: unknown) {
    console.warn('[field] photo upload failed', error);
    return NextResponse.json({ error: "Couldn't upload that photo. Try again." }, { status: 500 });
  }
}
