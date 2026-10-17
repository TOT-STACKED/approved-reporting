'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Header and bottom tab bar for Stacked Field. The tab bar sits in the thumb
// zone and clears the iPhone home indicator.

export function FieldHeader({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-ink text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex w-full h-14 max-w-5xl items-center gap-2 px-4">
        {back ? (
          <Link href={back} aria-label="Back" className="-ml-2 grid h-11 w-11 place-items-center rounded-full active:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-bold">F</span>
        )}
        <h1 className="flex-1 truncate font-display text-lg uppercase tracking-tight">{title}</h1>
        {right}
      </div>
    </header>
  );
}

const TABS = [
  { href: '/field', label: 'Visits', icon: 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V10z', manager: false },
  { href: '/field/routes', label: 'Routes', icon: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h2M18 9v6a4 4 0 01-4 4h-2', manager: false },
  { href: '/field/visit', label: 'New visit', icon: 'M12 5v14M5 12h14', manager: false, primary: true },
  { href: '/field/insights', label: 'Insights', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', manager: false },
  { href: '/field/manage', label: 'Team map', icon: 'M9 20l-6-3V4l6 3m0 13l6-3m-6 3V7m6 10l6 3V7l-6-3m0 13V4', manager: true },
];

export function FieldTabs({ manager }: { manager: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter(t => !t.manager || manager);
  return (
    <>
      {/* Spacer so content isn't hidden behind the bar. */}
      <div className="h-24" />
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex w-full max-w-md items-end justify-around px-2 pt-1.5 pb-2">
          {tabs.map(t => {
            const active = t.href === '/field' ? pathname === '/field' : pathname?.startsWith(t.href);
            if (t.primary) {
              return (
                <Link key={t.href} href={t.href} className="-mt-6 flex flex-col items-center gap-1">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 active:bg-primary-press">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d={t.icon} /></svg>
                  </span>
                  <span className="text-[11px] font-bold">{t.label}</span>
                </Link>
              );
            }
            return (
              <Link key={t.href} href={t.href} className={`flex min-w-14 flex-col items-center gap-1 py-1 ${active ? 'text-ink' : 'text-dim'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
                <span className="text-[11px] font-bold">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/** Big tappable option pill. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-[15px] font-medium transition-colors ${
        on ? 'border-ink bg-ink text-white' : 'border-border bg-surface text-ink active:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
