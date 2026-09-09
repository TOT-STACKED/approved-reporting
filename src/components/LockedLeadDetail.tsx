import { UPGRADE_URL } from '@/lib/partner-tier';

// What a Promote partner sees where the Lead Progress table sits on Approved.
//
// The blurred rows are placeholders generated here — no real lead ever
// reaches this component, because the API doesn't send them. That's
// deliberate: a blur over real data is a CSS property away from being read.
//
// The numbers quoted are community-wide, not the partner's own. A Promote
// partner isn't being sent leads, so "your pipeline" would be both wrong and
// unflattering — it's the scale of what Tech on Toast is working that makes
// the case, not a column of zeros with their name on it.

function BlurredRow({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="h-3 rounded-full bg-gray-200" style={{ width }} />
      <div className="h-3 w-10 rounded-full bg-brand-sky ml-auto" />
      <div className="h-3 w-16 rounded-full bg-gray-100" />
    </div>
  );
}

export default function LockedLeadDetail({
  community,
}: {
  community: { mal: number; mql: number; sql: number; closedWon: number; total: number } | null;
}) {
  const qualified = community ? community.mql + community.sql : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-semibold text-gray-900">Lead progress</h2>
        <span className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
          Part of Approved
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">
        The numbers above are what Tech on Toast is working across the community. Approved
        partners get the businesses that match them by name, with source, contact and where
        each one got to.
      </p>

      <div className="relative rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 overflow-hidden">
        {/* Decorative placeholders, not obscured data. */}
        <div aria-hidden className="blur-[3px] select-none opacity-60">
          <BlurredRow width="42%" />
          <BlurredRow width="55%" />
          <BlurredRow width="34%" />
          <BlurredRow width="48%" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-white/55">
          <p className="font-semibold text-gray-900 text-sm">
            {qualified > 0
              ? `We're working ${qualified.toLocaleString()} qualified leads across the community right now`
              : 'Lead detail is part of Approved'}
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-sm">
            {community && community.mal > 0
              ? `That's on top of ${community.mal.toLocaleString()} marketing leads in the community. Approved shows you the ones that match you, by name.`
              : 'Approved shows you which businesses are in the pipeline, where they came from, and lets you log where each one got to.'}
          </p>
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center bg-brand-orange hover:bg-orange-400 active:bg-orange-600 text-brand-green px-4 py-2 rounded-full text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
          >
            See what Approved includes →
          </a>
        </div>
      </div>
    </div>
  );
}
