import { NextResponse, type NextRequest } from 'next/server';
import { getNextUntranscribed, transcribeAndSave, upsertEpisodesFromRss } from '@/lib/podcast';

// Internal only — auto-gated by the proxy.
// POST /api/podcast/ingest
//   ?refresh=1            → just refresh metadata from RSS (cheap, fast)
//   (no flag, default)    → refresh metadata AND transcribe one untranscribed
//                            episode. Note: a single Whisper call can take
//                            30–60s which may exceed Netlify's HTTP timeout
//                            on standard plans. The episode is persisted in
//                            either outcome; the UI is built to retry.

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // hint for runtimes that honour it

export async function POST(request: NextRequest) {
  try {
    const refreshOnly = request.nextUrl.searchParams.get('refresh') === '1';

    const upsert = await upsertEpisodesFromRss();

    if (refreshOnly) {
      return NextResponse.json({ refresh: upsert, transcription: null });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { refresh: upsert, transcription: { skipped: 'OPENAI_API_KEY not set' } },
        { status: 503 }
      );
    }

    const next = await getNextUntranscribed();
    if (!next) {
      return NextResponse.json({
        refresh: upsert,
        transcription: { done: true, message: 'No episodes pending transcription' },
      });
    }

    const result = await transcribeAndSave(next);
    return NextResponse.json({
      refresh: upsert,
      transcription: {
        episodeId: next.id,
        title: next.title,
        ok: result.ok,
        error: result.error,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Ingest failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
