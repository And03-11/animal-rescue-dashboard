import {
  CAMPAIGN_WIZARD_CSV_ERRORS,
  CAMPAIGN_WIZARD_VALIDATION_MESSAGES,
} from './campaignWizardState.ts';
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
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.audienceRequired]: 'audienceMatrix',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.tooManyAudiences]: 'audienceMatrix',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.audiencePreviewStale]: 'audienceMatrix',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.csvFileRequired]: 'csvFile',
  [CAMPAIGN_WIZARD_CSV_ERRORS.previewLoading]: 'csvFile',
  [CAMPAIGN_WIZARD_CSV_ERRORS.previewRequired]: 'csvFile',
  [CAMPAIGN_WIZARD_CSV_ERRORS.emailColumnRequired]: 'csvEmailColumn',
  [CAMPAIGN_WIZARD_CSV_ERRORS.nameColumnRequired]: 'csvNameColumn',
  [CAMPAIGN_WIZARD_CSV_ERRORS.columnsMustDiffer]: 'csvEmailColumn',
  [CAMPAIGN_WIZARD_CSV_ERRORS.invalidFile]: 'csvFile',
  [CAMPAIGN_WIZARD_CSV_ERRORS.readFailure]: 'csvFile',
  [CAMPAIGN_WIZARD_CSV_ERRORS.emptyFile]: 'csvFile',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderGroupRequired]: 'senderGroup',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderAccountsRequired]: 'senderAccounts',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.senderModeRequired]: 'senderMode',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.campaignNameRequired]: 'campaignName',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.subjectRequired]: 'subject',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.zeroRecipientSchedule]: 'schedule',
  [CAMPAIGN_WIZARD_VALIDATION_MESSAGES.bodyRequired]: 'emailBody',
});

export interface WizardValidationFocusPlan {
  target: WizardFocusTarget;
  viewMode?: 'code';
  fallbackTarget?: WizardFocusTarget;
}

export function focusPlanForValidationError(message: string): WizardValidationFocusPlan {
  const target = focusTargetForValidationError(message);
  return target === 'emailBody'
    ? { target, viewMode: 'code', fallbackTarget: 'errorAlert' }
    : { target };
}

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
  fallbackTarget?: WizardFocusTarget;
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
  fallbackTarget,
  isCurrent,
}: ScheduleWizardFocusOptions): () => void {
  let cancelled = false;
  const handle = scheduler.request(() => {
    if (cancelled || !isCurrent()) return;
    const root = getRoot();
    if (!root) return;
    const element = root.querySelector(`#${WIZARD_FOCUS_TARGET_IDS[target]}`);
    if (isWizardFocusable(element)) {
      element.focus();
      return;
    }
    if (!fallbackTarget || fallbackTarget === target) return;
    const fallback = root.querySelector(`#${WIZARD_FOCUS_TARGET_IDS[fallbackTarget]}`);
    if (isWizardFocusable(fallback)) fallback.focus();
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    scheduler.cancel(handle);
  };
}
