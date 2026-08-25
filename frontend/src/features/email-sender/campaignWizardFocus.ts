import type { CampaignWizardStep } from './campaignWizardState.ts';

export const WIZARD_FOCUS_TARGET_IDS = {
  stepAudience: 'campaign-wizard-step-audience',
  stepSetup: 'campaign-wizard-step-setup',
  stepContent: 'campaign-wizard-step-content',
  audienceMatrix: 'campaign-wizard-audience-matrix',
  csvFile: 'campaign-wizard-csv-file',
  csvEmailColumn: 'campaign-wizard-csv-email-column',
  csvNameColumn: 'campaign-wizard-csv-name-column',
  senderMode: 'campaign-wizard-sender-mode',
  senderGroup: 'campaign-wizard-sender-group',
  senderAccounts: 'campaign-wizard-sender-accounts',
  campaignName: 'campaign-wizard-campaign-name',
  subject: 'campaign-wizard-subject',
  schedule: 'campaign-wizard-schedule',
  emailBody: 'campaign-wizard-email-body',
  errorAlert: 'campaign-wizard-error-alert',
  hydrationAlert: 'campaign-wizard-hydration-alert',
} as const;

export type WizardFocusTarget = keyof typeof WIZARD_FOCUS_TARGET_IDS;

export const VALIDATION_FOCUS_TARGETS: Readonly<Record<string, WizardFocusTarget>> = Object.freeze({
  'Select at least one Airtable audience.': 'audienceMatrix',
  'Select no more than four Airtable audiences.': 'audienceMatrix',
  'Refresh the Airtable audience preview before continuing.': 'audienceMatrix',
  'Please select a CSV file.': 'csvFile',
  'Wait for the CSV preview to finish loading.': 'csvFile',
  'The CSV must be previewed before continuing.': 'csvFile',
  'Select the column containing email addresses.': 'csvEmailColumn',
  'Select the column containing recipient names.': 'csvNameColumn',
  'Email and name must be mapped to different columns.': 'csvEmailColumn',
  'Select a sender group.': 'senderGroup',
  'Select at least one sender account.': 'senderAccounts',
  'Select a sender mode.': 'senderMode',
  'Campaign name is required.': 'campaignName',
  'Email subject is required.': 'subject',
  'Cannot schedule a campaign with zero recipients.': 'schedule',
  'Email body is required.': 'emailBody',
});

const STEP_FOCUS_TARGETS: Readonly<Record<CampaignWizardStep, WizardFocusTarget>> = {
  0: 'stepAudience',
  1: 'stepSetup',
  2: 'stepContent',
};

export function focusTargetForValidationError(message: string): WizardFocusTarget {
  return VALIDATION_FOCUS_TARGETS[message] ?? 'errorAlert';
}

export function focusTargetForStep(step: CampaignWizardStep): WizardFocusTarget {
  return STEP_FOCUS_TARGETS[step];
}

export interface WizardFocusable {
  focus: () => void;
}

export interface WizardFocusRoot {
  querySelector: (selector: string) => unknown;
}

export interface WizardFocusScheduler {
  request: (callback: () => void) => unknown;
  cancel: (handle: unknown) => void;
}

export interface ScheduleWizardFocusOptions {
  scheduler: WizardFocusScheduler;
  getRoot: () => WizardFocusRoot | null;
  target: WizardFocusTarget;
  isCurrent: () => boolean;
}

function isWizardFocusable(value: unknown): value is WizardFocusable {
  return value !== null
    && typeof value === 'object'
    && 'focus' in value
    && typeof value.focus === 'function';
}

/**
 * Queue focus until React has committed the next wizard step or alert.
 * The caller owns the root, so lookup never escapes the active Dialog.
 */
export function scheduleWizardFocus({
  scheduler,
  getRoot,
  target,
  isCurrent,
}: ScheduleWizardFocusOptions): () => void {
  let cancelled = false;
  const handle = scheduler.request(() => {
    if (cancelled || !isCurrent()) return;
    const targetId = WIZARD_FOCUS_TARGET_IDS[target];
    const element = getRoot()?.querySelector(`#${targetId}`);
    if (isWizardFocusable(element)) element.focus();
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    scheduler.cancel(handle);
  };
}
