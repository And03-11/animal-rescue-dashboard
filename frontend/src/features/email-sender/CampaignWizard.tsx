import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import axios from 'axios';
import apiClient from '../../api/axiosConfig';
import {
  buildCampaignPayload,
  summarizeTestDeliveryResponse,
  computeAudiencePreviewKey,
  createSuggestedCsvMapping,
  hydrateCampaignWizardDraft,
  invalidateAudiencePreview,
  isCsvColumnMapping,
  validateCsvMapping,
  validateWizardStep,
} from './campaignWizardState';
import type {
  CampaignWizardDraft,
  CampaignWizardPayload,
  CampaignWizardStep,
} from './campaignWizardState';
import {
  focusPlanForValidationError,
  focusTargetForStep,
  scheduleWizardFocus,
  WIZARD_FOCUS_TARGET_IDS,
} from './campaignWizardFocus';
import type {
  WizardFocusScheduler,
  WizardFocusTarget,
} from './campaignWizardFocus';
import { AudienceStep } from './AudienceStep';
import { CampaignSetupStep } from './CampaignSetupStep';
import { WizardSessionLifecycle } from './campaignWizardOrchestration';
import type { WizardSessionHandle } from './campaignWizardOrchestration';
import { ContentReviewStep } from './ContentReviewStep';
import type {
  AudiencePreview,
  CampaignFormData,
  CsvColumnMapping,
  CsvPreview,
  EmailTemplate,
  SenderOptions,
} from './types';

const DEFAULT_HTML = '<h1>New Campaign</h1>\n<p>Write your content here.</p>';
const STEPS = ['Audience', 'Campaign setup', 'Content & review'];

function isAbortError(error: unknown): boolean {
  return axios.isCancel(error)
    || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')
    || (error instanceof DOMException && error.name === 'AbortError');
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data && typeof data === 'object') {
      const detail = 'detail' in data ? data.detail : undefined;
      const message = 'message' in data ? data.message : undefined;
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

interface CampaignDetailsEnvelope {
  details: Partial<CampaignFormData> & {
    id?: string;
    mapping?: unknown;
    target_count?: number;
  };
}

export interface CampaignWizardProps {
  open: boolean;
  initialCampaignId?: string | null;
  onClose: () => void;
  onSave: (
    campaign: CampaignWizardPayload,
    mapping?: CsvColumnMapping,
    signal?: AbortSignal,
  ) => Promise<void> | void;
}

function createInitialDraft(campaignId?: string | null): CampaignWizardDraft {
  return hydrateCampaignWizardDraft({
    campaignId: campaignId ?? null,
    source_type: 'airtable',
    audiences: [{ region: 'USA', is_bounced: false }],
    segment: 'standard',
    sender_config: 'all',
    campaign_name: '',
    subject: '',
    html_body: DEFAULT_HTML,
    scheduled_at: null,
    csvFile: null,
  });
}

export function CampaignWizard({
  open,
  initialCampaignId = null,
  onClose,
  onSave,
}: CampaignWizardProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeStep, setActiveStep] = useState<CampaignWizardStep>(0);
  const [draft, setDraft] = useState<CampaignWizardDraft>(() => createInitialDraft(initialCampaignId));
  const [senderOptions, setSenderOptions] = useState<SenderOptions>({ groups: [], accounts: [] });
  const [loadingSenders, setLoadingSenders] = useState(true);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [loadingCampaign, setLoadingCampaign] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [csvPreviewLoading, setCsvPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hydrationStatus, setHydrationStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sessionLifecycleRef = useRef(new WizardSessionLifecycle());
  const activeSessionRef = useRef<WizardSessionHandle | null>(null);
  const activeSessionCampaignIdRef = useRef<string | null | undefined>(undefined);
  const dialogPaperRef = useRef<HTMLDivElement | null>(null);
  const cancelPendingFocusRef = useRef<() => void>(() => {});
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isSessionCurrent = useCallback((session: WizardSessionHandle) => (
    sessionLifecycleRef.current.isCurrent(session)
  ), []);

  const getActiveSession = useCallback(() => {
    const session = activeSessionRef.current;
    return session && sessionLifecycleRef.current.isCurrent(session) ? session : null;
  }, []);

  const cancelPendingFocus = useCallback(() => {
    cancelPendingFocusRef.current();
    cancelPendingFocusRef.current = () => {};
  }, []);

  const requestFocus = useCallback((
    target: WizardFocusTarget,
    expectedSession?: WizardSessionHandle | null,
    fallbackTarget?: WizardFocusTarget,
  ) => {
    cancelPendingFocus();
    const session = expectedSession ?? getActiveSession();
    if (!session || typeof window === 'undefined') return;

    const scheduler: WizardFocusScheduler = {
      request: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle as number),
    };
    cancelPendingFocusRef.current = scheduleWizardFocus({
      scheduler,
      getRoot: () => dialogPaperRef.current,
      target,
      fallbackTarget,
      isCurrent: () => sessionLifecycleRef.current.isCurrent(session),
    });
  }, [cancelPendingFocus, getActiveSession]);

  const showValidationError = useCallback((
    message: string,
    session?: WizardSessionHandle | null,
  ) => {
    const focusPlan = focusPlanForValidationError(message);
    setError(message);
    if (focusPlan.viewMode) setViewMode(focusPlan.viewMode);
    requestFocus(focusPlan.target, session, focusPlan.fallbackTarget);
  }, [requestFocus]);

  const clearError = useCallback(() => setError(null), []);

  const showAsyncError = useCallback((
    message: string,
    session?: WizardSessionHandle | null,
  ) => {
    setError(message);
    requestFocus('errorAlert', session);
  }, [requestFocus]);

  const transitionToStep = useCallback((
    step: CampaignWizardStep,
    session?: WizardSessionHandle | null,
  ) => {
    setActiveStep(step);
    requestFocus(focusTargetForStep(step), session);
  }, [requestFocus]);

  useEffect(() => cancelPendingFocus, [cancelPendingFocus]);

  useEffect(() => {
    const lifecycle = sessionLifecycleRef.current;
    if (!open) {
      cancelPendingFocus();
      lifecycle.abort();
      activeSessionRef.current = null;
      activeSessionCampaignIdRef.current = undefined;
      return;
    }

    cancelPendingFocus();
    const session = lifecycle.begin();
    activeSessionRef.current = session;
    const isCurrent = () => lifecycle.isCurrent(session);
    const campaignId = initialCampaignId ?? null;
    activeSessionCampaignIdRef.current = campaignId;
    setDraft(createInitialDraft(campaignId));
    setActiveStep(0);
    setViewMode('code');
    setError(null);
    setSuccessMessage(null);
    setHydrationError(null);
    setHydrationStatus(campaignId ? 'loading' : 'ready');
    setTemplates([]);
    setSenderOptions({ groups: [], accounts: [] });
    setCsvPreviewLoading(false);
    setPreviewLoading(false);
    setSaving(false);
    setSendingTest(false);

    setLoadingSenders(true);
    void apiClient.get<SenderOptions>('/sender/credentials', {
      signal: session.signal,
      timeout: 15_000,
    }).then((response) => {
      if (isCurrent()) setSenderOptions(response.data);
    }).catch((requestError: unknown) => {
      if (isCurrent() && !isAbortError(requestError)) {
        setError(getApiErrorMessage(requestError, 'Failed to load sender account options.'));
      }
    }).finally(() => {
      if (isCurrent()) setLoadingSenders(false);
    });

    void apiClient.get<EmailTemplate[]>('/templates', {
      signal: session.signal,
      timeout: 15_000,
    }).then((response) => {
      if (isCurrent()) setTemplates(response.data);
    }).catch((requestError: unknown) => {
      if (isCurrent() && !isAbortError(requestError)) {
        setError(getApiErrorMessage(requestError, 'Failed to load email templates.'));
      }
    });

    if (!campaignId) {
      setLoadingCampaign(false);
      return () => {
        cancelPendingFocus();
        if (lifecycle.isCurrent(session)) lifecycle.abort();
      };
    }

    setLoadingCampaign(true);
    void apiClient.get<CampaignDetailsEnvelope>(`/sender/campaigns/${campaignId}/details`, {
      signal: session.signal,
      timeout: 15_000,
    }).then(async (response) => {
      if (!isCurrent()) return;
      const details = response.data.details;
      let csvPreview: CsvPreview | undefined;
      if (details.source_type === 'csv') {
        setCsvPreviewLoading(true);
        try {
          const previewResponse = await apiClient.get<CsvPreview>(
            `/sender/campaigns/${campaignId}/csv-preview`,
            { signal: session.signal, timeout: 15_000 },
          );
          if (isCurrent()) csvPreview = previewResponse.data;
        } catch (requestError: unknown) {
          if (isCurrent() && !isAbortError(requestError)) {
            showAsyncError(
              getApiErrorMessage(requestError, 'Failed to load the existing CSV preview.'),
              session,
            );
          }
        } finally {
          if (isCurrent()) setCsvPreviewLoading(false);
        }
      }

      if (!isCurrent()) return;
      setDraft(hydrateCampaignWizardDraft({
        ...details,
        campaignId,
        csvPreview,
        csvMapping: isCsvColumnMapping(details.mapping)
          ? details.mapping
          : csvPreview ? createSuggestedCsvMapping(csvPreview) : undefined,
      }));
      setHydrationStatus('ready');
      setHydrationError(null);
    }).catch((requestError: unknown) => {
      if (!isCurrent() || isAbortError(requestError)) return;
      const message = getApiErrorMessage(requestError, 'Campaign details could not be loaded.');
      setHydrationError(message);
      setHydrationStatus('failed');
      setError(null);
      requestFocus('hydrationAlert', session);
    }).finally(() => {
      if (isCurrent()) setLoadingCampaign(false);
    });

    return () => {
      cancelPendingFocus();
      if (lifecycle.isCurrent(session)) lifecycle.abort();
    };
  }, [cancelPendingFocus, initialCampaignId, loadAttempt, open, requestFocus, showAsyncError]);

  const handleClose = useCallback(() => {
    cancelPendingFocus();
    sessionLifecycleRef.current.abort();
    activeSessionRef.current = null;
    activeSessionCampaignIdRef.current = undefined;
    setHydrationStatus('idle');
    onClose();
  }, [cancelPendingFocus, onClose]);

  const handleRetryHydration = useCallback(() => {
    sessionLifecycleRef.current.abort();
    cancelPendingFocus();
    activeSessionRef.current = null;
    activeSessionCampaignIdRef.current = undefined;
    setHydrationError(null);
    setHydrationStatus('loading');
    setLoadingCampaign(true);
    setLoadAttempt((attempt) => attempt + 1);
  }, [cancelPendingFocus]);
  useEffect(() => {
    if (loadingSenders || senderOptions.accounts.length === 0) return;
    setDraft((current) => {
      if (current.senderMode !== 'manual' || current.selectedAccounts.length === 0) return current;
      let changed = false;
      const selectedAccounts = current.selectedAccounts.map((account) => {
        if (account.group && account.group !== 'Unknown') return account;
        const matchingAccount = senderOptions.accounts.find((option) => option.id === account.id);
        if (!matchingAccount) return account;
        changed = true;
        return matchingAccount;
      });
      return changed ? { ...current, selectedAccounts } : current;
    });
  }, [loadingSenders, senderOptions.accounts]);

  const patchDraft = useCallback((patch: Partial<CampaignWizardDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const patchAudienceDraft = useCallback((patch: Partial<CampaignWizardDraft>) => {
    setError(null);
    setDraft((current) => {
      const next = { ...current, ...patch };
      const mutatesAirtableSelection = Object.prototype.hasOwnProperty.call(patch, 'audiences')
        || Object.prototype.hasOwnProperty.call(patch, 'segment')
        || (Object.prototype.hasOwnProperty.call(patch, 'sourceType') && next.sourceType === 'airtable');
      if (mutatesAirtableSelection) return invalidateAudiencePreview(next);
      return next;
    });
  }, []);

  const requestAudiencePreview = async () => {
    const session = getActiveSession();
    if (!session) return;
    const requestedKey = computeAudiencePreviewKey(draft.audiences, draft.segment);
    const selectionError = validateWizardStep(0, {
      ...draft,
      audiencePreview: draft.audiencePreview ?? { branches: [], total_unique: 0 },
      audiencePreviewStale: false,
      audiencePreviewKey: requestedKey,
    });
    if (selectionError) {
      showValidationError(selectionError, session);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const response = await apiClient.post<AudiencePreview>(
        '/sender/audience-preview',
        { audiences: draft.audiences, segment: draft.segment },
        { timeout: 15_000, signal: session.signal },
      );
      if (!isSessionCurrent(session)) return;
      const current = draftRef.current;
      if (computeAudiencePreviewKey(current.audiences, current.segment) !== requestedKey) {
        showAsyncError(
          'The audience changed while the preview was loading. Continue again to refresh it.',
          session,
        );
        return;
      }
      setDraft((currentDraft) => ({
        ...currentDraft,
        audiencePreview: response.data,
        audiencePreviewStale: false,
        audiencePreviewKey: requestedKey,
      }));
      transitionToStep(1, session);
    } catch (requestError: unknown) {
      if (isSessionCurrent(session) && !isAbortError(requestError)) {
        showAsyncError(
          getApiErrorMessage(requestError, 'Failed to preview the Airtable audience.'),
          session,
        );
      }
    } finally {
      if (isSessionCurrent(session)) setPreviewLoading(false);
    }
  };
  const handleContinue = async () => {
    if (hydrationStatus !== 'ready') return;
    setError(null);
    if (activeStep === 0) {
      if (draft.sourceType === 'airtable') {
        await requestAudiencePreview();
        return;
      }
      const validationError = validateWizardStep(0, draft) ?? validateCsvMapping(draft, csvPreviewLoading);
      if (validationError) {
        showValidationError(validationError);
        return;
      }
      transitionToStep(1);
      return;
    }

    const validationError = validateWizardStep(activeStep, draft);
    if (validationError) {
      showValidationError(validationError);
      return;
    }
    transitionToStep((activeStep + 1) as CampaignWizardStep);
  };

  const handleSave = async () => {
    if (hydrationStatus !== 'ready') return;
    const validationError = validateWizardStep(2, draft);
    if (validationError) {
      showValidationError(validationError);
      return;
    }

    const session = getActiveSession();
    if (!session) return;
    const mapping = draft.sourceType === 'csv' && isCsvColumnMapping(draft.csvMapping)
      ? draft.csvMapping
      : undefined;
    setSaving(true);
    setError(null);
    try {
      await onSave(buildCampaignPayload(draft), mapping, session.signal);
    } catch (saveError: unknown) {
      if (isSessionCurrent(session) && !isAbortError(saveError)) {
        showAsyncError(
          getApiErrorMessage(saveError, 'Failed to save campaign.'),
          session,
        );
      }
    } finally {
      if (isSessionCurrent(session)) setSaving(false);
    }
  };
  const handleLoadTemplate = (templateId: string) => {
    if (!templateId) {
      patchDraft({ htmlBody: DEFAULT_HTML, templateId: null });
      return;
    }
    const template = templates.find((item) => item.id === Number(templateId));
    if (template?.content) {
      patchDraft({ htmlBody: template.content, templateId: template.id, template });
      return;
    }

    const session = getActiveSession();
    if (!session) return;
    patchDraft({ templateId: Number(templateId) });
    void apiClient.get<EmailTemplate>(`/templates/${templateId}`, {
      timeout: 15_000,
      signal: session.signal,
    }).then((response) => {
      if (!isSessionCurrent(session)) return;
      patchDraft({
        htmlBody: response.data.content,
        templateId: response.data.id,
        template: response.data,
      });
    }).catch((requestError: unknown) => {
      if (isSessionCurrent(session) && !isAbortError(requestError)) {
        showAsyncError(
          getApiErrorMessage(requestError, 'Failed to load template content.'),
          session,
        );
      }
    });
  };
  const handleSaveTemplate = async (name: string) => {
    const session = getActiveSession();
    if (!session) return;
    setError(null);
    try {
      const response = await apiClient.post<EmailTemplate>('/templates', {
        name,
        content: draftRef.current.htmlBody,
      }, { timeout: 15_000, signal: session.signal });
      if (!isSessionCurrent(session)) return;
      setTemplates((current) => [response.data, ...current]);
      setSuccessMessage(`Template “${response.data.name}” saved.`);
    } catch (requestError: unknown) {
      if (!isSessionCurrent(session) || isAbortError(requestError)) return;
      setError(getApiErrorMessage(requestError, 'Failed to save template.'));
      throw requestError;
    }
  };
  const handleSendTest = async (emails: string[]) => {
    const session = getActiveSession();
    if (!session) return;
    const current = draftRef.current;
    const senderConfig = buildCampaignPayload(current).sender_config;
    setSendingTest(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        emails,
        subject: current.subject,
        html_body: current.htmlBody,
        sender_config: senderConfig,
      };
      const response = await apiClient.post<unknown>(
        current.campaignId
          ? `/sender/campaigns/${current.campaignId}/send-test`
          : '/sender/send-test-adhoc',
        payload,
        { timeout: 30_000, signal: session.signal },
      );
      if (!isSessionCurrent(session)) return;
      const summary = summarizeTestDeliveryResponse(response.data);
      if (summary.isCompleteSuccess) {
        setSuccessMessage(summary.message);
      } else {
        setError(summary.message);
      }
    } catch (requestError: unknown) {
      if (!isSessionCurrent(session) || isAbortError(requestError)) return;
      if (axios.isAxiosError(requestError) && requestError.response?.data) {
        const summary = summarizeTestDeliveryResponse(requestError.response.data);
        if (summary.failed > 0) {
          setError(summary.message);
          return;
        }
      }
      setError(getApiErrorMessage(requestError, 'Failed to send test emails.'));
      throw requestError;
    } finally {
      if (isSessionCurrent(session)) setSendingTest(false);
    }
  };
  const hydrationReady = (
    open
    && hydrationStatus === 'ready'
    && activeSessionCampaignIdRef.current === (initialCampaignId ?? null)
    && getActiveSession() !== null
  );
  const isBusy = !hydrationReady || loadingCampaign || previewLoading || saving;
  const finalActionLabel = draft.scheduledAt ? 'Schedule campaign' : 'Save draft';
  const finalActionHint = draft.scheduledAt
    ? `Delivery will be scheduled for ${new Date(draft.scheduledAt).toLocaleString()}.`
    : draft.sourceType === 'airtable' && draft.audiencePreview?.total_unique === 0
      ? 'No eligible recipients. Save as Draft or go back and change the audience.'
      : 'The campaign will remain a Draft until you launch it.';

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        fullScreen={fullScreen}
        maxWidth="lg"
        scroll="paper"
        aria-labelledby="campaign-wizard-title"
        slotProps={{
          paper: {
            ref: dialogPaperRef,
            sx: {
              maxHeight: fullScreen ? '100%' : 'min(880px, calc(100% - 32px))',
              minWidth: 0,
              m: fullScreen ? 0 : undefined,
            },
          },
        }}
      >
        <DialogTitle
          id="campaign-wizard-title"
          component="div"
          sx={{ flex: '0 0 auto', borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}
        >
          <Typography variant="h5" component="h1">
            {initialCampaignId ? 'Edit campaign' : 'Create campaign'}
          </Typography>
          <Stepper
            activeStep={activeStep}
            orientation={fullScreen ? 'vertical' : 'horizontal'}
            sx={{
              mt: 2,
              minWidth: 0,
              '& .MuiStepLabel-label': { whiteSpace: 'normal' },
              '& .MuiStep-root': { minWidth: 0 },
            }}
          >
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </DialogTitle>

        <DialogContent sx={{ overflowY: 'auto', minWidth: 0, px: { xs: 2, sm: 3 }, py: 3 }}>
          {loadingCampaign ? (
            <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}>
              <Box sx={{ textAlign: 'center' }}>
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Loading campaign…
                </Typography>
              </Box>
            </Box>
          ) : hydrationStatus === 'failed' ? (
            <Box sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
              <Alert
                id={WIZARD_FOCUS_TARGET_IDS.hydrationAlert}
                role="alert"
                tabIndex={-1}
                severity="error"
                action={(
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Button color="inherit" size="small" onClick={handleRetryHydration}>Retry</Button>
                    <Button color="inherit" size="small" onClick={handleClose}>Close</Button>
                  </Box>
                )}
                sx={{ width: '100%', maxWidth: 680 }}
              >
                <Typography variant="subtitle2">Campaign could not be loaded.</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {hydrationError ?? 'Retry the load or close this wizard.'}
                </Typography>
              </Alert>
            </Box>
          ) : (
            <>
              {activeStep > 0 && error && (
                <Alert
                  id={WIZARD_FOCUS_TARGET_IDS.errorAlert}
                  role="alert"
                  tabIndex={-1}
                  severity="error"
                  sx={{ mb: 3 }}
                >
                  {error}
                </Alert>
              )}
              {activeStep === 0 && (
                <Box
                  component="section"
                  id={WIZARD_FOCUS_TARGET_IDS.stepAudience}
                  tabIndex={-1}
                  aria-label={STEPS[activeStep]}
                  sx={{
                    minWidth: 0,
                    outline: 'none',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
                  }}
                >
                  <AudienceStep
                    draft={draft}
                    previewLoading={previewLoading}
                    csvPreviewLoading={csvPreviewLoading}
                    error={error}
                    onDraftChange={patchAudienceDraft}
                    onErrorClear={clearError}
                    onCsvError={showValidationError}
                    onCsvPreviewLoadingChange={setCsvPreviewLoading}
                  />
                </Box>
              )}
              {activeStep === 1 && (
                <Box
                  component="section"
                  id={WIZARD_FOCUS_TARGET_IDS.stepSetup}
                  tabIndex={-1}
                  aria-label={STEPS[activeStep]}
                  sx={{
                    minWidth: 0,
                    outline: 'none',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
                  }}
                >
                  <CampaignSetupStep
                    draft={draft}
                    senderOptions={senderOptions}
                    loadingSenders={loadingSenders}
                    onDraftChange={patchDraft}
                  />
                </Box>
              )}
              {activeStep === 2 && hydrationReady && (
                <Box
                  component="section"
                  id={WIZARD_FOCUS_TARGET_IDS.stepContent}
                  tabIndex={-1}
                  aria-label={STEPS[activeStep]}
                  sx={{
                    minWidth: 0,
                    outline: 'none',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
                  }}
                >
                  <ContentReviewStep
                    draft={draft}
                    templates={templates}
                    viewMode={viewMode}
                    sendingTest={sendingTest}
                    onDraftChange={patchDraft}
                    onViewModeChange={setViewMode}
                    onLoadTemplate={handleLoadTemplate}
                    onSaveTemplate={handleSaveTemplate}
                    onSendTest={handleSendTest}
                  />
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            flex: '0 0 auto',
            borderTop: '1px solid',
            borderColor: 'divider',
            px: { xs: 2, sm: 3 },
            py: 2,
            gap: 1,
            alignItems: { xs: 'stretch', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            '& > :not(style) ~ :not(style)': { ml: 0 },
          }}
        >
          {activeStep === 2 && hydrationReady && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: { sm: 'auto' }, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {finalActionHint}
            </Typography>
          )}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'stretch', sm: 'flex-end' },
              ml: activeStep === 2 ? 0 : { sm: 'auto' },
              '& > button': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
            }}
          >
            <Button onClick={handleClose}>{hydrationStatus === 'failed' ? 'Close' : 'Cancel'}</Button>
            {activeStep > 0 && (
              <Button
                onClick={() => {
                  setError(null);
                  transitionToStep((activeStep - 1) as CampaignWizardStep);
                }}
                disabled={!hydrationReady || isBusy || sendingTest}
              >
                Back
              </Button>
            )}
            {activeStep < 2 ? (
              <Button
                variant="contained"
                onClick={() => void handleContinue()}
                disabled={!hydrationReady || isBusy || csvPreviewLoading || (activeStep === 1 && loadingSenders)}
                startIcon={previewLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {previewLoading ? 'Checking audience…' : 'Continue'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => void handleSave()}
                disabled={!hydrationReady || saving || sendingTest}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {saving ? 'Saving…' : finalActionLabel}
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
