// A Slack message for every visit saved in Stacked Field, posted to the same
// channel as the Intelligence Review pings (Chris's call, 23 Oct 2026), via an
// incoming webhook in FIELD_SLACK_WEBHOOK_URL. Includes the contact's name,
// role, email and phone (also his call): the channel is internal. A visit
// with a full review also gets the usual review ping, from the main system.
// Never blocks or fails a visit save.

import {
  BUSYNESS, DEMO_INTEREST, FIELD_CATEGORIES, FIELD_VENUE_TYPES, OWNERSHIP, labelFor, stackLabel,
  type FieldStack,
} from './field-shared';

const BASE = (process.env.FIELD_PUBLIC_URL || 'https://partners.wearestacked.io').replace(/\/$/, '');

/** Slack treats &, < and > as markup. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function techLines(stack: FieldStack): string[] {
  const keys = [
    ...FIELD_CATEGORIES.map(c => c.id).filter(k => stack[k]),
    ...Object.keys(stack).filter(k => !FIELD_CATEGORIES.some(c => c.id === k)),
  ];
  return keys.map(k => {
    const e = stack[k];
    const what = e.none ? '_none seen_' : [...(e.tools || []), e.other?.trim()].filter(Boolean).map(t => esc(String(t))).join(', ');
    return `• *${esc(stackLabel(k))}:* ${what}`;
  });
}

export interface SlackVisit {
  id: string;
  venue_name: string;
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  visited_at: string;
  venue_type: string | null;
  covers: string | null;
  ownership: string | null;
  group_name: string | null;
  busyness: string | null;
  stack: FieldStack;
  notes: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  demo_interest: string | null;
  photos: string[];
}

export async function postVisitToSlack(v: SlackVisit, agentName: string, reviewDone: boolean): Promise<void> {
  const url = process.env.FIELD_SLACK_WEBHOOK_URL;
  if (!url) return;

  const when = new Date(v.visited_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const where = [v.address, v.postcode].filter(Boolean).map(s => esc(String(s))).join(', ') || (v.lat == null ? '_no pin yet_' : 'Pinned on the map');
  const profile = [
    labelFor(FIELD_VENUE_TYPES, v.venue_type),
    v.covers ? `${v.covers} covers` : '',
    [labelFor(OWNERSHIP, v.ownership), v.group_name].filter(Boolean).join(': '),
    v.busyness ? `${labelFor(BUSYNESS, v.busyness)} when visited` : '',
  ].filter(Boolean).map(esc).join(' · ');
  const tech = techLines(v.stack || {});
  const hot = v.demo_interest === 'yes';
  const visitUrl = `${BASE}/field/visits/${v.id}`;
  const mapUrl = v.lat != null && v.lng != null ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}` : null;

  const contact = [
    v.contact_name ? `*Contact*\n${esc(v.contact_name)}${v.contact_role ? `, ${esc(v.contact_role)}` : ''}` : '',
    v.contact_email ? `*Email*\n<mailto:${v.contact_email}|${esc(v.contact_email)}>` : '',
    v.contact_phone ? `*Phone*\n${esc(v.contact_phone)}` : '',
    v.demo_interest ? `*Demo?*\n${hot ? '🔥 Yes' : esc(labelFor(DEMO_INTEREST, v.demo_interest))}` : '',
  ].filter(Boolean);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${hot ? '🔥 ' : '📍 '}Field visit: ${v.venue_name}`.slice(0, 150), emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent*\n${esc(agentName)}` },
        { type: 'mrkdwn', text: `*When*\n${when}` },
        { type: 'mrkdwn', text: `*Where*\n${where}` },
        ...(profile ? [{ type: 'mrkdwn', text: `*Venue*\n${profile}` }] : []),
      ],
    },
  ];
  if (tech.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Tech seen*\n${tech.join('\n')}`.slice(0, 2900) } });
  if (contact.length) blocks.push({ type: 'section', fields: contact.map(text => ({ type: 'mrkdwn', text })) });
  if (v.notes?.trim()) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Notes*\n${esc(v.notes.trim()).slice(0, 1500)}` } });
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: [
        `<${visitUrl}|Open the visit>`,
        mapUrl ? `<${mapUrl}|Map>` : '',
        v.photos.length ? `📷 ${v.photos.length} photo${v.photos.length === 1 ? '' : 's'}` : '',
        reviewDone ? '✅ Full Intelligence Review done (its own ping too)' : '',
      ].filter(Boolean).join('  ·  '),
    }],
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${hot ? '🔥 ' : ''}Field visit: ${v.venue_name} (${agentName})`, blocks }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn('[field] slack post failed', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.warn('[field] slack post threw', e);
  }
}
