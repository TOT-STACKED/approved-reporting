// Lead scoring — surfaces which leads deserve immediate attention so the TOT
// team can triage at a glance. No MRR or first-response timestamp exists in
// Airtable, so the score is computed from the three signals we do have:
//   • Status tier       (SQL / Demo > MQL > MAL > Lead > nurture > Lost)
//   • Freshness         (days since last modified)
//   • Source quality    (direct / referral > paid / cold)
// plus small bonuses for:
//   • Ownership         (assigned — someone is actively on it)
//   • Partner attached  (a partner has been introduced, so the deal is shaped)
//
// Score is clamped 0–100. Priority bucket:
//   80+ → hot, 60+ → high, 40+ → normal, below → cold
//
// When Airtable adds MRR/deal value or a first-response timestamp, extend
// SCORE_SIGNALS and compute them additively here — callers pick up the new
// score without any display-side changes.

export type LeadPriority = 'hot' | 'high' | 'normal' | 'cold';

export interface ScoreBreakdown {
  score: number;          // 0–100
  priority: LeadPriority;
  reasons: string[];      // human-readable contributions (for tooltips / debug)
}

interface ScoringInputs {
  status?: string | null;
  stage?: string | null;
  source?: string | null;
  owner?: string | null;
  lastModified?: string | null;
  partners?: string[] | null;
}

// Per-status weight (0–60). Tuned so SQL beats MQL beats MAL in triage lists.
const STATUS_WEIGHTS: Record<string, number> = {
  'SQL':              60,
  'sql':              60,
  'Demo':             55,
  'Opportunity':      50,
  'In Conversation':  45,
  'MQL':              35,
  'MAL':              25,
  'Lead':             20,
  'nurture':          10,
  'N/A':               5,
  'Closed Won':       15, // deprioritise — deal done
  'Lost':              0,
  'Closed Lost':       0,
};

// Source quality — which acquisition channels historically convert best.
// Anything not listed defaults to neutral (0).
const SOURCE_WEIGHTS: Record<string, number> = {
  'Partner Referral':      12,
  'Referral':              12,
  'Direct':                10,
  'Stack Review':          10,
  'Stack Builder':         10,
  'Spread':                 8,
  'Newsletter':             6,
  'Paid':                   2,
  'Cold':                   0,
  'Outbound':               0,
};

function freshnessScore(lastModifiedISO?: string | null): number {
  if (!lastModifiedISO) return 0;
  const ts = Date.parse(lastModifiedISO);
  if (Number.isNaN(ts)) return 0;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 3)  return 20;       // this week
  if (days <= 7)  return 15;
  if (days <= 14) return 10;
  if (days <= 30) return 5;
  if (days <= 90) return 0;
  return -10;                      // stale — actively drag the score down
}

export function scoreLead(lead: ScoringInputs): ScoreBreakdown {
  const reasons: string[] = [];
  let score = 0;

  const statusWeight = STATUS_WEIGHTS[(lead.status ?? '').trim()] ?? 15;
  score += statusWeight;
  if (lead.status) reasons.push(`Status ${lead.status}: +${statusWeight}`);

  const fresh = freshnessScore(lead.lastModified);
  score += fresh;
  if (fresh !== 0) reasons.push(`Recency: ${fresh >= 0 ? '+' : ''}${fresh}`);

  const sourceWeight = SOURCE_WEIGHTS[(lead.source ?? '').trim()] ?? 0;
  score += sourceWeight;
  if (sourceWeight > 0) reasons.push(`Source ${lead.source}: +${sourceWeight}`);

  if (lead.owner && lead.owner.trim()) {
    score += 5;
    reasons.push(`Owner assigned: +5`);
  }

  if (lead.partners && lead.partners.length > 0) {
    score += 5;
    reasons.push(`${lead.partners.length} partner${lead.partners.length === 1 ? '' : 's'} attached: +5`);
  }

  // Clamp.
  score = Math.max(0, Math.min(100, score));

  const priority: LeadPriority =
    score >= 80 ? 'hot' :
    score >= 60 ? 'high' :
    score >= 40 ? 'normal' :
    'cold';

  return { score, priority, reasons };
}

export const PRIORITY_LABEL: Record<LeadPriority, string> = {
  hot:    '🔥 Hot',
  high:   '⭐ High',
  normal: 'Normal',
  cold:   'Cold',
};

export const PRIORITY_CLASS: Record<LeadPriority, string> = {
  hot:    'bg-rose-100 text-rose-700',
  high:   'bg-amber-100 text-amber-700',
  normal: 'bg-gray-100 text-gray-600',
  cold:   'bg-gray-50 text-gray-400',
};
