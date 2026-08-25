import { hydrateAudienceSelection, summarizeAudienceSelection } from './audienceSelection.ts';
import type { EmailCampaign } from './types';

export interface AudiencePresentation {
  label: string;
  detail: string;
  tooltip: string;
}

export function buildAudiencePresentation(campaign: EmailCampaign): AudiencePresentation {
  if (campaign.source_type === 'csv') {
    const label = campaign.csv_filename || 'CSV audience';
    return {
      label,
      detail: campaign.status === 'Draft' ? 'Upload pending' : 'File processed',
      tooltip: label,
    };
  }

  const audiences = hydrateAudienceSelection(campaign);
  return {
    label: summarizeAudienceSelection(audiences),
    detail: campaign.segment === 'dnr' ? 'Donors' : 'Not Donors',
    tooltip: audiences
      .map((audience) => (
        audience.region + ' · ' + (audience.is_bounced ? 'Bounced' : 'Valid')
      ))
      .join(', '),
  };
}
export interface AudienceTooltipProps {
  'aria-label': string;
  tabIndex: 0;
}

export function buildAudienceTooltipProps(
  presentation: AudiencePresentation,
): AudienceTooltipProps | null {
  if (!presentation.tooltip || presentation.tooltip === presentation.label) {
    return null;
  }

  return {
    'aria-label': 'Audience branches: ' + presentation.tooltip,
    tabIndex: 0,
  };
}
export interface AudienceLabelProps {
  title: string;
}

export function buildAudienceLabelProps(
  presentation: AudiencePresentation,
): AudienceLabelProps {
  return { title: presentation.tooltip || presentation.label };
}