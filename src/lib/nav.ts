// Shared nav structure for the desktop (AppShell) and mobile (MobileNav)
// navigation so they never drift apart.

export type NavItem = { href: string; label: string };
export type NavNode =
  | { type: 'link'; href: string; label: string }
  | { type: 'group'; label: string; items: NavItem[] };

export const NAV: NavNode[] = [
  // Performance, Community and Podcast were folded into / removed from the
  // dashboard on 12 Nov 2026; their old URLs redirect to /.
  { type: 'link', href: '/', label: 'Dashboard' },
  { type: 'link', href: '/leads', label: 'All Leads' },
  {
    type: 'group',
    label: 'Insights',
    items: [
      { href: '/tech-check', label: 'Tech Check' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  { type: 'link', href: '/knowledge', label: 'Knowledge' },
];
