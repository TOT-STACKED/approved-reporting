import Link from 'next/link';
import VenuesHeader from '@/components/venues/VenuesHeader';
import { CATEGORIES, CATEGORY_LABELS, PROMOTE } from '@/lib/venue-plans';
import { UPGRADE_URL } from '@/lib/partner-tier';

// Venues isn't sold on its own any more: it comes with the Promote package.
// This page explains how the monthly allowance works and points everyone else
// at the partner packages.
export default function JoinPage() {
  return (
    <div className="min-h-screen bg-bg">
      <VenuesHeader right={<Link href="/venues/signin" className="text-sm underline">Sign in</Link>} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.12em] text-muted mb-3">Included with Promote</p>
        <h1 className="font-display text-3xl sm:text-5xl mb-3">How Venues works</h1>
        <p className="text-muted mb-8 max-w-2xl leading-relaxed">
          Venues is part of the Stacked Promote package. It isn&apos;t sold separately. Every Promote
          partner gets a fresh allowance on the 1st of each month.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="bg-surface border border-border rounded-[22px] p-5">
            <p className="font-display text-4xl mb-2">{PROMOTE.reveals}</p>
            <p className="text-sm text-muted">
              venue reveals a month. A reveal shows a venue&apos;s name and the tech it uses.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-[22px] p-5">
            <p className="font-display text-4xl mb-2">{PROMOTE.maxCategories}</p>
            <p className="text-sm text-muted">
              categories you pick when you first sign in each month. Your reveals show those categories.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-[22px] p-5">
            <p className="font-display text-4xl mb-2">1st</p>
            <p className="text-sm text-muted">
              of the month: reveals and categories reset. Unused reveals don&apos;t roll over. Venues you
              revealed stay unlocked.
            </p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[22px] p-5 sm:p-7 mb-8">
          <p className="text-xs font-semibold mb-3">Categories to choose from</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <span key={c} className="rounded-full px-3.5 py-1.5 text-sm border border-border bg-bg">
                {CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/venues/signin"
            className="bg-brand-orange hover:bg-orange-400 active:bg-orange-600 text-brand-green rounded-full px-6 py-3 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
          >
            Sign in with your partner email
          </Link>
          <a
            href={UPGRADE_URL}
            className="border border-border bg-surface hover:bg-brand-cream rounded-full px-6 py-3 text-sm text-brand-green transition-colors"
          >
            See partner packages
          </a>
        </div>
      </main>
    </div>
  );
}
