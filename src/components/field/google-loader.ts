// Loads the Google Maps JavaScript API once per page, for the map and for
// Places search. The key is public by design (it ships to the browser), so
// lock it to partners.wearestacked.io/* in Google Cloud.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

let loader: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const cb = '__fieldGoogleMapsReady';
      (window as unknown as Record<string, () => void>)[cb] = () => resolve();
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () => { loader = null; reject(new Error('Google Maps failed to load')); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export const HAS_GOOGLE = Boolean(KEY);
