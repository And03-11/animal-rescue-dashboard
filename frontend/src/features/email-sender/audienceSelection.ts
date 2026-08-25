import type { AirtableAudience } from './types';

export const AIRTABLE_AUDIENCES: AirtableAudience[] = [
  { region: 'USA', is_bounced: false },
  { region: 'USA', is_bounced: true },
  { region: 'EUR', is_bounced: false },
  { region: 'EUR', is_bounced: true },
];

const regionOrder: Record<AirtableAudience['region'], number> = {
  USA: 0,
  EUR: 1,
};

function branchKey(audience: AirtableAudience): string {
  return `${audience.region}:${audience.is_bounced ? 'bounced' : 'valid'}`;
}

function cloneAudience(audience: AirtableAudience): AirtableAudience {
  return { region: audience.region, is_bounced: audience.is_bounced };
}

/** Remove duplicate branches and apply the stable USA/EUR, valid/bounced order. */
export function normalizeAudienceSelection(
  selection: readonly AirtableAudience[],
): AirtableAudience[] {
  const unique = new Map<string, AirtableAudience>();
  for (const audience of selection) {
    const key = branchKey(audience);
    if (!unique.has(key)) {
      unique.set(key, cloneAudience(audience));
    }
  }

  return [...unique.values()].sort((left, right) => (
    regionOrder[left.region] - regionOrder[right.region]
    || Number(left.is_bounced) - Number(right.is_bounced)
  ));
}

export type AudienceShortcut = 'All' | 'USA' | 'EUR' | 'Valid' | 'Bounced' | 'Clear';

/** Replace the current selection with the exact branch set represented by a shortcut. */
export function applyAudienceShortcut(shortcut: AudienceShortcut): AirtableAudience[] {
  switch (shortcut) {
    case 'All':
      return normalizeAudienceSelection(AIRTABLE_AUDIENCES);
    case 'USA':
      return normalizeAudienceSelection(AIRTABLE_AUDIENCES.filter(({ region }) => region === 'USA'));
    case 'EUR':
      return normalizeAudienceSelection(AIRTABLE_AUDIENCES.filter(({ region }) => region === 'EUR'));
    case 'Valid':
      return normalizeAudienceSelection(AIRTABLE_AUDIENCES.filter(({ is_bounced }) => !is_bounced));
    case 'Bounced':
      return normalizeAudienceSelection(AIRTABLE_AUDIENCES.filter(({ is_bounced }) => is_bounced));
    case 'Clear':
      return [];
  }
}

/** Toggle one branch while retaining arbitrary subsets of the four branches. */
export function toggleAudience(
  selection: readonly AirtableAudience[],
  audience: AirtableAudience,
): AirtableAudience[] {
  const normalized = normalizeAudienceSelection(selection);
  const key = branchKey(audience);
  return normalized.some((item) => branchKey(item) === key)
    ? normalized.filter((item) => branchKey(item) !== key)
    : normalizeAudienceSelection([...normalized, audience]);
}

export interface LegacyAudienceSelection {
  audiences?: readonly AirtableAudience[];
  region?: string;
  is_bounced?: boolean;
}

/** Hydrate normalized audiences, falling back to legacy filters only when absent. */
export function hydrateAudienceSelection(
  campaign: LegacyAudienceSelection,
): AirtableAudience[] {
  if (campaign.audiences !== undefined) {
    return normalizeAudienceSelection(campaign.audiences);
  }

  if (
    (campaign.region === 'USA' || campaign.region === 'EUR')
    && typeof campaign.is_bounced === 'boolean'
  ) {
    return [{ region: campaign.region, is_bounced: campaign.is_bounced }];
  }

  return [];
}

/** Return the compact table/review label for a normalized audience selection. */
export function summarizeAudienceSelection(
  selection: readonly AirtableAudience[],
): string {
  const audiences = normalizeAudienceSelection(selection);
  if (audiences.length === 0) {
    return 'No Airtable audiences';
  }

  if (audiences.length === AIRTABLE_AUDIENCES.length) {
    return 'All Airtable audiences';
  }

  const first = audiences[0];
  if (audiences.length === 2 && first && audiences[1]?.region === first.region) {
    return `${first.region} · All email states`;
  }

  if (!first) {
    return 'No Airtable audiences';
  }

  const firstLabel = `${first.region} · ${first.is_bounced ? 'Bounced' : 'Valid'}`;
  return audiences.length === 1 ? firstLabel : `${firstLabel} +${audiences.length - 1}`;
}
