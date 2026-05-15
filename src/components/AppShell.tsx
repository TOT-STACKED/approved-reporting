'use client';

import { usePathname } from 'next/navigation';
import MobileNav from '@/components/MobileNav';

// Routes that render their own chrome (partner-branded header, no portal nav,
// no "Dashboard / Analytics / Leads" links leaking the rest of the admin).
const BARE_PREFIXES = ['/p/', '/login'];

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/leads', label: 'All Leads' },
  { href: '/performance', label: 'Performance' },
  { href: '/community', label: 'Community' },
  { href: '/analytics', label: 'Analytics' },
];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_PREFIXES.some(p => pathname.startsWith(p));
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <nav className="bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-200/80 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group">
            <img
              src="/tech-on-toast-logo.svg"
              alt="Tech on Toast"
              className="h-9 w-auto text-brand-green transition-transform group-hover:-rotate-3"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold text-brand-green text-sm sm:text-base">Tech on Toast</span>
              <span className="text-[10px] sm:text-xs text-gray-500 -mt-0.5">Partner Portal</span>
            </span>
          </a>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => {
              const active = isActive(pathname, link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    active
                      ? 'bg-brand-green text-white font-medium'
                      : 'text-gray-600 hover:text-brand-green hover:bg-brand-cream'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
            <form method="post" action="/api/auth/logout" className="ml-2 pl-3 border-l border-gray-200">
              <button type="submit" className="text-sm text-gray-500 hover:text-brand-green px-2 py-1.5">
                Sign out
              </button>
            </form>
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
