// Podcast ingestion + transcripts. RSS → Supabase (metadata) → Whisper
// (transcripts). Internal-only: portal uses the service-role key.

import OpenAI from 'openai';

const SUPABASE_URL = process.env.STACKCOLLECT_SUPABASE_URL!;
const SUPABASE_KEY = process.env.STACKCOLLECT_SUPABASE_KEY!;

const PODCAST_RSS = process.env.PODCAST_RSS_URL || 'https://anchor.fm/s/dbfe4940/podcast/rss';
const TABLE = 'podcast_episodes';

// Scope: most recent 50 episodes only. Keeps Whisper costs predictable and
// focuses on the freshest insights. Older episodes simply never enter the
// table — change this number if you want a deeper backfill later.
const MAX_EPISODES = 50;

// Whisper file-size cap (OpenAI limit is 25 MB). Anything over this we skip
// with an error message rather than failing the whole ingest run.
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
// Transcript text cap, just to keep one row from getting unreasonably large.
const MAX_TRANSCRIPT_CHARS = 200_000;

export interface PodcastEpisode {
  id: string;
  created_at: string;
  guid: string;
  title: string;
  description: string | null;
  pub_date: string | null;
  duration_seconds: number | null;
  audio_url: string;
  episode_link: string | null;
  transcript: string | null;
  transcribed_at: string | null;
  transcription_error: string | null;
}

interface RssItem {
  guid: string;
  title: string;
  description: string;
  pubDate: string;
  durationSeconds: number | null;
  audioUrl: string;
  link: string;
}

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

// Convert "HH:MM:SS" / "MM:SS" / "SSSS" duration strings to seconds.
function parseDuration(s: string): number | null {
  const t = (s || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(':').map(p => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export async function fetchRssEpisodes(): Promise<RssItem[]> {
  const res = await fetch(PODCAST_RSS, {
    headers: { 'User-Agent': 'Mozilla/5.0 ApprovedReportingPortal/1.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const guidRaw = (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1] || '';
    const guid = stripHtml(guidRaw) || (block.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || '';
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const durationRaw = (block.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/) || [])[1] || '';
    const link = stripHtml((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const descRaw =
      (block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) || [])[1] ||
      (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    const description = stripHtml(descRaw);
    const audioUrl = (block.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || '';

    if (!title || !guid || !audioUrl) continue;

    items.push({
      guid,
      title,
      description,
      pubDate: pubDateRaw ? new Date(pubDateRaw).toISOString() : '',
      durationSeconds: parseDuration(durationRaw),
      audioUrl,
      link,
    });
  }

  // Newest first (RSS is usually already in this order, but don't trust it),
  // then cap to MAX_EPISODES so we only ingest the latest N.
  items.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  return items.slice(0, MAX_EPISODES);
}

// --- Supabase ---

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Upserts every RSS item into Supabase. Existing rows get metadata refreshed
 * but transcript/transcribed_at are preserved (we never re-transcribe).
 * Returns { totalSeen, inserted, updated }. */
export async function upsertEpisodesFromRss(): Promise<{
  totalSeen: number;
  inserted: number;
  updated: number;
}> {
  const items = await fetchRssEpisodes();

  // Look up which guids already exist so we can split insert vs update.
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=guid`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  const existingGuids = new Set<string>(
    existing.ok ? ((await existing.json()) as { guid: string }[]).map(r => r.guid) : []
  );

  const rows = items.map(i => ({
    guid: i.guid,
    title: i.title.slice(0, 500),
    description: i.description || null,
    pub_date: i.pubDate || null,
    duration_seconds: i.durationSeconds,
    audio_url: i.audioUrl,
    episode_link: i.link || null,
  }));

  if (rows.length === 0) return { totalSeen: 0, inserted: 0, updated: 0 };

  // Postgres upsert on guid via PostgREST's Prefer: resolution=merge-duplicates.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=guid`,
    {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Upsert failed (${res.status}): ${detail}`.trim());
  }

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    if (existingGuids.has(r.guid)) updated++;
    else inserted++;
  }
  return { totalSeen: rows.length, inserted, updated };
}

export async function listEpisodes(): Promise<PodcastEpisode[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=pub_date.desc.nullslast`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  return (await res.json()) as PodcastEpisode[];
}

export async function getNextUntranscribed(): Promise<PodcastEpisode | null> {
  // Newest first — most recent episodes are usually the most interesting to
  // search first while you backfill.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&transcript=is.null&order=pub_date.desc.nullslast&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as PodcastEpisode[];
  return rows[0] || null;
}

async function patchEpisode(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Patch failed (${res.status}): ${detail}`.trim());
  }
}

// --- Whisper ---

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/** Downloads an episode's audio and sends it to Whisper. Returns the
 * transcript text on success, or throws. Long episodes (>25MB) throw early
 * so the caller can mark the row with an error rather than waste the call. */
export async function transcribeEpisode(audioUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const dlRes = await fetch(audioUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 ApprovedReportingPortal/1.0' },
  });
  if (!dlRes.ok) throw new Error(`Audio download failed (${dlRes.status})`);

  const arrayBuffer = await dlRes.arrayBuffer();
  if (arrayBuffer.byteLength > WHISPER_MAX_BYTES) {
    throw new Error(
      `Audio is ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB ` +
      `which exceeds Whisper's 25 MB single-call limit. Long episodes need ` +
      `chunked transcription (not yet implemented).`
    );
  }

  // Whisper accepts a File. Derive a sensible filename + mime from the URL.
  const lower = audioUrl.toLowerCase();
  const ext = lower.match(/\.(mp3|m4a|wav|mp4|mpeg|webm|ogg|flac)(\?|$)/)?.[1] || 'mp3';
  const mime =
    ext === 'mp3' ? 'audio/mpeg' :
    ext === 'm4a' ? 'audio/mp4' :
    ext === 'mp4' ? 'audio/mp4' :
    ext === 'wav' ? 'audio/wav' :
    ext === 'webm' ? 'audio/webm' :
    ext === 'ogg' ? 'audio/ogg' :
    ext === 'flac' ? 'audio/flac' :
    'audio/mpeg';
  const file = new File([arrayBuffer], `episode.${ext}`, { type: mime });

  const tx = await getOpenAI().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'text',
  });

  // SDK returns either a string (text format) or an object — coerce to string.
  const text = typeof tx === 'string' ? tx : (tx as { text?: string }).text || '';
  if (!text.trim()) throw new Error('Whisper returned an empty transcript');
  return text.slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Transcribes one episode end-to-end and persists the result (or the error
 * message). Returns the updated row. */
export async function transcribeAndSave(ep: PodcastEpisode): Promise<{
  ok: boolean;
  episode: PodcastEpisode;
  error?: string;
}> {
  try {
    const text = await transcribeEpisode(ep.audio_url);
    await patchEpisode(ep.id, {
      transcript: text,
      transcribed_at: new Date().toISOString(),
      transcription_error: null,
    });
    return {
      ok: true,
      episode: { ...ep, transcript: text, transcribed_at: new Date().toISOString(), transcription_error: null },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown transcription error';
    // Persist the error so the UI can show it and we don't retry forever.
    await patchEpisode(ep.id, { transcription_error: msg });
    return { ok: false, episode: { ...ep, transcription_error: msg }, error: msg };
  }
}
