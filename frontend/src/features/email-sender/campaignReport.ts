import type {
  CampaignActivityClassification,
  CampaignReportSummary,
} from './types.ts';

export interface CampaignReportCard {
  label: string;
  value: number;
  helper: string;
  tone: 'neutral' | 'positive' | 'warning';
}

export interface CampaignReportVisibility {
  trackingEnabled: boolean;
  showEngagement: boolean;
  statusLabel: 'Tracking off' | null;
}

export function buildCampaignReportVisibility(
  clickTrackingEnabled: boolean | undefined,
  hasReport: boolean,
): CampaignReportVisibility {
  const trackingEnabled = clickTrackingEnabled === true;
  return {
    trackingEnabled,
    showEngagement: trackingEnabled && hasReport,
    statusLabel: trackingEnabled ? null : 'Tracking off',
  };
}

export function buildCampaignReportCards(
  summary: CampaignReportSummary,
): CampaignReportCard[] {
  return [
    {
      label: 'Sent',
      value: summary.sent,
      helper: 'Accepted by Gmail',
      tone: 'neutral',
    },
    {
      label: 'Human-likely clicks',
      value: summary.human_likely_clicks,
      helper: `${formatCampaignRate(summary.human_click_rate)} of sent`,
      tone: 'positive',
    },
    {
      label: 'Unconfirmed activity',
      value: summary.unconfirmed_activity,
      helper: 'Landing without interaction',
      tone: 'neutral',
    },
    {
      label: 'Suspected automation',
      value: summary.suspected_automation,
      helper: 'Scanner-like activity',
      tone: 'warning',
    },
  ];
}

export function hasCampaignEngagement(summary: CampaignReportSummary): boolean {
  return summary.landing_visits > 0
    || summary.human_likely_clicks > 0
    || summary.unconfirmed_activity > 0
    || summary.suspected_automation > 0;
}

export function formatCampaignRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined || !Number.isFinite(rate)
    ? '—'
    : `${rate.toFixed(1)}%`;
}

export function formatCampaignDestination(
  origin: string,
  path: string,
): { path: string; host: string } {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    // Preserve the backend label if an older row contains a non-standard origin.
  }
  return { path: path || '/', host };
}

export function formatActivityClassification(
  classification: CampaignActivityClassification,
): string {
  switch (classification) {
    case 'human_likely':
      return 'Human-likely';
    case 'suspected_automation':
      return 'Suspected automation';
    case 'unconfirmed':
      return 'Unconfirmed';
  }
}
