// The Stacked team on the dashboard's Team board, and how the free-text-ish
// Lead Owner values in the Master Lead Sheet map onto them.
//
// Lead Owner has drifted over time ("Chris C", "Chris Fletcher", "Chris"...),
// so each person lists every spelling that is definitely them. Anything that
// matches nobody (blank, "Both", other names) stays
// off the board and is shown as a footnote so it can be tidied in Airtable.
//
// Headshots: put a square image in public/team/ and set `photo` to its path.

export interface TeamMember {
  name: string;
  /** Lead Owner values (case-insensitive) that mean this person. */
  owners: string[];
  photo?: string;
}

export const TEAM: TeamMember[] = [
  { name: 'Caz', owners: ['caz', 'caroline'] },
  { name: 'Iuliia', owners: ['iuliia', 'iuliia kreik', 'iulia'] },
  // Plain "Chris" in Lead Owner is Chris Fletcher (confirmed 13 Nov 2026).
  { name: 'Chris F', owners: ['chris f', 'chris fletcher', 'fletch', 'chris'] },
  { name: 'Chris C', owners: ['chris c', 'chris cartmell'] },
];

/** Team board points for partner-side work logged as Partner Health notes. */
export const PARTNER_WORK_POINTS = { note: 1, actionDone: 2 };

const BY_OWNER = new Map(TEAM.flatMap(m => m.owners.map(o => [o, m.name] as const)));

/** The team member a Lead Owner value belongs to, or null if it's nobody (or unclear). */
export function teamMemberFor(owner: string | null | undefined): string | null {
  const key = (owner || '').trim().toLowerCase();
  return BY_OWNER.get(key) ?? null;
}
