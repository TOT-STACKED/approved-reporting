import Link from 'next/link';

// Header for the venue marketplace pages. Kept separate from the portal's
// AppShell nav, which is for the Stacked team and every link of which is
// gated on the team password.
export default function VenuesHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/venues" className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-xl text-brand-green">Stacked</span>
          <span className="text-xs uppercase tracking-[0.12em] text-muted truncate">Venues</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">{right}</div>
      </div>
    </header>
  );
}
