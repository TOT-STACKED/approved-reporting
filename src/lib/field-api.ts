import { NextResponse } from 'next/server';
import { currentAgent, fieldConfigured } from './field-db';
import type { FieldAgent } from './field-shared';

// Route-handler guard for Stacked Field. Returns the signed-in agent, or a
// ready-made error response to send straight back.
export async function requireAgent(opts: { manager?: boolean } = {}): Promise<FieldAgent | NextResponse> {
  if (!fieldConfigured()) {
    return NextResponse.json({ error: 'Field is not switched on yet.' }, { status: 503 });
  }
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  if (opts.manager && agent.role !== 'manager') {
    return NextResponse.json({ error: 'Managers only.' }, { status: 403 });
  }
  return agent;
}
