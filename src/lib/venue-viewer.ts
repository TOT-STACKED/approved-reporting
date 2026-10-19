import type { NextRequest } from 'next/server';
import { VENUE_SESSION_COOKIE, verifyVenueSession } from './venue-auth';
import { entitlementFor, type Entitlement } from './venue-subscribers';
import { PROMOTE, type Category, type PlanId } from './venue-plans';

/** The signed-in viewer's entitlement, or null for anonymous / no access. */
export async function viewerEntitlement(request: NextRequest): Promise<Entitlement | null> {
  const session = verifyVenueSession(request.cookies.get(VENUE_SESSION_COOKIE)?.value);
  if (!session) return null;
  return entitlementFor(session.email);
}

/** What the browser is told about its own access. */
export interface ViewerSummary {
  email: string;
  name: string;
  plan: PlanId;
  planName: string;
  categories: Category[];
  maxCategories: number;
  insights: boolean;
  allowance: number;
  used: number;
  periodStart: string;
}

export function summarise(ent: Entitlement): ViewerSummary {
  return {
    email: ent.email,
    name: ent.name,
    plan: ent.plan,
    planName: PROMOTE.name,
    categories: ent.categories,
    maxCategories: PROMOTE.maxCategories,
    insights: ent.insights,
    allowance: ent.allowance,
    used: ent.used,
    periodStart: ent.periodStart,
  };
}
