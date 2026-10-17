'use client';

import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LONDON, ME_COLOR, pinLook, pinsKey, type MapProps } from './map-types';

// The fallback map: Leaflet with OpenStreetMap tiles, free and keyless. Used
// until NEXT_PUBLIC_GOOGLE_MAPS_KEY is set. Leaflet touches `window`, so it
// loads inside an effect.
//
// Pins are drawn as circles rather than Leaflet's image markers, which break
// under bundlers and are too small to tap on a phone.

export default function LeafletMap({ pins, trails = [], me, center, zoom = 17, fit, onPinClick, onMapClick, className = '' }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  // Latest callbacks, so the map isn't rebuilt when a parent re-renders.
  const handlers = useRef({ onPinClick, onMapClick });
  handlers.current = { onPinClick, onMapClick };
  const fitKey = useRef('');
  const draw = useRef<() => void>(() => {});

  draw.current = () => {
    const mod = L.current;
    const m = map.current;
    if (!mod || !m || !layer.current) return;
    layer.current.clearLayers();

    for (const t of trails) {
      if (t.points.length < 2) continue;
      mod.polyline(t.points.map(p => [p.lat, p.lng] as [number, number]), { color: t.color, weight: 4, opacity: 0.8, dashArray: '2 8', lineCap: 'round' }).addTo(layer.current);
    }

    if (me) {
      if (me.accuracy && me.accuracy < 500) {
        mod.circle([me.lat, me.lng], { radius: me.accuracy, color: ME_COLOR, weight: 1, fillOpacity: 0.08 }).addTo(layer.current);
      }
      mod.circleMarker([me.lat, me.lng], { radius: 7, color: '#FFFFFF', weight: 3, fillColor: ME_COLOR, fillOpacity: 1 }).addTo(layer.current);
    }

    // Selected last, so it sits on top.
    const ordered = [...pins].sort((a, b) => Number(a.tone === 'selected') - Number(b.tone === 'selected'));
    for (const p of ordered) {
      const s = pinLook(p);
      const marker = mod.circleMarker([p.lat, p.lng], {
        radius: s.radius, color: s.stroke, weight: s.weight, fillColor: s.fill, fillOpacity: 1, bubblingMouseEvents: false,
      }).addTo(layer.current);
      if (p.label) marker.bindTooltip(p.label, { direction: 'top', offset: [0, -8] });
      marker.on('click', () => handlers.current.onPinClick?.(p.id));
    }

    const key = pinsKey(pins);
    if (fit && pins.length && key !== fitKey.current) {
      fitKey.current = key;
      if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], Math.max(m.getZoom(), 15));
      else m.fitBounds(mod.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])), { padding: [32, 32], maxZoom: 17 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then(mod => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const start = center || me || LONDON;
      const m = mod.map(el.current, { zoomControl: false }).setView([start.lat, start.lng], zoom);
      mod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      mod.control.zoom({ position: 'bottomright' }).addTo(m);
      m.on('click', e => handlers.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
      layer.current = mod.layerGroup().addTo(m);
      map.current = m;
      draw.current();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => draw.current());

  // Recentre when asked to, e.g. when the first GPS fix arrives.
  const centerKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : '';
  useEffect(() => {
    if (center && map.current) map.current.setView([center.lat, center.lng], Math.max(map.current.getZoom(), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  return <div ref={el} className={`relative z-0 bg-surface-2 ${className}`} />;
}
