// Pull the venues out of a route's notes. Agents write notes the way they'd
// brief someone ("Liverpool Street → Romford. Start 10am at South St, finish
// ~2:15pm at The Goose… also visit The Vine, Laurie Walk (indie cafe)"), not
// one venue per line, so a model reads them and lists just the venues with
// whatever location the notes give. Uses the OpenAI key the portal already
// has (Renewals uses it too). Falls back to line-by-line when it can't run.

import OpenAI from 'openai';

let client: OpenAI | null = null;

export interface NoteVenue { name: string; where: string }

export async function venuesFromNotes(notes: string): Promise<NoteVenue[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: process.env.FIELD_NOTES_MODEL || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You read a field agent\'s route notes for a day of visiting UK hospitality venues.',
          'List every venue they intend to visit: pubs, bars, restaurants, cafés, hotels, food stalls, clubs.',
          'Not stations, train lines, streets on their own, markets as a whole, meeting points or times.',
          'For each, give its name exactly as written and "where": any street, area or town the notes tie to it,',
          'or the town the whole route is in when that is clear (e.g. a route "to Romford" → "Romford").',
          'Never invent venues or addresses. Return JSON: {"venues":[{"name":"…","where":"…"}]}',
        ].join(' '),
      },
      { role: 'user', content: notes.slice(0, 6000) },
    ],
  }, { timeout: 20000 });
  const json = JSON.parse(completion.choices[0]?.message?.content || '{}') as { venues?: { name?: unknown; where?: unknown }[] };
  return (json.venues || [])
    .map(v => ({ name: String(v.name || '').trim().slice(0, 120), where: String(v.where || '').trim().slice(0, 120) }))
    .filter(v => v.name.length >= 2)
    .slice(0, 40);
}
