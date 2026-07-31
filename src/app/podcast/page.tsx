'use client';

import { useEffect, useState } from 'react';

interface Episode {
  id: string;
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

interface PodcastData {
  episodes: Episode[];
  total: number;
  transcribed: number;
  untranscribed: number;
  errored: number;
}

function fmtDuration(s: number | null): string {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PodcastPage() {
  const [data, setData] = useState<PodcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'idle' | 'refreshing' | 'transcribing' | 'backfilling'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, target: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/podcast', { credentials: 'include' });
      const d = await r.json();
      setData(d);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function refreshMetadata() {
    setBusy('refreshing');
    setStatusMsg('Fetching RSS…');
    try {
      const r = await fetch('/api/podcast/ingest?refresh=1', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setStatusMsg(`RSS refreshed — ${d.refresh.inserted} new, ${d.refresh.updated} existing.`);
      await load();
    } catch (e: unknown) {
      setStatusMsg(`Refresh failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy('idle');
    }
  }

  async function transcribeNext(): Promise<{ ok: boolean; done: boolean; error?: string }> {
    const r = await fetch('/api/podcast/ingest', { method: 'POST', credentials: 'include' });
    const d = await r.json();
    if (d.error) return { ok: false, done: false, error: d.error };
    const t = d.transcription;
    if (!t || t.done) return { ok: true, done: true };
    return { ok: !!t.ok, done: false, error: t.error };
  }

  async function transcribeOne() {
    setBusy('transcribing');
    setStatusMsg('Transcribing next episode (this can take 30–60s)…');
    const res = await transcribeNext();
    setStatusMsg(
      res.done ? 'Nothing left to transcribe.' :
      res.ok ? 'Episode transcribed.' :
      `Transcription failed: ${res.error || 'unknown'}`
    );
    await load();
    setBusy('idle');
  }

  async function backfillAll() {
    if (!data) return;
    const pending = data.episodes.filter(e => !e.transcript && !e.transcription_error).length;
    if (pending === 0) { setStatusMsg('Nothing to backfill.'); return; }
    if (!confirm(`Transcribe ${pending} episodes back-to-back? Each one takes ~30–60s and uses Whisper credits (~$0.006/min of audio). You can stop by reloading the page.`)) return;

    setBusy('backfilling');
    setBackfillProgress({ done: 0, target: pending });
    let i = 0;
    for (; i < pending; i++) {
      setStatusMsg(`Backfill ${i + 1} / ${pending}…`);
      const res = await transcribeNext();
      setBackfillProgress({ done: i + 1, target: pending });
      if (res.done) break;
      // If the API errored (often a Netlify timeout), keep going — the next
      // call will just try the next pending episode.
    }
    setStatusMsg(`Backfill finished — processed ${i} of ${pending}.`);
    await load();
    setBusy('idle');
  }

  if (loading) {
    return (
      <div>
        <h1 className="font-display text-4xl sm:text-6xl tracking-tight leading-[0.95] text-brand-green mb-6">Podcast</h1>
        <p className="text-sm text-gray-500">Loading episodes…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="font-display text-4xl sm:text-6xl tracking-tight leading-[0.95] text-brand-green mb-6">Podcast</h1>
        <p className="text-sm text-red-600">Failed to load podcast episodes.</p>
      </div>
    );
  }

  const isBusy = busy !== 'idle';
  const pending = data.untranscribed;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl sm:text-6xl tracking-tight leading-[0.95] text-brand-green">Podcast</h1>
        <p className="text-gray-500 mt-1 max-w-3xl text-sm">
          Every episode from the show&apos;s RSS, with full Whisper transcripts so the team
          can search what was said. Use the buttons below to pull new episodes from RSS,
          transcribe one at a time, or backfill the whole catalogue.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-brand-green">{data.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Episodes</p>
        </div>
        <div className="bg-brand-lime/30 rounded-xl border border-brand-green/15 p-4">
          <p className="text-2xl font-bold text-brand-green">{data.transcribed}</p>
          <p className="text-xs text-brand-green/70 mt-0.5">Transcribed</p>
        </div>
        <div className="bg-brand-yellow/40 rounded-xl border border-amber-300/40 p-4">
          <p className="text-2xl font-bold text-brand-green">{pending}</p>
          <p className="text-xs text-brand-green/70 mt-0.5">Pending</p>
        </div>
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-4">
          <p className="text-2xl font-bold text-rose-700">{data.errored}</p>
          <p className="text-xs text-rose-700/70 mt-0.5">Errors</p>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={refreshMetadata}
          disabled={isBusy}
          className="bg-white border border-gray-300 text-gray-700 hover:border-brand-green hover:text-brand-green disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {busy === 'refreshing' ? 'Refreshing…' : '↻ Refresh from RSS'}
        </button>
        <button
          onClick={transcribeOne}
          disabled={isBusy || pending === 0}
          className="bg-brand-green hover:bg-brand-green-soft disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {busy === 'transcribing' ? 'Transcribing…' : 'Transcribe next'}
        </button>
        <button
          onClick={backfillAll}
          disabled={isBusy || pending === 0}
          className="bg-brand-orange hover:bg-brand-orange/85 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          title="Process every pending episode in sequence"
        >
          {busy === 'backfilling'
            ? `Backfilling… ${backfillProgress.done}/${backfillProgress.target}`
            : `Backfill all (${pending})`}
        </button>
        {statusMsg && (
          <span className="text-xs text-gray-500 sm:ml-2">{statusMsg}</span>
        )}
      </div>

      {/* Episode list */}
      <div className="bg-white rounded-xl border border-gray-200">
        <ul className="divide-y divide-gray-100">
          {data.episodes.map(ep => {
            const isOpen = expanded === ep.id;
            const state =
              ep.transcript ? 'indexed' :
              ep.transcription_error ? 'errored' :
              'pending';
            const stateChip =
              state === 'indexed' ? 'bg-brand-lime/40 text-brand-green' :
              state === 'errored' ? 'bg-rose-100 text-rose-700' :
              'bg-gray-100 text-gray-600';
            return (
              <li key={ep.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900">{ep.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                      <span>{fmtDate(ep.pub_date)}</span>
                      <span>{fmtDuration(ep.duration_seconds)}</span>
                      {ep.episode_link && (
                        <a href={ep.episode_link} target="_blank" rel="noopener noreferrer" className="text-brand-green hover:text-brand-green-soft underline">
                          episode link
                        </a>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stateChip}`}>
                        {state}
                      </span>
                    </div>
                    {ep.description && !isOpen && (
                      <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{ep.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : ep.id)}
                    className="text-[11px] text-gray-500 hover:text-brand-green shrink-0"
                  >
                    {isOpen ? 'Collapse' : (ep.transcript ? 'Show transcript' : 'Show details')}
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-3 bg-brand-cream rounded-md p-3 border border-brand-green/10">
                    {ep.description && (
                      <div className="mb-3">
                        <p className="text-[11px] font-medium text-brand-green mb-1">Show notes</p>
                        <p className="text-xs text-gray-700 whitespace-pre-line">{ep.description}</p>
                      </div>
                    )}
                    {ep.transcription_error && (
                      <div className="mb-3 bg-rose-50 border border-rose-200 rounded p-2 text-xs text-rose-700">
                        <strong>Transcription error:</strong> {ep.transcription_error}
                      </div>
                    )}
                    {ep.transcript ? (
                      <div>
                        <p className="text-[11px] font-medium text-brand-green mb-1">
                          Transcript <span className="text-gray-400 font-normal">({ep.transcript.length.toLocaleString()} chars)</span>
                        </p>
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap max-h-96 overflow-y-auto bg-white/60 rounded p-2 border border-brand-green/10">
{ep.transcript}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">No transcript yet. Click &ldquo;Transcribe next&rdquo; up top to process this episode (newest pending one runs first).</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {data.episodes.length === 0 && (
            <li className="p-6 text-sm text-gray-500 text-center">
              No episodes yet. Click <strong>↻ Refresh from RSS</strong> to pull them in.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
