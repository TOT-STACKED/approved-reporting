import { NextResponse } from 'next/server';
import { getPartnerDetail } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';
import {
  INK, MUTED, DIM, BORDER, BG, SURFACE_2, PRIMARY, POSITIVE, SERIES, LEAD_STATUS_COLORS,
} from '@/lib/brand';

// Median days between lead creation and the lead's last status change.
// Used as a proxy for stage-transition time on the report.
function medianDaysToStatus(
  leads: { status: string; date?: string; lastModified?: string }[],
  target: string
) {
  const matches = leads.filter(l => (l.status || '').trim() === target);
  const gaps: number[] = [];
  for (const l of matches) {
    if (!l.date || !l.lastModified) continue;
    const d1 = Date.parse(l.date);
    const d2 = Date.parse(l.lastModified);
    if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) {
      gaps.push(Math.round((d2 - d1) / 86400000));
    }
  }
  if (gaps.length === 0) return { median: null as number | null, count: 0 };
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0
    ? Math.round((gaps[mid - 1] + gaps[mid]) / 2)
    : gaps[mid];
  return { median, count: gaps.length };
}

export async function POST(request: Request) {
  try {
    const { slug, narrativeContext } = await request.json();

    const partner = await getPartnerDetail(slug);
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const stackCollect = await getPartnerStackCollectData(partner.name);

    const now = new Date();
    const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // --- Pipeline KPIs (matches dashboard) ---
    const malCount = partner.statusBreakdown['MAL'] || 0;
    const mqlCount = partner.statusBreakdown['MQL'] || 0;
    const sqlCount = partner.statusBreakdown['SQL'] || 0;
    const closedWon =
      (partner.statusBreakdown['Closed Won'] || 0) +
      (partner.statusBreakdown['Closed Won '] || 0);

    // --- Conversion Timeline (median days, MAL → each stage) ---
    const tMql = medianDaysToStatus(partner.leads, 'MQL');
    const tSql = medianDaysToStatus(partner.leads, 'SQL');
    const tWonA = medianDaysToStatus(partner.leads, 'Closed Won');
    const tWonB = medianDaysToStatus(partner.leads, 'Closed Won ');
    const tWon = (() => {
      const total = tWonA.count + tWonB.count;
      if (total === 0) return { median: null as number | null, count: 0 };
      const sum = (tWonA.median ?? 0) * tWonA.count + (tWonB.median ?? 0) * tWonB.count;
      return { median: Math.round(sum / total), count: total };
    })();

    // --- Generate Narrative ---
    const generateNarrative = () => {
      const parts: string[] = [];

      parts.push(`This month, Tech on Toast continued to drive visibility and value for ${partner.name} across our network.`);

      if (partner.leadCount > 0) {
        parts.push(`We currently have ${partner.leadCount} leads in the pipeline for ${partner.name}.`);
        if (mqlCount > 0) {
          parts.push(`${mqlCount} ${mqlCount === 1 ? 'lead has' : 'leads have'} reached MQL stage.`);
        }
        if (sqlCount > 0) {
          parts.push(`${sqlCount} ${sqlCount === 1 ? 'is' : 'are'} now Sales Qualified, showing strong engagement from prospective operators.`);
        }
        if (closedWon > 0) {
          parts.push(`${closedWon} ${closedWon === 1 ? 'lead has' : 'leads have'} successfully closed this period.`);
        }
      }

      if (tMql.median !== null) {
        parts.push(`On average, leads progress from initial contact to MQL in around ${tMql.median} days.`);
      }

      if (stackCollect && stackCollect.mentions > 0) {
        parts.push(`On the marketplace, ${partner.name} was selected ${stackCollect.mentions} time${stackCollect.mentions === 1 ? '' : 's'} by operators completing intelligence reviews, representing a ${stackCollect.marketShare}% market share across ${stackCollect.totalReviews} total reviews.`);
      }

      if (narrativeContext && narrativeContext.trim()) {
        parts.push(narrativeContext.trim());
      }

      return parts.join(' ');
    };

    const narrative = generateNarrative();

    // --- Lead status rows ---
    const statusRows = (Object.entries(partner.statusBreakdown) as [string, number][])
      .filter(([s]) => s && s !== 'N/A')
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${status}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${(count / partner.leadCount * 100).toFixed(1)}%</td>
        </tr>`).join('');

    // --- Lead source rows ---
    const sourceRows = Object.entries(partner.sourceBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${source}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${count}</td>
        </tr>`).join('');

    // --- Recent leads (MQL+ only, max 10, matches dashboard) ---
    const priority = (s: string) => {
      const k = (s || '').trim().toLowerCase();
      if (k === 'closed won') return 0;
      if (k === 'sql') return 1;
      if (k === 'demo') return 2;
      if (k === 'mql') return 3;
      return 4;
    };
    const recentLeads = [...partner.recentLeads]
      .filter(l => {
        const s = (l.status || '').trim().toLowerCase();
        return s === 'mql' || s === 'sql' || s === 'demo' || s === 'closed won';
      })
      .sort((a, b) => {
        const pa = priority(a.status), pb = priority(b.status);
        if (pa !== pb) return pa - pb;
        return (b.lastModified || '').localeCompare(a.lastModified || '');
      })
      .slice(0, 10);

    const recentLeadRows = recentLeads.map(l => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.businessName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.status}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.source || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.lastModified ? l.lastModified.split('T')[0] : 'N/A'}</td>
      </tr>`).join('');

    // --- Build HTML ---
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    /* Stacked brand. Chunko Bold is served from this origin, so it renders in
       the in-dashboard preview and when printing from there; a copy saved
       elsewhere falls back to DM Sans for headings. */
    @font-face { font-family: 'Chunko'; src: url('/fonts/chunko-bold.woff2') format('woff2'); font-weight: 700; font-display: swap; }
    @media print { body { margin: 20px; } .page-break { page-break-before: always; } }
    body { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; background: ${BG}; color: ${INK}; margin: 40px; line-height: 1.45; }
    h1 { font-family: 'Chunko', 'DM Sans', sans-serif; text-transform: uppercase; color: ${INK}; font-size: 36px; line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 4px; }
    h2 { font-family: 'Chunko', 'DM Sans', sans-serif; text-transform: uppercase; color: ${INK}; font-size: 22px; line-height: 1.05; letter-spacing: -0.02em; margin-top: 32px; border-bottom: 1px solid ${BORDER}; padding-bottom: 6px; }
    .subtitle { color: ${MUTED}; font-size: 14px; margin-bottom: 8px; }
    .tagline { color: ${MUTED}; font-size: 15px; font-weight: 500; margin-bottom: 24px; }
    .narrative { background: ${SURFACE_2}; border-left: 4px solid ${PRIMARY}; padding: 20px 24px; margin: 20px 0 24px 0; border-radius: 0 12px 12px 0; font-size: 15px; line-height: 1.7; color: ${INK}; }
    .kpi-grid { display: flex; gap: 16px; margin: 24px 0; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 120px; padding: 24px 16px; border-radius: 18px; color: ${INK}; text-align: center; border: 1px solid ${BORDER}; }
    .kpi .value { font-family: 'Chunko', 'DM Sans', sans-serif; text-transform: uppercase; font-size: 32px; line-height: 1.05; }
    .kpi .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: ${MUTED}; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
    th { background: ${INK}; color: #FFFFFF; padding: 10px 12px; text-align: left; font-weight: 500; }
    td { font-variant-numeric: tabular-nums; }
    tr:nth-child(even) { background: ${SURFACE_2}; }
    .timeline { display: flex; align-items: center; gap: 8px; margin: 24px 0; }
    .timeline-stage { display: flex; flex-direction: column; align-items: center; min-width: 80px; }
    .timeline-circle { width: 48px; height: 48px; border-radius: 999px; color: ${INK}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
    .timeline-arrow { flex: 1; height: 2px; position: relative; min-width: 40px; }
    .timeline-arrow .days { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .timeline-arrow .n { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); font-size: 10px; color: ${DIM}; white-space: nowrap; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid ${BORDER}; color: ${DIM}; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <h1>${partner.name} - Intelligence Report</h1>
  <div class="subtitle">${monthYear} | Generated ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  <div class="tagline">Here's what Tech on Toast delivered for ${partner.name} this month</div>

  <div class="narrative">${narrative}</div>

  <!-- Pipeline KPIs (mirrors dashboard) -->
  <div class="kpi-grid">
    <div class="kpi" style="background:${LEAD_STATUS_COLORS.MQL}"><div class="value">${mqlCount}</div><div class="label">MQL</div></div>
    <div class="kpi" style="background:${LEAD_STATUS_COLORS.SQL}"><div class="value">${sqlCount}</div><div class="label">SQL</div></div>
    <div class="kpi" style="background:${POSITIVE}"><div class="value">${closedWon}</div><div class="label">Closed Won</div></div>
    <div class="kpi" style="background:${LEAD_STATUS_COLORS.MAL}"><div class="value">${partner.leadCount}</div><div class="label">MAL</div></div>
  </div>

  <!-- Conversion Timeline -->
  <h2>Conversion Timeline</h2>
  <p style="color:${MUTED};font-size:12px;margin:0 0 8px 0">Median days from MAL → each stage</p>
  <div class="timeline">
    <div class="timeline-stage">
      <div class="timeline-circle" style="background:${LEAD_STATUS_COLORS.MAL}">MAL</div>
      <div style="font-size:10px;color:${DIM};margin-top:6px">Day 0</div>
      <div style="font-size:10px;color:${MUTED}">${malCount} leads</div>
    </div>
    <div class="timeline-arrow" style="background:${BORDER}">
      <div class="days" style="color:${LEAD_STATUS_COLORS.MQL}">${tMql.median !== null ? `${tMql.median}d` : '—'}</div>
      <div class="n">n=${tMql.count}</div>
    </div>
    <div class="timeline-stage">
      <div class="timeline-circle" style="background:${LEAD_STATUS_COLORS.MQL}">MQL</div>
      <div style="font-size:10px;color:${DIM};margin-top:6px">${tMql.median !== null ? `~${tMql.median}d` : '—'}</div>
      <div style="font-size:10px;color:${MUTED}">${mqlCount} leads</div>
    </div>
    <div class="timeline-arrow" style="background:${BORDER}">
      <div class="days" style="color:${LEAD_STATUS_COLORS.SQL}">${tSql.median !== null ? `${tSql.median}d` : '—'}</div>
      <div class="n">n=${tSql.count}</div>
    </div>
    <div class="timeline-stage">
      <div class="timeline-circle" style="background:${LEAD_STATUS_COLORS.SQL}">SQL</div>
      <div style="font-size:10px;color:${DIM};margin-top:6px">${tSql.median !== null ? `~${tSql.median}d` : '—'}</div>
      <div style="font-size:10px;color:${MUTED}">${sqlCount} leads</div>
    </div>
    <div class="timeline-arrow" style="background:${BORDER}">
      <div class="days" style="color:${POSITIVE}">${tWon.median !== null ? `${tWon.median}d` : '—'}</div>
      <div class="n">n=${tWon.count}</div>
    </div>
    <div class="timeline-stage">
      <div class="timeline-circle" style="background:${POSITIVE};font-size:10px">Won</div>
      <div style="font-size:10px;color:${DIM};margin-top:6px">${tWon.median !== null ? `~${tWon.median}d` : '—'}</div>
      <div style="font-size:10px;color:${MUTED}">${closedWon} leads</div>
    </div>
  </div>

  <!-- Intelligence: Marketplace Presence -->
  ${stackCollect && stackCollect.mentions > 0 ? `
  <h2>Intelligence - Marketplace Presence</h2>
  <div class="kpi-grid">
    <div class="kpi" style="background:${SERIES[0]}"><div class="value">${stackCollect.mentions}</div><div class="label">Times Selected by Operators</div></div>
    <div class="kpi" style="background:${SERIES[2]}"><div class="value">${stackCollect.marketShare}%</div><div class="label">Market Share</div></div>
    <div class="kpi" style="background:${SERIES[4]}"><div class="value">${stackCollect.totalReviews}</div><div class="label">Total Reviews on Platform</div></div>
  </div>
  ${stackCollect.categories.length > 0 ? `
  <table>
    <thead><tr><th>Category</th><th style="text-align:center">Times Selected</th></tr></thead>
    <tbody>${stackCollect.categories.map(c => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${c.category}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${c.count}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}` : ''}

  <!-- Lead Pipeline Breakdown -->
  <h2>Lead Pipeline</h2>
  <table>
    <thead><tr><th>Status</th><th style="text-align:center">Count</th><th style="text-align:center">Share</th></tr></thead>
    <tbody>${statusRows}</tbody>
  </table>

  <!-- Lead Sources -->
  ${sourceRows ? `
  <h2>Lead Sources</h2>
  <table>
    <thead><tr><th>Source</th><th style="text-align:center">Count</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table>` : ''}

  <!-- Recently Active Leads (MQL+, max 10 — mirrors dashboard) -->
  ${recentLeads.length > 0 ? `
  <h2>Recently Active Leads</h2>
  <p style="color:${MUTED};font-size:12px;margin:0 0 8px 0">Top 10 most recently updated leads at MQL or above</p>
  <table>
    <thead><tr><th>Business</th><th style="text-align:center">Status</th><th>Source</th><th style="text-align:center">Last Updated</th></tr></thead>
    <tbody>${recentLeadRows}</tbody>
  </table>` : ''}

  <div class="footer">
    Tech on Toast | Partner Value Report | ${monthYear}<br>
    <span style="font-size:10px">techontoast.community</span>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${partner.name.replace(/[^a-zA-Z0-9]/g, '_')}_Value_Report_${monthYear.replace(' ', '_')}.html"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
