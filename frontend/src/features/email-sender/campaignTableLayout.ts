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
