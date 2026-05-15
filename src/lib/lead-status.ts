export type LeadStatusCode = 'MAL' | 'MQL' | 'SQL';

export const LEAD_STATUS_NAME: Record<LeadStatusCode, string> = {
  MAL: 'Marketing Awareness Lead',
  MQL: 'Marketing Qualified Lead',
  SQL: 'Sales Qualified Lead',
};

export const LEAD_STATUS_EXPLAINER: Record<LeadStatusCode, string> = {
  MAL: 'Marketing Awareness Lead — has shown awareness of us (engaged with content, signed up to a list, attended an event) but isn’t sales-ready yet.',
  MQL: 'Marketing Qualified Lead — marketing has qualified them as a genuinely interested fit. Meets criteria for product/size and has shown intent.',
  SQL: 'Sales Qualified Lead — sales has accepted them as ready for outreach. Budget, need and timing look real.',
};
