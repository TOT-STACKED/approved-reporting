import { redirect } from 'next/navigation';

// Retired 12 Nov 2026 — now part of the dashboard (or removed). Old links
// and bookmarks land on the dashboard instead of a dead page.
export default function Retired() {
  redirect('/');
}
