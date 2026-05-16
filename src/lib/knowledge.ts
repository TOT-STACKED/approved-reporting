// Internal knowledge base — stored in Supabase `knowledge_base`.
// On add we fetch the link server-side and extract readable text so the AI
// can answer from the actual page content. Login-walled links (PandaDoc,
// private Google Docs, etc.) will store with fetch_ok=false — the title +
// notes still make them searchable.

const SUPABASE_URL = process.env.STACKCOLLECT_SUPABASE_URL!;
const SUPABASE_KEY = process.env.STACKCOLLECT_SUPABASE_KEY!;

const TABLE = 'knowledge_base';
const MAX_CONTENT_CHARS = 40_000; // keep AI context + row size sane

export interface KnowledgeEntry {
  id: string;
  created_at: string;
  url: string;
  title: string | null;
  notes: string | null;
  content: string | null;
  domain: string | null;
  fetch_ok: boolean;
  fetch_error: string | null;
  added_by: string | null;
}

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Strip a fetched HTML document down to readable plain text. */
function htmlToText(html: string): string {
  let s = html;
  // Drop non-content elements entirely
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Block elements → newlines so text doesn't run together
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Remaining tags → gone
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode the common entities
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&rsquo;/gi, '’')
       .replace(/&ldquo;/gi, '“')
       .replace(/&rdquo;/gi, '”');
  // Collapse whitespace
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim() || null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface FetchedPage {
  title: string | null;
  content: string;
  fetch_ok: boolean;
  fetch_error: string | null;
}

async function fetchAndExtract(url: string): Promise<FetchedPage> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Some sites 403 a bare fetch — present as a normal browser.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { title: null, content: '', fetch_ok: false, fetch_error: `HTTP ${res.status}` };
    }

    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/html') && !ctype.includes('text/plain') && !ctype.includes('xml')) {
      return {
        title: null,
        content: '',
        fetch_ok: false,
        fetch_error: `Unsupported content-type: ${ctype || 'unknown'} (non-HTML links are stored by title/notes only)`,
      };
    }

    const html = await res.text();
    const title = extractTitle(html);
    const text = htmlToText(html).slice(0, MAX_CONTENT_CHARS);
    if (!text) {
      return { title, content: '', fetch_ok: false, fetch_error: 'No readable text extracted' };
    }
    return { title, content: text, fetch_ok: true, fetch_error: null };
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'Fetch timed out' : e?.message || 'Fetch failed';
    return { title: null, content: '', fetch_ok: false, fetch_error: msg };
  }
}

export async function addKnowledgeEntry(input: {
  url: string;
  notes?: string;
  title?: string;
  addedBy?: string;
}): Promise<KnowledgeEntry> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL must start with http:// or https://');
  }

  const page = await fetchAndExtract(url);

  const row = {
    url,
    title: (input.title?.trim() || page.title || url).slice(0, 500),
    notes: input.notes?.trim() || null,
    content: page.content || null,
    domain: hostnameOf(url),
    fetch_ok: page.fetch_ok,
    fetch_error: page.fetch_error,
    added_by: input.addedBy?.trim() || null,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Could not save to knowledge base (${res.status}). ${detail}`.trim());
  }

  const [created] = (await res.json()) as KnowledgeEntry[];
  return created;
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=created_at.desc`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  return (await res.json()) as KnowledgeEntry[];
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: sbHeaders() }
  );
  if (!res.ok) {
    throw new Error(`Could not delete entry (${res.status})`);
  }
}
