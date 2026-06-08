import { NextResponse } from 'next/server';
import { listEpisodes } from '@/lib/podcast';

// Internal only — gated by the auth proxy (not in PUBLIC_PREFIXES).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const episodes = await listEpisodes();
    const transcribed = episodes.filter(e => e.transcript).length;
    const untranscribed = episodes.filter(e => !e.transcript && !e.transcription_error).length;
    const errored = episodes.filter(e => e.transcription_error && !e.transcript).length;
    return NextResponse.json({
      episodes,
      total: episodes.length,
      transcribed,
      untranscribed,
      errored,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
