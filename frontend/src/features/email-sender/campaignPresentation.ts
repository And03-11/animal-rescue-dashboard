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
  openRate: number | null;
  clickRate: number | null;
}

export function buildCampaignPresentation(campaign: EmailCampaign): CampaignPresentation {
  const sent = campaign.progress?.sent ?? campaign.sent_count_final ?? 0;
  const total = campaign.progress?.total ?? campaign.target_count ?? 0;

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
    openRate: campaign.performance?.open_rate ?? null,
    clickRate: campaign.performance?.click_rate ?? null,
  };
}
