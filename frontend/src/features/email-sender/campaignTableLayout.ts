const CAMPAIGN_COLUMN_WEIGHTS = [26, 14, 14, 15, 8, 8, 15] as const;

export function allocateCampaignColumnWidths(containerWidth: number): number[] {
  const availableWidth = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  const totalWeight = CAMPAIGN_COLUMN_WEIGHTS.reduce((total, weight) => total + weight, 0);
  let allocatedWidth = 0;

  return CAMPAIGN_COLUMN_WEIGHTS.map((weight, index) => {
    if (index === CAMPAIGN_COLUMN_WEIGHTS.length - 1) {
      return availableWidth - allocatedWidth;
    }

    const width = (availableWidth * weight) / totalWeight;
    allocatedWidth += width;
    return width;
  });
}

export const campaignColumnPercentages = allocateCampaignColumnWidths(100)
  .map((width) => `${width}%`);

export type CampaignListLayout = 'cards' | 'table';

export function resolveCampaignListLayout(
  viewportWidth: number,
  zoomFactor = 1,
): CampaignListLayout {
  const normalizedWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const normalizedZoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  return normalizedWidth / normalizedZoom < 900 ? 'cards' : 'table';
}
