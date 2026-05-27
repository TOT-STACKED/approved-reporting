'use client';

import { useEffect, useMemo, useState } from 'react';

// Stacked Operator Score — a 0–5 operator-facing simplification of NPS.
// SOS = average operator rating (0–10) ÷ 2. The higher the score, the more
// confident operators are in the product, so the top of the table is what's
// worth demoing and buying. NPS stays as-is elsewhere on the dashboard; this
// is the friendlier expression of the same feedback.

interface VendorRollup {
  vendor: string;
  nps: number;
  avg: number;      // mean operator rating 0–10
  count: number;    // number of responses
  promoters: number;
  passives: number;
  detractors: number;
}

const MIN_RESPONSES = 5;

function sosFromAvg(avg: number): number {
  return Math.round((avg / 2) * 10) / 10; // one decimal, 0–5
}

interface Band { label: string; pill: string; bar: string; }
function band(sos: number): Band {
  if (sos >= 4.5) return { label: 'Exceptional', pill: 'bg-brand-green text-white', bar: 'bg-brand-green' };
  if (sos >= 4.0) return { label: 'Strong', pill: 'bg-brand-lime/50 text-brand-green', bar: 'bg-brand-lime' };
  if (sos >= 3.0) return { label: 'Solid', pill: 'bg-brand-yellow/60 text-brand-green', bar: 'bg-brand-yellow' };
  if (sos >= 2.0) return { label: 'Mixed', pill: 'bg-brand-orange/20 text-brand-orange', bar: 'bg-brand-orange' };
  return { label: 'Caution', pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' };
}

function Stars({ sos }: { sos: number }) {
  // Render 5 stars, filled proportionally (each star = 1.0).
  return (
    <span className="inline-flex gap-0.5" aria-label={`${sos} out of 5`}>
      {[0, 1, 2, 3, 4].map(i => {
        const fill = Math.max(0, Math.min(1, sos - i)); // 0..1 for this star
        return (
          <span key={i} className="relative inline-block w-3.5 h-3.5">
            <svg viewBox="0 0 20 20" className="absolute inset-0 w-3.5 h-3.5 text-gray-200" fill="currentColor">
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-brand-yellow" fill="currentColor">
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9z" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function SosLeagueTable() {
  const [rollup, setRollup] = useState<VendorRollup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/nps')
      .then(r => r.json())
      .then(d => setRollup(d.vendorRollup || []))
      .catch(() => setRollup([]))
      .finally(() => setLoading(false));
  }, []);

  const { ranked, provisional } = useMemo(() => {
    const all = (rollup || []).map(v => ({ ...v, sos: sosFromAvg(v.avg) }));
    const ranked = all
      .filter(v => v.count >= MIN_RESPONSES)
      .sort((a, b) => (b.sos - a.sos) || (b.count - a.count) || a.vendor.localeCompare(b.vendor));
    const provisional = all
      .filter(v => v.count < MIN_RESPONSES)
      .sort((a, b) => b.sos - a.sos);
    return { ranked, provisional };
  }, [rollup]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">Loading SOS league table…</p>
      </div>
    );
  }

  if (!rollup || rollup.length === 0) {
    return null; // nothing to rank yet
  }

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-bold text-brand-green">SOS League Table</h2>
          <span className="text-xs text-gray-400">Stacked Operator Score · 0–5</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
          A simple confidence score for operators, distilled from NPS — the average operator
          rating out of five. The higher the score, the more reliably operators rate the product.
          The top of this table is what we&apos;d put in front of an operator to demo first.
          <span className="text-gray-400"> Ranked products have {MIN_RESPONSES}+ operator reviews.</span>
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700">
                <th className="text-left py-3 px-4 font-medium w-12">#</th>
                <th className="text-left py-3 px-4 font-medium">Product</th>
                <th className="text-left py-3 px-4 font-medium">SOS</th>
                <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Confidence</th>
                <th className="text-right py-3 px-4 font-medium">Reviews</th>
                <th className="text-right py-3 px-4 font-medium hidden md:table-cell">NPS</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((v, i) => {
                const b = band(v.sos);
                return (
                  <tr key={v.vendor} className="border-b border-gray-100 hover:bg-brand-cream/40">
                    <td className="py-3 px-4 text-gray-400 font-medium">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{v.vendor}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-green tabular-nums">{v.sos.toFixed(1)}</span>
                        <Stars sos={v.sos} />
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${b.pill}`}>
                        {b.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-500 tabular-nums">{v.count}</td>
                    <td className="py-3 px-4 text-right text-gray-400 tabular-nums hidden md:table-cell">{v.nps}</td>
                  </tr>
                );
              })}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-sm text-gray-500">
                    No products have {MIN_RESPONSES}+ operator reviews yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {provisional.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">
              Not enough data yet — under {MIN_RESPONSES} reviews, so not ranked
            </p>
            <div className="flex flex-wrap gap-1.5">
              {provisional.map(v => (
                <span
                  key={v.vendor}
                  className="text-[11px] px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600"
                  title={`Provisional SOS ${v.sos.toFixed(1)} from ${v.count} review${v.count === 1 ? '' : 's'}`}
                >
                  {v.vendor} <span className="text-gray-400">{v.count}★{v.count === 1 ? '' : ''}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
