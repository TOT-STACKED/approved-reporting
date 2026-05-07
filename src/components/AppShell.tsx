'use client';

import { usePathname } from 'next/navigation';
import MobileNav from '@/components/MobileNav';

// Routes that render their own chrome (partner-branded header, no portal nav,
// no "Dashboard / Analytics / Leads" links leaking the rest of the admin).
// Paths matching any of these prefixes get rendered bare — the page itself
// is fully responsible for layout.
const BARE_PREFIXES = ['/p/'];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_PREFIXES.some(p => pathname.startsWith(p));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isBareRoute(pathname)) {
    // Token-gated partner pages render full-bleed with no admin chrome so the
    // partner only ever sees their own dashboard.
    return <>{children}</>;
  }

  return (
    <>
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 relative">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              ToT
            </div>
            <span className="font-semibold text-gray-900 text-lg hidden sm:inline">Partner Portal</span>
          </a>
          {/* Desktop nav */}
          <div className="hidden md:flex gap-6">
            <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</a>
            <a href="/leads" className="text-sm text-gray-600 hover:text-gray-900">All Leads</a>
            <a href="/performance" className="text-sm text-gray-600 hover:text-gray-900">Performance</a>
            <a href="/community" className="text-sm text-gray-600 hover:text-gray-900">Community</a>
            <a href="/analytics" className="text-sm text-gray-600 hover:text-gray-900">Analytics</a>
          </div>
          {/* Mobile nav */}
          <MobileNav />
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1">
        {children}
      </main>
    </>
  );
}
