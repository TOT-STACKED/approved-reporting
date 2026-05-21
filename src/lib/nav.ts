// Shared nav structure for the desktop (AppShell) and mobile (MobileNav)
// navigation so they never drift apart.

export type NavItem = { href: string; label: string };
export type NavNode =
  | { type: 'link'; href: string; label: string }
  | { type: 'group'; label: string; items: NavItem[] };

export const NAV: NavNode[] = [
  { type: 'link', href: '/', label: 'Dashboard' },
  {
    type: 'group',
    label: 'Pipeline',
    items: [
      { href: '/leads', label: 'All Leads' },
      { href: '/performance', label: 'Performance' },
    ],
  },
  {
    type: 'group',
    label: 'Insights',
    items: [
      { href: '/tech-check', label: 'Tech Check' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/community', label: 'Community' },
    ],
  },
  { type: 'link', href: '/knowledge', label: 'Knowledge' },
];
