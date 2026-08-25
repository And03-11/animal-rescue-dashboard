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
