import { UPGRADE_URL } from '@/lib/partner-tier';

// What a Promote partner sees where the Lead Progress table sits on Approved.
//
// The blurred rows are placeholders generated here — no real lead ever
// reaches this component, because the API doesn't send them. That's
// deliberate: a blur over real data is a CSS property away from being read.
//
// The counts above it are real, and they're the argument. "35 MQLs are
// sitting in your pipeline" is a better case for upgrading than any copy we
// could write.

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
  mqlCount,
  sqlCount,
}: {
  mqlCount: number;
  sqlCount: number;
}) {
  const waiting = mqlCount + sqlCount;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-semibold text-gray-900">Lead progress</h2>
        <span className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
          Part of Approved
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">
        Your pipeline numbers above are live. Which businesses they are — names, sources,
        contacts and the status of each one — comes with Approved.
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
            {waiting > 0
              ? `${waiting} qualified lead${waiting === 1 ? '' : 's'} in your pipeline right now`
              : 'Lead detail is part of Approved'}
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-sm">
            {waiting > 0
              ? 'Approved shows you who they are, where they came from, and lets you log where each one got to.'
              : 'As leads reach MQL you will see them counted above. Approved names them.'}
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
