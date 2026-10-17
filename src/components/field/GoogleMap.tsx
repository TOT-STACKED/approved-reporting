'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './google-loader';
import { LONDON, ME_COLOR, TAP_RADIUS, fitPinsOf, pinLook, pinsKey, type MapProps } from './map-types';

// Google Maps backend, used when NEXT_PUBLIC_GOOGLE_MAPS_KEY is set. The key
// is public by design (it ships to the browser), so lock it to
// partners.wearestacked.io/* in Google Cloud. The script loads once per page.

/** A filled circle, so pins match the Leaflet map and are easy to tap. */
function circleIcon(fill: string, stroke: string, radius: number, weight: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: radius,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: weight,
  };
}

export default function GoogleMap({ pins, trails = [], me, center, zoom = 17, fit, fitIds, onPinClick, onMapClick, className = '' }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const drawn = useRef<{ setMap(m: google.maps.Map | null): void }[]>([]);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const handlers = useRef({ onPinClick, onMapClick });
  handlers.current = { onPinClick, onMapClick };
  const fitKey = useRef('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !el.current || map.current) return;
      const start = center || me || LONDON;
      const m = new google.maps.Map(el.current, {
        center: start,
        zoom,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
        // Hide Google's own shop/restaurant pins so ours are the only ones.
        styles: [{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] }],
      });
      m.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) handlers.current.onMapClick?.(e.latLng.lat(), e.latLng.lng());
      });
      info.current = new google.maps.InfoWindow();
      map.current = m;
      setReady(true);
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap on a pin that overlaps others zooms in on the cluster; a lone pin is picked.
  function tap(id: string): boolean {
    const m = map.current;
    const p = pins.find(x => x.id === id);
    const proj = m?.getProjection();
    if (!m || !p || !proj) return false;
    const scale = 2 ** (m.getZoom() || 0);
    const px = (q: { lat: number; lng: number }) => {
      const w = proj.fromLatLngToPoint(q)!;
      return { x: w.x * scale, y: w.y * scale };
    };
    const at = px(p);
    const near = pins.filter(q => { const b = px(q); return Math.hypot(b.x - at.x, b.y - at.y) < TAP_RADIUS; });
    if (near.length > 1 && (m.getZoom() || 0) < 18) {
      const b = new google.maps.LatLngBounds();
      for (const q of near) b.extend(q);
      m.fitBounds(b, 60);
      const cap = Math.min((m.getZoom() || 0) + 4, 18);
      google.maps.event.addListenerOnce(m, 'idle', () => { if ((m.getZoom() || 0) > cap) m.setZoom(cap); });
      return true;
    }
    return false;
  }
  const tapRef = useRef(tap);
  tapRef.current = tap;

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const d of drawn.current) d.setMap(null);
    drawn.current = [];

    for (const t of trails) {
      if (t.points.length < 2) continue;
      drawn.current.push(new google.maps.Polyline({
        map: m,
        path: t.points,
        strokeOpacity: 0,
        // Dotted line: repeated dots read as "route", not "road".
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: t.color, strokeWeight: 4, scale: 2 }, offset: '0', repeat: '12px' }],
      }));
    }

    if (me) {
      if (me.accuracy && me.accuracy < 500) {
        drawn.current.push(new google.maps.Circle({
          map: m, center: me, radius: me.accuracy, strokeColor: ME_COLOR, strokeWeight: 1, fillColor: ME_COLOR, fillOpacity: 0.08, clickable: false,
        }));
      }
      drawn.current.push(new google.maps.Marker({ map: m, position: me, icon: circleIcon(ME_COLOR, '#FFFFFF', 7, 3), clickable: false, zIndex: 1 }));
    }

    for (const p of pins) {
      const s = pinLook(p);
      const marker = new google.maps.Marker({
        map: m,
        position: { lat: p.lat, lng: p.lng },
        icon: circleIcon(s.fill, s.stroke, s.radius, s.weight),
        title: p.label,
        zIndex: p.tone === 'selected' ? 10 : 2,
      });
      marker.addListener('click', () => {
        if (tapRef.current(p.id)) return;
        if (handlers.current.onPinClick) handlers.current.onPinClick(p.id);
        else if (p.label && info.current) {
          info.current.setContent(p.label);
          info.current.open({ map: m, anchor: marker });
        }
      });
      drawn.current.push(marker);
      if (handlers.current.onPinClick) {
        const target = new google.maps.Marker({
          map: m,
          position: { lat: p.lat, lng: p.lng },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: TAP_RADIUS, fillOpacity: 0, strokeOpacity: 0 },
          zIndex: p.tone === 'selected' ? 11 : 3,
        });
        target.addListener('click', () => { if (!tapRef.current(p.id)) handlers.current.onPinClick?.(p.id); });
        drawn.current.push(target);
      }
    }

    const fitTo = fitPinsOf(pins, fitIds);
    const key = pinsKey(fitTo);
    if (fit && fitTo.length && key !== fitKey.current) {
      fitKey.current = key;
      if (fitTo.length === 1) {
        m.setCenter(fitTo[0]);
        m.setZoom(Math.max(m.getZoom() || 15, 15));
      } else {
        const b = new google.maps.LatLngBounds();
        for (const p of fitTo) b.extend(p);
        m.fitBounds(b, 40);
        google.maps.event.addListenerOnce(m, 'idle', () => { if ((m.getZoom() || 0) > 17) m.setZoom(17); });
      }
    }
  });

  const centerKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : '';
  useEffect(() => {
    if (ready && center && map.current) {
      map.current.setCenter(center);
      map.current.setZoom(Math.max(map.current.getZoom() || zoom, zoom));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, ready]);

  return (
    <div className={`relative z-0 bg-surface-2 ${className}`}>
      <div ref={el} className="absolute inset-0" />
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          The map couldn’t load. Check your signal, or the Google Maps key.
        </p>
      )}
    </div>
  );
}
