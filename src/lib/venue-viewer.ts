import type { NextRequest } from 'next/server';
import { VENUE_SESSION_COOKIE, verifyVenueSession } from './venue-auth';
import { entitlementFor, type Entitlement } from './venue-subscribers';
import { CATEGORIES, PLANS, type Category, type PlanId } from './venue-plans';

/** The signed-in viewer's entitlement, or null for anonymous / lapsed. */
export async function viewerEntitlement(request: NextRequest): Promise<Entitlement | null> {
  const session = verifyVenueSession(request.cookies.get(VENUE_SESSION_COOKIE)?.value);
  if (!session) return null;
  return entitlementFor(session.email);
}

/** What the browser is told about its own plan. */
export interface ViewerSummary {
  email: string;
  name: string;
  plan: PlanId;
  planName: string;
  status: string;
  categories: Category[];
  insights: boolean;
  allowance: number;
  used: number;
  bonus: number;
  periodStart: string;
  canManageBilling: boolean;
}

export function summarise(ent: Entitlement): ViewerSummary {
  return {
    email: ent.email,
    name: ent.name,
    plan: ent.plan,
    planName: PLANS[ent.plan].name,
    status: ent.status,
    categories: PLANS[ent.plan].allCategories ? [...CATEGORIES] : ent.categories,
    insights: ent.insights,
    allowance: ent.allowance,
    used: ent.used,
    bonus: ent.bonus,
    periodStart: ent.periodStart,
    canManageBilling: ent.canManageBilling,
  };
}
