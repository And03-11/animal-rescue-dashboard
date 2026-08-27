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
  CsvColumnMapping,
  CsvPreview,
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

export const CAMPAIGN_WIZARD_VALIDATION_MESSAGES = Object.freeze({
  audienceRequired: 'Select at least one Airtable audience.',
  tooManyAudiences: 'Select no more than four Airtable audiences.',
  audiencePreviewStale: 'Refresh the Airtable audience preview before continuing.',
  csvFileRequired: 'Please select a CSV file.',
  senderGroupRequired: 'Select a sender group.',
  senderAccountsRequired: 'Select at least one sender account.',
  senderModeRequired: 'Select a sender mode.',
  campaignNameRequired: 'Campaign name is required.',
  subjectRequired: 'Email subject is required.',
  zeroRecipientSchedule: 'Cannot schedule a campaign with zero recipients.',
  bodyRequired: 'Email body is required.',
} as const);

export const CAMPAIGN_WIZARD_CSV_ERRORS = Object.freeze({
  previewLoading: 'Wait for the CSV preview to finish loading.',
  previewRequired: 'The CSV must be previewed before continuing.',
  emailColumnRequired: 'Select the column containing email addresses.',
  nameColumnRequired: 'Select the column containing recipient names.',
  columnsMustDiffer: 'Email and name must be mapped to different columns.',
  invalidFile: 'Please select a valid CSV file.',
  readFailure: 'The CSV file could not be read. Try another file.',
  emptyFile: 'CSV file is empty.',
} as const);

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

export function isCsvPreview(value: unknown): value is CsvPreview {
  if (!value || typeof value !== 'object') return false;
  const preview = value as Partial<CsvPreview>;
  return Array.isArray(preview.columns)
    && preview.columns.every((column) => typeof column === 'string')
    && Array.isArray(preview.preview_row)
    && preview.preview_row.every((cell) => typeof cell === 'string')
    && typeof preview.has_header === 'boolean';
}

export function isCsvColumnMapping(value: unknown): value is CsvColumnMapping {
  if (!value || typeof value !== 'object') return false;
  const mapping = value as Partial<CsvColumnMapping>;
  return typeof mapping.email === 'string'
    && typeof mapping.name === 'string'
    && typeof mapping.has_header === 'boolean';
}

export function createSuggestedCsvMapping(preview: CsvPreview): CsvColumnMapping {
  const columnsLower = preview.columns.map((column) => column.toLowerCase());
  const emailIndex = columnsLower.findIndex((column) => (
    column === 'email' || column === 'correo' || column.includes('mail')
  ));
  const nameIndex = columnsLower.findIndex((column) => (
    column === 'name'
    || column === 'nombre'
    || column.includes('first name')
    || column.includes('primer nombre')
    || column.includes('first')
  ));

  return {
    email: emailIndex >= 0 ? preview.columns[emailIndex] : '',
    name: nameIndex >= 0 ? preview.columns[nameIndex] : '',
    has_header: preview.has_header,
  };
}

export function validateCsvFileSelection(file: Pick<File, 'name' | 'type'>): string | null {
  return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
    ? null
    : CAMPAIGN_WIZARD_CSV_ERRORS.invalidFile;
}

export function validateCsvContent(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? null
    : CAMPAIGN_WIZARD_CSV_ERRORS.emptyFile;
}

export function validateCsvMapping(
  draft: CampaignWizardDraft,
  csvPreviewLoading: boolean,
): string | null {
  if (draft.sourceType !== 'csv') return null;
  if (csvPreviewLoading) return CAMPAIGN_WIZARD_CSV_ERRORS.previewLoading;

  const preview = isCsvPreview(draft.csvPreview) ? draft.csvPreview : null;
  const mapping = isCsvColumnMapping(draft.csvMapping) ? draft.csvMapping : null;
  if (!preview) {
    return draft.campaignId ? null : CAMPAIGN_WIZARD_CSV_ERRORS.previewRequired;
  }
  if (!mapping?.email) return CAMPAIGN_WIZARD_CSV_ERRORS.emailColumnRequired;
  if (!mapping.name) return CAMPAIGN_WIZARD_CSV_ERRORS.nameColumnRequired;
  if (mapping.email === mapping.name) return CAMPAIGN_WIZARD_CSV_ERRORS.columnsMustDiffer;
  return null;
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
        return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.audienceRequired;
      }
      if (audiences.length > 4) {
        return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.tooManyAudiences;
      }
      if (
        !draft.audiencePreview
        || draft.audiencePreviewStale
        || draft.audiencePreviewKey !== computeAudiencePreviewKey(audiences, draft.segment)
      ) {
        return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.audiencePreviewStale;
      }
      return null;
    }

    if (!draft.campaignId && !draft.csvFile) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.csvFileRequired;
    }
    return null;
  }

  if (step === 1) {
    if (draft.senderMode === 'group' && !draft.selectedGroup.trim()) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderGroupRequired;
    }
    if (draft.senderMode === 'manual' && draft.selectedAccounts.length === 0) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderAccountsRequired;
    }
    if (draft.senderMode !== 'all' && draft.senderMode !== 'group' && draft.senderMode !== 'manual') {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderModeRequired;
    }
    if (!draft.campaignName.trim()) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.campaignNameRequired;
    }
    if (!draft.subject.trim()) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.subjectRequired;
    }
    if (draft.sourceType === 'airtable' && normalizeScheduledAt(draft.scheduledAt) && hasZeroFreshPreview(draft)) {
      return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.zeroRecipientSchedule;
    }
    return null;
  }

  if (!draft.htmlBody.trim()) {
    return CAMPAIGN_WIZARD_VALIDATION_MESSAGES.bodyRequired;
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
