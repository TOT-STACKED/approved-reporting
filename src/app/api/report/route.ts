import { NextResponse } from 'next/server';
import { getPartnerDetail, getMetrics, getMarketingActivities, getActivitiesForPartner } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';

export async function POST(request: Request) {
  try {
    const { partnerName, slug, narrativeContext } = await request.json();

    const [partner, allMetrics, allActivities] = await Promise.all([
      getPartnerDetail(slug),
      getMetrics(),
      getMarketingActivities(),
    ]);

    const stackCollect = partner ? await getPartnerStackCollectData(partner.name) : null;

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const metrics = allMetrics.filter(
      m => m.partnerName.trim().toLowerCase() === partner.name.trim().toLowerCase()
    );

    const partnerActivities = getActivitiesForPartner(allActivities, partner.name);

    const now = new Date();
    const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // --- Marketing Value Metrics ---
    const totalImpressions = partnerActivities.reduce((s, a) => s + a.impressions, 0);
    const totalEngagements = partnerActivities.reduce((s, a) => s + a.engagements, 0);
    const totalClicks = partnerActivities.reduce((s, a) => s + a.clickThroughs, 0);
    const totalMarketingLeads = partnerActivities.reduce((s, a) => s + a.leadsGenerated, 0);
    const totalPipeline = partnerActivities.reduce((s, a) => s + a.pipelineValue, 0);

    // Group activities by type
    const byType: Record<string, { count: number; impressions: number; engagements: number }> = {};
    for (const a of partnerActivities) {
      if (!byType[a.activityType]) byType[a.activityType] = { count: 0, impressions: 0, engagements: 0 };
      byType[a.activityType].count++;
      byType[a.activityType].impressions += a.impressions;
      byType[a.activityType].engagements += a.engagements;
    }

    // --- Pipeline Metrics ---
    const activeConversations = (partner.statusBreakdown['In Conversation'] || 0) +
      (partner.statusBreakdown['Opportunity'] || 0) +
      (partner.statusBreakdown['SQL'] || 0);
    const closedWon = (partner.statusBreakdown['Live Closed'] || 0) +
      (partner.statusBreakdown['Live Closed '] || 0);
    const closedLost = (partner.statusBreakdown['Lost'] || 0) +
      (partner.statusBreakdown['Lost '] || 0);
    const nurturing = partner.statusBreakdown['nurture'] || 0;

    // --- Site Traffic ---
    const totalSessions = metrics.reduce((s, m) => s + m.sessions, 0);
    const totalUsers = metrics.reduce((s, m) => s + m.users, 0);
    const totalPageViews = metrics.reduce((s, m) => s + m.pageViews, 0);
    const avgBounce = metrics.length > 0
      ? (metrics.reduce((s, m) => s + m.bounceRate, 0) / metrics.length * 100).toFixed(1)
      : 'N/A';

    // --- Generate Narrative ---
    const generateNarrative = () => {
      const parts: string[] = [];

      // Opening
      parts.push(`This month, Tech on Toast continued to drive visibility and value for ${partner.name} across our network.`);

      // Leads story
      if (partner.leadCount > 0) {
        parts.push(`We currently have ${partner.leadCount} leads in the pipeline for ${partner.name}.`);
        if (activeConversations > 0) {
          parts.push(`Of these, ${activeConversations} ${activeConversations === 1 ? 'is' : 'are'} in active conversation, showing strong engagement from prospective operators.`);
        }
        if (closedWon > 0) {
          parts.push(`${closedWon} ${closedWon === 1 ? 'lead has' : 'leads have'} successfully closed this period.`);
        }
        if (nurturing > 0) {
          parts.push(`${nurturing} ${nurturing === 1 ? 'lead is' : 'leads are'} being nurtured towards conversion.`);
        }
      }

      // Marketing activity story
      if (partnerActivities.length > 0) {
        const types = Object.keys(byType);
        parts.push(`On the marketing front, we featured ${partner.name} across ${partnerActivities.length} ${partnerActivities.length === 1 ? 'activity' : 'activities'}${types.length > 0 ? `, including ${types.slice(0, 3).join(', ').toLowerCase()}` : ''}.`);
        if (totalImpressions > 0) {
          parts.push(`This generated a total reach of ${totalImpressions.toLocaleString()} impressions with ${totalEngagements.toLocaleString()} engagements.`);
        }
      }

      // Traffic story
      if (totalSessions > 0) {
        parts.push(`Partner page traffic saw ${totalSessions.toLocaleString()} sessions from ${totalUsers.toLocaleString()} unique users this period.`);
      }

      // Pipeline value
      if (totalPipeline > 0) {
        parts.push(`The estimated pipeline value attributed to these efforts stands at £${totalPipeline.toLocaleString()}.`);
      }

      // StackCollect data
      if (stackCollect && stackCollect.mentions > 0) {
        parts.push(`On the marketplace, ${partner.name} was selected ${stackCollect.mentions} time${stackCollect.mentions === 1 ? '' : 's'} by operators completing tech stack reviews on StackCollect, representing a ${stackCollect.marketShare}% market share across ${stackCollect.totalReviews} total reviews.`);
      }

      // User-provided context
      if (narrativeContext && narrativeContext.trim()) {
        parts.push(narrativeContext.trim());
      }

      return parts.join(' ');
    };

    const narrative = generateNarrative();

    // --- Build HTML ---
    const activityTypeRows = Object.entries(byType)
      .sort(([, a], [, b]) => b.impressions - a.impressions)
      .map(([type, data]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${type}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${data.count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${data.impressions.toLocaleString()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${data.engagements.toLocaleString()}</td>
        </tr>`).join('');

    const activityDetailRows = partnerActivities.slice(0, 15).map(a => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${a.activityTitle}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${a.activityType}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${a.date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${a.impressions.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${a.engagements.toLocaleString()}</td>
      </tr>`).join('');

    const metricsRows = metrics.map(m => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${m.weekStarting}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${m.sessions.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${m.users.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${m.pageViews.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${(m.bounceRate * 100).toFixed(1)}%</td>
      </tr>`).join('');

    const statusRows = Object.entries(partner.statusBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${status}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${(count / partner.leadCount * 100).toFixed(1)}%</td>
        </tr>`).join('');

    const recentLeadRows = partner.recentLeads.slice(0, 15).map(l => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.businessName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.status}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.lastModified ? l.lastModified.split('T')[0] : 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.source}</td>
      </tr>`).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @media print { body { margin: 20px; } .page-break { page-break-before: always; } }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #2d3436; margin: 40px; line-height: 1.5; }
    h1 { color: #2c3e50; font-size: 28px; margin-bottom: 4px; }
    h2 { color: #34495e; font-size: 18px; margin-top: 32px; border-bottom: 2px solid #e67e22; padding-bottom: 6px; }
    .subtitle { color: #7f8c8d; font-size: 14px; margin-bottom: 8px; }
    .tagline { color: #e67e22; font-size: 15px; font-weight: 600; margin-bottom: 24px; }
    .narrative { background: #f8f9fa; border-left: 4px solid #e67e22; padding: 20px 24px; margin: 20px 0 24px 0; border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.7; color: #2d3436; }
    .kpi-grid { display: flex; gap: 12px; margin: 20px 0; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 120px; padding: 16px; border-radius: 8px; color: white; text-align: center; }
    .kpi .value { font-size: 24px; font-weight: bold; }
    .kpi .label { font-size: 11px; opacity: 0.9; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { background: #2c3e50; color: white; padding: 10px 12px; text-align: left; }
    tr:nth-child(even) { background: #f8f9fa; }
    .highlight-box { background: #fef9f0; border: 1px solid #f0dcc0; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; color: #95a5a6; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <h1>${partner.name} - Partner Value Report</h1>
  <div class="subtitle">${monthYear} | Generated ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  <div class="tagline">Here's what Tech on Toast delivered for ${partner.name} this month</div>

  <div class="narrative">${narrative}</div>

  <!-- Performance Snapshot -->
  <div class="kpi-grid">
    <div class="kpi" style="background:#2980b9"><div class="value">${partner.leadCount}</div><div class="label">Total Leads</div></div>
    <div class="kpi" style="background:#e67e22"><div class="value">${totalImpressions.toLocaleString()}</div><div class="label">Total Reach</div></div>
    <div class="kpi" style="background:#27ae60"><div class="value">${activeConversations}</div><div class="label">Active Conversations</div></div>
    <div class="kpi" style="background:#8e44ad"><div class="value">${closedWon}</div><div class="label">Closed Won</div></div>
  </div>
  <div class="kpi-grid" style="margin-top:0">
    <div class="kpi" style="background:#2c3e50"><div class="value">${totalEngagements.toLocaleString()}</div><div class="label">Engagements</div></div>
    <div class="kpi" style="background:#16a085"><div class="value">${totalClicks.toLocaleString()}</div><div class="label">Click-throughs</div></div>
    <div class="kpi" style="background:#d35400"><div class="value">${nurturing}</div><div class="label">Nurturing</div></div>
    <div class="kpi" style="background:#c0392b"><div class="value">&pound;${totalPipeline.toLocaleString()}</div><div class="label">Pipeline Value</div></div>
  </div>

  <!-- Marketing Activity by Type -->
  ${Object.keys(byType).length > 0 ? `
  <h2>Marketing Activity Breakdown</h2>
  <table>
    <thead><tr><th>Activity Type</th><th style="text-align:center">Count</th><th style="text-align:center">Reach</th><th style="text-align:center">Engagements</th></tr></thead>
    <tbody>${activityTypeRows}</tbody>
  </table>` : ''}

  <!-- Activity Detail -->
  ${partnerActivities.length > 0 ? `
  <h2>What We Did For ${partner.name}</h2>
  <table>
    <thead><tr><th>Activity</th><th style="text-align:center">Type</th><th style="text-align:center">Date</th><th style="text-align:center">Reach</th><th style="text-align:center">Engagements</th></tr></thead>
    <tbody>${activityDetailRows}</tbody>
  </table>` : `
  <div class="highlight-box">
    <p style="color:#7f8c8d;margin:0"><em>No marketing activities logged yet for ${partner.name}. Use the portal to start tracking activities.</em></p>
  </div>`}

  ${stackCollect && stackCollect.mentions > 0 ? `
  <h2>StackCollect - Marketplace Presence</h2>
  <div class="kpi-grid">
    <div class="kpi" style="background:#4f46e5"><div class="value">${stackCollect.mentions}</div><div class="label">Times Selected by Operators</div></div>
    <div class="kpi" style="background:#6366f1"><div class="value">${stackCollect.marketShare}%</div><div class="label">Market Share</div></div>
    <div class="kpi" style="background:#818cf8"><div class="value">${stackCollect.totalReviews}</div><div class="label">Total Reviews on Platform</div></div>
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

  <div class="page-break"></div>

  <!-- Site Traffic -->
  <h2>Partner Page Traffic</h2>
  <div class="kpi-grid">
    <div class="kpi" style="background:#34495e"><div class="value">${partner.leadCount}</div><div class="label">Total Leads</div></div>
    <div class="kpi" style="background:#2980b9"><div class="value">${totalSessions.toLocaleString()}</div><div class="label">Sessions</div></div>
    <div class="kpi" style="background:#8e44ad"><div class="value">${totalUsers.toLocaleString()}</div><div class="label">Users</div></div>
    <div class="kpi" style="background:#c0392b"><div class="value">${avgBounce}%</div><div class="label">Bounce Rate</div></div>
  </div>

  ${metrics.length > 0 ? `
  <table>
    <thead><tr>
      <th>Week</th><th style="text-align:center">Sessions</th><th style="text-align:center">Users</th><th style="text-align:center">Page Views</th><th style="text-align:center">Bounce Rate</th>
    </tr></thead>
    <tbody>${metricsRows}
      <tr style="background:#2c3e50;color:white;font-weight:bold">
        <td style="padding:10px 12px">Total</td>
        <td style="padding:10px 12px;text-align:center">${totalSessions.toLocaleString()}</td>
        <td style="padding:10px 12px;text-align:center">${totalUsers.toLocaleString()}</td>
        <td style="padding:10px 12px;text-align:center">${totalPageViews.toLocaleString()}</td>
        <td style="padding:10px 12px;text-align:center">${avgBounce}% avg</td>
      </tr>
    </tbody>
  </table>` : '<p style="color:#7f8c8d"><em>No traffic metrics available yet.</em></p>'}

  <!-- Lead Pipeline -->
  <h2>Lead Pipeline</h2>
  <table>
    <thead><tr><th>Status</th><th style="text-align:center">Count</th><th style="text-align:center">Share</th></tr></thead>
    <tbody>${statusRows}</tbody>
  </table>

  ${partner.recentLeads.length > 0 ? `
  <h2>Recently Active Leads</h2>
  <table>
    <thead><tr><th>Business</th><th style="text-align:center">Status</th><th style="text-align:center">Last Modified</th><th>Source</th></tr></thead>
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
