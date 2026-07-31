'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import MobileNav from '@/components/MobileNav';
import { NAV } from '@/lib/nav';

// Routes that render their own chrome (partner-branded header, no portal nav,
// no "Dashboard / Analytics / Leads" links leaking the rest of the admin).
const BARE_PREFIXES = ['/p/', '/login'];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_PREFIXES.some(p => pathname.startsWith(p));
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Which menu is open: a group label, 'account', or null.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close any open menu on outside click or route change.
  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openMenu]);

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  const linkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm transition-colors ${
      active
        ? 'bg-brand-green text-white font-medium'
        : 'text-gray-600 hover:text-brand-green hover:bg-brand-cream'
    }`;

  return (
    <>
      <nav className="bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-200/80 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group">
            <img
              src="/stacked-wordmark.svg"
              alt="Stacked"
              className="h-6 sm:h-7 w-auto transition-transform group-hover:-rotate-2"
            />
            <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green/60 border-l border-brand-green/15 pl-3">
              Approved Reporting
            </span>
          </a>

          {/* Desktop nav */}
          <div ref={navRef} className="hidden md:flex items-center gap-1">
            {NAV.map(node => {
              if (node.type === 'link') {
                return (
                  <a key={node.href} href={node.href} className={linkClass(isActive(pathname, node.href))}>
                    {node.label}
                  </a>
                );
              }
              const groupActive = node.items.some(i => isActive(pathname, i.href));
              const open = openMenu === node.label;
              return (
                <div key={node.label} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenu(open ? null : node.label)}
                    aria-expanded={open}
                    className={`flex items-center gap-1.5 ${linkClass(groupActive && !open)}`}
                  >
                    {node.label}
                    <Caret open={open} />
                  </button>
                  {open && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-40">
                      {node.items.map(item => (
                        <a
                          key={item.href}
                          href={item.href}
                          className={`block px-3 py-2 text-sm transition-colors ${
                            isActive(pathname, item.href)
                              ? 'bg-brand-cream text-brand-green font-medium'
                              : 'text-gray-600 hover:text-brand-green hover:bg-brand-cream'
                          }`}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Account menu */}
            <div className="relative ml-2 pl-3 border-l border-gray-200">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
                aria-expanded={openMenu === 'account'}
                aria-label="Account menu"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-green px-2 py-1.5 rounded-md hover:bg-brand-cream transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <Caret open={openMenu === 'account'} />
              </button>
              {openMenu === 'account' && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-40">
                  <form method="post" action="/api/auth/logout">
                    <button
                      type="submit"
                      className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:text-brand-green hover:bg-brand-cream transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
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
