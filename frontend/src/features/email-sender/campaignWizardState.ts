import {
  hydrateAudienceSelection,
  normalizeAudienceSelection,
} from './audienceSelection.ts';
import type {
  AirtableAudience,
  AudiencePreview,
  AudienceSegment,
  CampaignFormData,
  CampaignSource,
  SelectedAccount,
} from './types.ts';

export type CampaignWizardStep = 0 | 1 | 2;
export type CampaignSenderMode = 'all' | 'group' | 'manual';

export interface CampaignWizardDraft {
  sourceType: CampaignSource;
  audiences: AirtableAudience[];
  segment: AudienceSegment;
  audiencePreview: AudiencePreview | null;
  audiencePreviewStale: boolean;
  audiencePreviewKey?: string | null;
  senderMode: CampaignSenderMode;
  selectedGroup: string;
  selectedAccounts: SelectedAccount[];
  campaignName: string;
  subject: string;
  htmlBody: string;
  scheduledAt: string | null;
  csvFile: File | null;
  /** Existing campaign identifier; null/undefined means a new campaign. */
  campaignId?: string | null;
  /** Optional template identity kept by edit hydration for the wizard owner. */
  templateId?: string | number | null;
  /** Optional template object kept by edit hydration for consumers that use it. */
  template?: unknown;
  /** CSV mapping/preview state belongs to the wizard, but is not sent in the campaign payload. */
  csvPreview?: unknown;
  csvMapping?: unknown;
}

export type CampaignWizardPayload = Omit<CampaignFormData, 'csvFile'> & {
  csvFile?: File;
};

type HydrationInput = Partial<CampaignFormData> & {
  id?: string | null;
  campaignId?: string | null;
  campaign_id?: string | null;
  sourceType?: CampaignSource;
  campaignName?: string;
  htmlBody?: string;
  scheduledAt?: string | null;
  senderConfig?: string | string[] | SelectedAccount[];
  senderMode?: CampaignSenderMode;
  selectedGroup?: string;
  selectedAccounts?: SelectedAccount[];
  audiencePreview?: AudiencePreview | null;
  audience_preview?: AudiencePreview | null;
  audiencePreviewStale?: boolean;
  audience_preview_stale?: boolean;
  audiencePreviewKey?: string | null;
  audience_preview_key?: string | null;
  templateId?: string | number | null;
  template_id?: string | number | null;
  template?: unknown;
  csvPreview?: unknown;
  csvMapping?: unknown;
};

function cloneAccounts(accounts: readonly SelectedAccount[]): SelectedAccount[] {
  return accounts.map((account) => ({ id: account.id, group: account.group }));
}

function senderConfigForDraft(draft: CampaignWizardDraft): string | string[] {
  switch (draft.senderMode) {
    case 'group':
      return draft.selectedGroup;
    case 'manual':
      return draft.selectedAccounts.map(({ id }) => id);
    case 'all':
      return 'all';
  }
}

/** Compute the deterministic identity of the normalized Airtable selection and segment. */
export function computeAudiencePreviewKey(
  audiences: readonly AirtableAudience[],
  segment: AudienceSegment,
): string {
  const normalized = normalizeAudienceSelection(audiences);
  return JSON.stringify({ audiences: normalized, segment });
}

function normalizeScheduledAt(value: string | null): string | null {
  return value?.trim() ? value : null;
}

function hasZeroFreshPreview(draft: CampaignWizardDraft): boolean {
  return draft.audiencePreview?.total_unique === 0 && !draft.audiencePreviewStale;
}

/** Validate only the fields owned by one wizard step. Returns null when valid. */
export function validateWizardStep(
  step: CampaignWizardStep,
  draft: CampaignWizardDraft,
): string | null {
  if (step === 0) {
    if (draft.sourceType === 'airtable') {
      const audiences = normalizeAudienceSelection(draft.audiences);
      if (audiences.length === 0) {
        return 'Select at least one Airtable audience.';
      }
      if (audiences.length > 4) {
        return 'Select no more than four Airtable audiences.';
      }
      if (
        !draft.audiencePreview
        || draft.audiencePreviewStale
        || draft.audiencePreviewKey !== computeAudiencePreviewKey(audiences, draft.segment)
      ) {
        return 'Refresh the Airtable audience preview before continuing.';
      }
      return null;
    }

    if (!draft.campaignId && !draft.csvFile) {
      return 'Please select a CSV file.';
    }
    return null;
  }

  if (step === 1) {
    if (draft.senderMode === 'group' && !draft.selectedGroup.trim()) {
      return 'Select a sender group.';
    }
    if (draft.senderMode === 'manual' && draft.selectedAccounts.length === 0) {
      return 'Select at least one sender account.';
    }
    if (draft.senderMode !== 'all' && draft.senderMode !== 'group' && draft.senderMode !== 'manual') {
      return 'Select a sender mode.';
    }
    if (!draft.campaignName.trim()) {
      return 'Campaign name is required.';
    }
    if (!draft.subject.trim()) {
      return 'Email subject is required.';
    }
    if (normalizeScheduledAt(draft.scheduledAt) && hasZeroFreshPreview(draft)) {
      return 'Cannot schedule a campaign with zero recipients.';
    }
    return null;
  }

  if (!draft.htmlBody.trim()) {
    return 'Email body is required.';
  }
  return null;
}

/** Clear a preview after any audience or segment mutation without mutating the draft. */
export function invalidateAudiencePreview(draft: CampaignWizardDraft): CampaignWizardDraft {
  return {
    ...draft,
    audiences: normalizeAudienceSelection(draft.audiences),
    selectedAccounts: cloneAccounts(draft.selectedAccounts),
    audiencePreview: null,
    audiencePreviewKey: null,
    audiencePreviewStale: true,
  };
}

/** Build the API campaign form without leaking legacy Airtable fields into new branches. */
export function buildCampaignPayload(draft: CampaignWizardDraft): CampaignWizardPayload {
  const payload: CampaignWizardPayload = {
    campaign_name: draft.campaignName,
    source_type: draft.sourceType,
    subject: draft.subject,
    html_body: draft.htmlBody,
    sender_config: senderConfigForDraft(draft),
    scheduled_at: normalizeScheduledAt(draft.scheduledAt),
  };

  if (draft.sourceType === 'airtable') {
    payload.audiences = normalizeAudienceSelection(draft.audiences);
    payload.segment = draft.segment;
  } else if (!draft.campaignId && draft.csvFile) {
    payload.csvFile = draft.csvFile;
  }

  return payload;
}

function readAudiences(input: HydrationInput): AirtableAudience[] {
  if (Object.prototype.hasOwnProperty.call(input, 'audiences')) {
    return hydrateAudienceSelection({
      audiences: input.audiences,
      region: input.region,
      is_bounced: input.is_bounced,
    });
  }
  return hydrateAudienceSelection({ region: input.region, is_bounced: input.is_bounced });
}

function readSender(input: HydrationInput): {
  senderMode: CampaignSenderMode;
  selectedGroup: string;
  selectedAccounts: SelectedAccount[];
} {
  const config = input.senderConfig ?? input.sender_config;
  if (Array.isArray(config)) {
    const selectedAccounts = config.map((account) => (
      typeof account === 'string'
        ? { id: account, group: '' }
        : { id: account.id, group: account.group ?? '' }
    ));
    return { senderMode: 'manual', selectedGroup: '', selectedAccounts };
  }
  if (typeof config === 'string' && config && config !== 'all') {
    return { senderMode: 'group', selectedGroup: config, selectedAccounts: [] };
  }
  return {
    senderMode: input.senderMode === 'group' || input.senderMode === 'manual' ? input.senderMode : 'all',
    selectedGroup: input.senderMode === 'group' ? input.selectedGroup ?? '' : '',
    selectedAccounts: input.senderMode === 'manual' ? cloneAccounts(input.selectedAccounts ?? []) : [],
  };
}

/** Hydrate both current multi-branch campaigns and legacy one-region campaigns into a pure draft. */
export function hydrateCampaignWizardDraft(input: HydrationInput): CampaignWizardDraft {
  const sourceType = input.sourceType ?? input.source_type ?? 'airtable';
  const sender = readSender(input);
  const audiencePreview = input.audiencePreview ?? input.audience_preview ?? null;
  const hydrated: CampaignWizardDraft = {
    sourceType,
    audiences: sourceType === 'airtable' ? readAudiences(input) : [],
    segment: input.segment === 'dnr' ? 'dnr' : 'standard',
    audiencePreview,
    audiencePreviewStale: input.audiencePreviewStale
      ?? input.audience_preview_stale
      ?? (sourceType === 'airtable' && audiencePreview === null),
    audiencePreviewKey: input.audiencePreviewKey ?? input.audience_preview_key ?? null,
    senderMode: sender.senderMode,
    selectedGroup: sender.selectedGroup,
    selectedAccounts: sender.selectedAccounts,
    campaignName: input.campaignName ?? input.campaign_name ?? '',
    subject: input.subject ?? '',
    htmlBody: input.htmlBody ?? input.html_body ?? '',
    scheduledAt: normalizeScheduledAt(input.scheduledAt ?? input.scheduled_at ?? null),
    csvFile: input.csvFile ?? null,
  };

  const campaignId = input.campaignId ?? input.campaign_id ?? input.id;
  if (campaignId !== undefined) hydrated.campaignId = campaignId;
  const templateId = input.templateId ?? input.template_id;
  if (templateId !== undefined) hydrated.templateId = templateId;
  if (input.template !== undefined) hydrated.template = input.template;
  if (input.csvPreview !== undefined) hydrated.csvPreview = input.csvPreview;
  if (input.csvMapping !== undefined) hydrated.csvMapping = input.csvMapping;
  return hydrated;
}
