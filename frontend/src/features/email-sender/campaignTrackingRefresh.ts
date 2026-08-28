import type { EmailCampaign } from './types';

export const TRACKING_METRICS_REFRESH_INTERVAL_MS = 5000;

export interface TrackingRefreshLock {
  current: boolean;
}

export async function runExclusiveRefresh(
  lock: TrackingRefreshLock,
  refresh: () => Promise<unknown>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await refresh();
    return true;
  } finally {
    lock.current = false;
  }
}

export function shouldPollCampaignList(campaigns: EmailCampaign[]): boolean {
  return campaigns.some(
    (campaign) => campaign.status === 'Sending' || campaign.click_tracking_enabled === true,
  );
}

export function shouldPollCampaignReport(
  status: string | undefined,
  clickTrackingEnabled: boolean | undefined,
): boolean {
  return status === 'Sending' || clickTrackingEnabled === true;
}

export function canRefreshTrackingMetrics(
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === 'visible';
}
