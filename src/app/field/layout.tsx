import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Field · Stacked',
  description: 'Tag venues and record what you see.',
  robots: { index: false },
  manifest: '/field.webmanifest',
  icons: { icon: '/field-icon.svg', apple: '/field-icon.svg' },
  appleWebApp: { capable: true, title: 'Field', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#38278F',
};

// Stacked Field is a phone app first: agents use it one-handed, standing in a
// venue. Every page sits in a single column that only widens for the
// manager's screens on a desktop.
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh w-full bg-bg text-ink">{children}</div>;
}
