import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { EmailPreview } from '../../components/EmailPreview';
import { summarizeAudienceSelection } from './audienceSelection';
import type { CampaignWizardDraft } from './campaignWizardState';
import { WIZARD_FOCUS_TARGET_IDS } from './campaignWizardFocus';
import type { EmailTemplate } from './types';

export interface ContentReviewStepProps {
  draft: CampaignWizardDraft;
  templates: EmailTemplate[];
  viewMode: 'code' | 'preview';
  sendingTest: boolean;
  onDraftChange: (patch: Partial<CampaignWizardDraft>) => void;
  onViewModeChange: (mode: 'code' | 'preview') => void;
  onLoadTemplate: (templateId: string) => void;
  onSaveTemplate: (name: string) => Promise<void>;
  onSendTest: (emails: string[]) => Promise<void>;
}

function formatSchedule(scheduledAt: string | null): string {
  if (!scheduledAt) return 'Draft — no scheduled time';
  const value = new Date(scheduledAt);
  return Number.isNaN(value.getTime()) ? 'Schedule needs review' : value.toLocaleString();
}

export function ContentReviewStep({
  draft,
  templates,
  viewMode,
  sendingTest,
  onDraftChange,
  onViewModeChange,
  onLoadTemplate,
  onSaveTemplate,
  onSendTest,
}: ContentReviewStepProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

  const audienceSummary = draft.sourceType === 'airtable'
    ? summarizeAudienceSelection(draft.audiences)
    : draft.csvFile?.name ?? (draft.campaignId ? 'Existing campaign CSV' : 'CSV upload');
  const segmentLabel = draft.sourceType === 'airtable'
    ? draft.segment === 'dnr' ? 'Donors' : 'Not donors'
    : 'Not applicable to CSV';
  const senderModeLabel = draft.senderMode === 'all'
    ? 'All available accounts'
    : draft.senderMode === 'group'
      ? `Group · ${draft.selectedGroup || 'Not selected'}`
      : `${draft.selectedAccounts.length} manually selected account${draft.selectedAccounts.length === 1 ? '' : 's'}`;
  const scheduleLabel = formatSchedule(draft.scheduledAt);
  const canSendTest = Boolean(draft.subject.trim() && draft.htmlBody.trim());

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setDialogError(null);
    try {
      await onSaveTemplate(templateName.trim());
      setTemplateName('');
      setSaveTemplateOpen(false);
    } catch {
      setDialogError('The template could not be saved. Review the error above and try again.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const sendTest = async () => {
    const emails = testEmails.split(',').map((email) => email.trim()).filter(Boolean);
    if (emails.length === 0) {
      setDialogError('Enter at least one email address.');
      return;
    }
    setDialogError(null);
    try {
      await onSendTest(emails);
      setTestEmails('');
      setTestDialogOpen(false);
    } catch {
      setDialogError('The test email could not be sent. Review the error above and try again.');
    }
  };

  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h6" component="h2">Create and review content</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Write the email, preview it, and confirm the campaign details before saving.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Campaign summary</Typography>
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: 1.5,
            m: 0,
          }}
        >
          {[
            ['Audience', audienceSummary],
            ['Segment', segmentLabel],
            ['Senders', senderModeLabel],
            ['Delivery', scheduleLabel],
          ].map(([label, value]) => (
            <Box key={label} sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25, overflowWrap: 'anywhere' }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{ minWidth: 0 }}
      >
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ minWidth: 0 }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 }, maxWidth: 360 }}>
            <InputLabel id="load-template-label">Load template</InputLabel>
            <Select
              labelId="load-template-label"
              label="Load template"
              value={selectedTemplate}
              onChange={(event) => {
                const templateId = event.target.value;
                setSelectedTemplate(templateId);
                onLoadTemplate(templateId);
              }}
            >
              <MenuItem value=""><em>Blank starter</em></MenuItem>
              {templates.map((template) => (
                <MenuItem key={template.id} value={template.id.toString()}>{template.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setDialogError(null);
              setSaveTemplateOpen(true);
            }}
            disabled={!draft.htmlBody.trim()}
          >
            Save as template
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={sendingTest ? <CircularProgress size={16} /> : <SendOutlinedIcon />}
            onClick={() => {
              setDialogError(null);
              setTestDialogOpen(true);
            }}
            disabled={!canSendTest || sendingTest}
          >
            Send test
          </Button>
        </Stack>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_event, mode: 'code' | 'preview' | null) => {
            if (mode) onViewModeChange(mode);
          }}
          aria-label="Email content view"
          sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}
        >
          <ToggleButton value="code" aria-label="Edit HTML">
            <CodeOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} /> Edit
          </ToggleButton>
          <ToggleButton value="preview" aria-label="Preview email">
            <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} /> Preview
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {viewMode === 'code' ? (
        <TextField
          id={WIZARD_FOCUS_TARGET_IDS.emailBody}
          fullWidth
          required
          multiline
          minRows={12}
          label="Email body (HTML)"
          value={draft.htmlBody}
          onChange={(event) => onDraftChange({ htmlBody: event.target.value })}
          sx={{
            '& .MuiInputBase-root': {
              alignItems: 'flex-start',
              bgcolor: 'action.hover',
              fontFamily: '"Fira Code", "Roboto Mono", monospace',
              fontSize: '0.875rem',
            },
          }}
        />
      ) : (
        <Box sx={{ minWidth: 0 }}>
          <EmailPreview subject={draft.subject} htmlBody={draft.htmlBody} />
        </Box>
      )}

      <Dialog
        open={saveTemplateOpen}
        onClose={() => !savingTemplate && setSaveTemplateOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Save template</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Name this reusable version of the current email body.
          </DialogContentText>
          {dialogError && <Alert severity="error" sx={{ mt: 2 }}>{dialogError}</Alert>}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Template name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            disabled={savingTemplate}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveTemplateOpen(false)} disabled={savingTemplate}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void saveTemplate()}
            disabled={savingTemplate || !templateName.trim()}
          >
            {savingTemplate ? 'Saving…' : 'Save template'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={testDialogOpen}
        onClose={() => !sendingTest && setTestDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Send test email</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter email addresses separated by commas. The current subject, body, and sender selection will be used.
          </DialogContentText>
          {dialogError && <Alert severity="error" sx={{ mt: 2 }}>{dialogError}</Alert>}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Email addresses"
            placeholder="test@example.com, another@example.com"
            value={testEmails}
            onChange={(event) => setTestEmails(event.target.value)}
            disabled={sendingTest}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)} disabled={sendingTest}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void sendTest()}
            disabled={sendingTest || !testEmails.trim()}
          >
            {sendingTest ? 'Sending…' : 'Send test'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
