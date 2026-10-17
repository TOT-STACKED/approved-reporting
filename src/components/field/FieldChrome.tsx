'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';

// Header and bottom tab bar for Stacked Field. The tab bar sits in the thumb
// zone and clears the iPhone home indicator.

/**
 * Sign-in only: the Stacked wordmark (the SVG logo, not typed text) with
 * "Field" beside it. The wordmark's letters sit on a tilted baseline, so the
 * word is nudged to its optical centre rather than its box centre.
 */
export function FieldLockup() {
  return (
    <span className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/stacked-wordmark.svg" alt="Stacked" className="h-10 w-auto" />
      <span className="translate-y-[3px] font-display text-[36px] uppercase leading-none tracking-tight text-white">Field</span>
    </span>
  );
}

/** App screens: the Field van badge with "Field" beside it. */
function FieldBadge() {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/field-van.png" alt="" width={32} height={32} className="h-8 w-8" />
      <span className="translate-y-[1px] font-display text-[22px] uppercase leading-none tracking-tight text-white">Field</span>
    </span>
  );
}

// Every Field page: the Stacked Field lockup on top, then the page's own title.
export function FieldHeader({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  const showTitle = title && title !== 'Field';
  return (
    <header className="sticky top-0 z-20 bg-ink text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4">
        {back && (
          <Link href={back} aria-label="Back" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        )}
        <Link href="/field" aria-label="Stacked Field home" className="flex h-11 items-center">
          <FieldBadge />
        </Link>
        <span className="flex-1" />
        {right}
      </div>
      {showTitle && (
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <h1 className="truncate font-display text-[24px] uppercase leading-none tracking-tight">{title}</h1>
        </div>
      )}
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

/** Lights a tab the moment it's tapped, before the next page has loaded. */
function TabInner({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className={`flex flex-col items-center gap-1 transition-colors ${pending ? 'animate-pulse text-ink' : active ? 'text-ink' : 'text-dim'}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      <span className="text-[11px] font-bold">{label}</span>
    </span>
  );
}

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
              <Link key={t.href} href={t.href} className="flex min-h-12 min-w-14 flex-col items-center justify-center py-1">
                <TabInner icon={t.icon} label={t.label} active={Boolean(active)} />
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
