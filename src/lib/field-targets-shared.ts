// Stacked Field targets: shared types and presets. Safe for the browser.
// Data access lives in field-targets.ts.

export type TargetStatus = 'todo' | 'visited' | 'reviewed';

export interface FieldTarget {
  id: string;
  list_id: string;
  name: string;
  brand: string | null;
  address: string | null;
  postcode: string | null;
  website: string | null;
  lat: number;
  lng: number;
  /** todo = not been yet; visited = an app visit was logged there; reviewed = an Intelligence Review exists. */
  status: TargetStatus;
  visit_id: string | null;
}

export interface TargetList {
  id: string;
  name: string;
  sources: string[];
  synced_at: string | null;
  total: number;
  visited: number;
  reviewed: number;
}

/**
 * One-tap lists. Each source is an All The Places "spider": one brand's own
 * venue finder (counts as of Oct 2026). A group lists all its brands.
 */
export const TARGET_PRESETS: { name: string; kind: 'pubs' | 'restaurants'; sources: string[]; about: number }[] = [
  { name: 'Greene King', kind: 'pubs', about: 1480, sources: ['greene_king_pubs_gb', 'greene_king_inns_gb', 'hungry_horse_gb', 'chef_and_brewer_gb', 'farmhouse_inns_gb', 'flaming_grill_gb', 'belhaven_pubs_gb'] },
  { name: 'Mitchells & Butlers', kind: 'pubs', about: 1000, sources: ['toby_carvery_gb', 'harvester_gb', 'vintage_inns_gb', 'miller_and_carter_gb', 'ember_inns_gb', 'nicholsons_pubs_gb', 'stonehouse_gb'] },
  { name: 'Stonegate', kind: 'pubs', about: 970, sources: ['stonegate_gb'] },
  { name: "Marston's", kind: 'pubs', about: 1300, sources: ['marstons_plc'] },
  { name: 'Wetherspoon', kind: 'pubs', about: 830, sources: ['j_d_wetherspoon'] },
  { name: "Young's", kind: 'pubs', about: 265, sources: ['youngs_gb'] },
  { name: 'Hall & Woodhouse', kind: 'pubs', about: 136, sources: ['hall_and_woodhouse_gb'] },
  { name: 'Robinsons', kind: 'pubs', about: 235, sources: ['robinsons_brewery_gb'] },
  { name: "Nando's", kind: 'restaurants', about: 480, sources: ['nandos_gb_ie'] },
  { name: 'Wagamama', kind: 'restaurants', about: 175, sources: ['wagamama_gb'] },
  { name: 'PizzaExpress', kind: 'restaurants', about: 345, sources: ['pizza_express_gb'] },
  { name: 'Azzurri (Zizzi, ASK)', kind: 'restaurants', about: 185, sources: ['zizzi_gb_ie', 'ask_italian_gb'] },
  { name: 'Bella Italia', kind: 'restaurants', about: 71, sources: ['bella_italia_gb'] },
  { name: 'Franco Manca', kind: 'restaurants', about: 47, sources: ['franco_manca_gb'] },
  { name: "Frankie & Benny's", kind: 'restaurants', about: 41, sources: ['frankie_and_bennys_gb'] },
  { name: 'Leon', kind: 'restaurants', about: 38, sources: ['leon_gb'] },
  { name: 'Itsu', kind: 'restaurants', about: 74, sources: ['itsu_gb'] },
  { name: 'Wildwood', kind: 'restaurants', about: 24, sources: ['wildwood_gb'] },
];

/** "greene_king_pubs_gb" → "Greene King Pubs". */
export function sourceLabel(spider: string): string {
  return spider.replace(/_(gb|uk|gb_ie|plc)$/, '').split('_').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}
