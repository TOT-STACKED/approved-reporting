import { NextResponse } from 'next/server';
import { getSpreads, writeSpread } from '@/lib/airtable';

export async function GET() {
  try {
    const spreads = await getSpreads();
    return NextResponse.json({ spreads });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionTitle, weekStarting, summary, keyHighlights, linkedinUrl, author } = body;

    if (!editionTitle || !weekStarting) {
      return NextResponse.json({ error: 'Edition title and week starting are required' }, { status: 400 });
    }

    await writeSpread({
      editionTitle,
      weekStarting,
      summary: summary || '',
      keyHighlights: keyHighlights || '',
      linkedinUrl: linkedinUrl || '',
      author: author || '',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
