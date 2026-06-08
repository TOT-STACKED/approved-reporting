-- Approved-reporting portal — podcast transcripts
--
-- One row per episode pulled from the show's RSS feed
-- (Anchor / Spotify for Podcasters). Metadata is upserted on every ingest;
-- the `transcript` column is filled separately by sending the audio to
-- Whisper. Internal only — the portal uses the service-role key to read
-- and write. RLS on with no anon policy.

create table if not exists public.podcast_episodes (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- Identity from RSS
  guid                text unique not null,
  title               text not null,
  description         text,
  pub_date            timestamptz,
  duration_seconds    integer,
  audio_url           text not null,
  episode_link        text,

  -- Transcript (nullable until Whisper completes for this episode)
  transcript          text,
  transcribed_at      timestamptz,
  transcription_error text
);

create index if not exists podcast_episodes_pub_date_idx
  on public.podcast_episodes (pub_date desc);

-- Partial index makes "find the next episode without a transcript" cheap.
create index if not exists podcast_episodes_untranscribed_idx
  on public.podcast_episodes (pub_date desc)
  where transcript is null;

alter table public.podcast_episodes enable row level security;
