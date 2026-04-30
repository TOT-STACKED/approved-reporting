import { NextResponse } from 'next/server';
import { getMarketplaceTraffic } from '@/lib/ga4';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 min cache

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rangeDays = Math.max(1, Math.min(365, Number(url.searchParams.get('range')) || 30));
    const summary = await getMarketplaceTraffic(rangeDays);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('GA4 API error:', error);
    return NextResponse.json(
      { error: error.message || 'GA4 fetch failed' },
      { status: 500 }
    );
  }
}
