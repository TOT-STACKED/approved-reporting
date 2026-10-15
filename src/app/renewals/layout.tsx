import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Renewals · Stacked',
  description: 'Track your software, what it costs and when every notice period closes.',
  robots: { index: false },
};

// .renewals-theme (globals.css) gives every Renewals page the operator
// website's palette instead of the partner portal's.
export default function RenewalsLayout({ children }: { children: React.ReactNode }) {
  return <div className="renewals-theme min-h-screen">{children}</div>;
}
