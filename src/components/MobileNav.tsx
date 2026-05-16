'use client';

import { useState } from 'react';
import { NAV } from '@/lib/nav';

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-brand-green hover:text-brand-green-soft"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 top-[57px] z-50">
          <div className="absolute inset-0 bg-black/20" onClick={close} />
          <div className="relative bg-white border-b border-gray-200 shadow-lg max-h-[calc(100vh-57px)] overflow-y-auto">
            <div className="flex flex-col py-2">
              {NAV.map(node => {
                if (node.type === 'link') {
                  return (
                    <a
                      key={node.href}
                      href={node.href}
                      onClick={close}
                      className="px-6 py-3.5 text-base text-gray-800 hover:text-brand-green hover:bg-brand-cream active:bg-brand-cream"
                    >
                      {node.label}
                    </a>
                  );
                }
                return (
                  <div key={node.label} className="py-1">
                    <p className="px-6 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {node.label}
                    </p>
                    {node.items.map(item => (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={close}
                        className="block px-6 py-3 text-base text-gray-800 hover:text-brand-green hover:bg-brand-cream active:bg-brand-cream"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                );
              })}
              <form method="post" action="/api/auth/logout" className="border-t border-gray-100 mt-1">
                <button
                  type="submit"
                  className="w-full text-left px-6 py-3.5 text-base text-gray-500 hover:text-brand-green hover:bg-brand-cream active:bg-brand-cream"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
