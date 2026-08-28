import type { EmailCampaign } from './types';

export type CampaignPrimaryAction =
  | 'launch'
  | 'pause'
  | 'report'
  | 'resume'
  | 'retry'
  | 'none';

export interface CampaignPresentation {
  primaryAction: CampaignPrimaryAction;
  sent: number;
  total: number;
  trackingEnabled: boolean;
  landingVisits: number | null;
  humanLikelyClicks: number | null;
  landingRate: number | null;
  humanClickRate: number | null;
}

export interface CampaignMetricDisplay {
  value: string;
  helper: string;
}

export function buildCampaignMetricDisplay(
  trackingEnabled: boolean,
  count: number | null,
  rate: number | null,
): CampaignMetricDisplay {
  if (!trackingEnabled) return { value: '—', helper: 'Tracking off' };
  if (count === null) return { value: '—', helper: 'Not tracked' };
  return {
    value: count.toLocaleString('en-US'),
    helper: rate === null ? 'Rate unavailable' : `${rate.toFixed(1)}% of sent`,
  };
}

export function buildCampaignPresentation(campaign: EmailCampaign): CampaignPresentation {
  const sent = campaign.progress?.sent ?? campaign.sent_count_final ?? 0;
  const total = campaign.progress?.total ?? campaign.target_count ?? 0;
  const trackingEnabled = campaign.click_tracking_enabled === true;

  let primaryAction: CampaignPrimaryAction = 'none';

  if (campaign.status === 'Completed with Errors' && sent < total) {
    primaryAction = 'retry';
  } else if (campaign.status === 'Completed' || campaign.status === 'Completed with Errors') {
    primaryAction = 'report';
  } else if (
    campaign.status === 'Ready'
    || (campaign.source_type === 'airtable' && campaign.status === 'Draft')
  ) {
    primaryAction = 'launch';
  } else if (campaign.status === 'Sending') {
    primaryAction = 'pause';
  } else if (campaign.status === 'Paused') {
    primaryAction = 'resume';
  }

  return {
    primaryAction,
    sent,
    total,
    trackingEnabled,
    landingVisits: trackingEnabled
      ? campaign.performance?.landing_visits ?? null
      : null,
    humanLikelyClicks: trackingEnabled
      ? campaign.performance?.human_likely_clicks ?? null
      : null,
    landingRate: trackingEnabled ? campaign.performance?.landing_rate ?? null : null,
    humanClickRate: trackingEnabled
      ? campaign.performance?.human_click_rate ?? null
      : null,
  };
}
