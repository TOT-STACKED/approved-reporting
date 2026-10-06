'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// Header for Stacked Renewals. Operator-only: no link here ever leads to a
// partner or team surface.
export default function RenewalsHeader({ orgName }: { orgName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/renewals/logout', { method: 'POST' }).catch(() => {});
    router.push('/renewals/signin');
  }

  const link = (href: string, label: string) => {
    const active = href === '/renewals' ? pathname === href : pathname?.startsWith(href);
    return (
      <Link href={href} className={`px-2.5 sm:px-3 py-1.5 rounded-full whitespace-nowrap ${active ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/renewals" className="flex items-baseline gap-2 min-w-0">
          <span className="font-display uppercase text-xl">Stacked</span>
          <span className={`text-xs uppercase tracking-[0.12em] text-muted ${orgName ? 'hidden sm:inline' : ''}`}>Renewals</span>
        </Link>
        {orgName && (
          <nav className="flex items-center gap-1 text-sm">
            {link('/renewals', 'Software')}
            {link('/renewals/team', 'Team')}
            <button onClick={signOut} className="px-2.5 sm:px-3 py-1.5 text-muted hover:text-ink whitespace-nowrap">Sign out</button>
          </nav>
        )}
      </div>
    </header>
  );
}
