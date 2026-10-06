import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Renewals · Stacked',
  description: 'Track your software, what it costs and when every notice period closes.',
  robots: { index: false },
};

export default function RenewalsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-ink">{children}</div>;
}
