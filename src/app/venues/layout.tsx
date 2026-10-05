import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Venues · Stacked',
  description: 'See which UK hospitality venues run which tech.',
  robots: { index: false },
};

export default function VenuesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
