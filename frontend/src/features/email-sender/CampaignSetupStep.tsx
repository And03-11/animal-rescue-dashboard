import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import type {
  CampaignSenderMode,
  CampaignWizardDraft,
} from './campaignWizardState';
import { WIZARD_FOCUS_TARGET_IDS } from './campaignWizardFocus';
import type { SenderOptions } from './types';

export interface CampaignSetupStepProps {
  draft: CampaignWizardDraft;
  senderOptions: SenderOptions;
  loadingSenders: boolean;
  onDraftChange: (patch: Partial<CampaignWizardDraft>) => void;
}

const senderModeOptions: Array<{
  value: CampaignSenderMode;
  label: string;
}> = [
  { value: 'all', label: 'All available' },
  { value: 'group', label: 'Specific group' },
  { value: 'manual', label: 'Manual selection' },
];

export function CampaignSetupStep({
  draft,
  senderOptions,
  loadingSenders,
  onDraftChange,
}: CampaignSetupStepProps) {
  const zeroAudience = draft.sourceType === 'airtable'
    && draft.audiencePreview?.total_unique === 0;
  const scheduledAt = draft.scheduledAt ? dayjs(draft.scheduledAt) : null;

  const setSenderMode = (senderMode: CampaignSenderMode | null) => {
    if (!senderMode) return;
    onDraftChange({
      senderMode,
      selectedGroup: senderMode === 'group' ? draft.selectedGroup : '',
      selectedAccounts: senderMode === 'manual' ? draft.selectedAccounts : [],
    });
  };

  return (
    <Stack spacing={3.5} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h6" component="h2">Set up the campaign</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose sender accounts, name the campaign, and optionally schedule delivery.
        </Typography>
      </Box>

      <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          Sender accounts
        </Typography>
        {loadingSenders ? (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">Loading sender accounts…</Typography>
          </Stack>
        ) : (
          <>
            <ToggleButtonGroup
              id={WIZARD_FOCUS_TARGET_IDS.senderMode}
              tabIndex={-1}
              value={draft.senderMode}
              exclusive
              fullWidth
              onChange={(_event, value: CampaignSenderMode | null) => setSenderMode(value)}
              aria-label="Sender selection mode"
              sx={{
                maxWidth: 680,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                '& .MuiToggleButtonGroup-grouped': {
                  borderRadius: { xs: '8px !important', sm: undefined },
                  borderLeft: { xs: '1px solid !important', sm: undefined },
                  mt: { xs: '-1px', sm: 0 },
                },
              }}
            >
              {senderModeOptions.map((option) => (
                <ToggleButton
                  key={option.value}
                  value={option.value}
                  disabled={
                    (option.value === 'group' && senderOptions.groups.length === 0)
                    || (option.value === 'manual' && senderOptions.accounts.length === 0)
                  }
                >
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Collapse in={draft.senderMode === 'group'}>
              <FormControl fullWidth required sx={{ mt: 2, maxWidth: 520 }}>
                <InputLabel id="sender-group-label">Sender group</InputLabel>
                <Select
                  id={WIZARD_FOCUS_TARGET_IDS.senderGroup}
                  labelId="sender-group-label"
                  label="Sender group"
                  value={draft.selectedGroup}
                  onChange={(event) => onDraftChange({ selectedGroup: event.target.value })}
                >
                  <MenuItem value=""><em>Select a group</em></MenuItem>
                  {senderOptions.groups.map((group) => (
                    <MenuItem key={group} value={group}>{group}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Collapse>

            <Collapse in={draft.senderMode === 'manual'}>
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={senderOptions.accounts}
                value={draft.selectedAccounts}
                getOptionLabel={(option) => `${option.id} (${option.group})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                onChange={(_event, selectedAccounts) => onDraftChange({ selectedAccounts })}
                renderOption={(props, option, { selected }) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      <FormControlLabel
                        control={<Checkbox checked={selected} />}
                        label={`${option.id} (${option.group})`}
                        sx={{ pointerEvents: 'none' }}
                      />
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    id={WIZARD_FOCUS_TARGET_IDS.senderAccounts}
                    required
                    label="Specific sender accounts"
                    placeholder="Search accounts"
                    sx={{ mt: 2, maxWidth: 680 }}
                  />
                )}
              />
            </Collapse>
          </>
        )}
      </Box>

      <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          Campaign details
        </Typography>
        <Stack spacing={2}>
          <TextField
            id={WIZARD_FOCUS_TARGET_IDS.campaignName}
            fullWidth
            required
            label="Campaign name"
            value={draft.campaignName}
            onChange={(event) => onDraftChange({ campaignName: event.target.value })}
            inputProps={{ maxLength: 160 }}
          />
          <TextField
            id={WIZARD_FOCUS_TARGET_IDS.subject}
            fullWidth
            required
            label="Email subject"
            value={draft.subject}
            onChange={(event) => onDraftChange({ subject: event.target.value })}
            inputProps={{ maxLength: 240 }}
          />
        </Stack>
      </Box>

      <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          Engagement tracking
        </Typography>
        <Box
          sx={{
            maxWidth: 680,
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <FormControlLabel
            sx={{ m: 0, alignItems: 'flex-start' }}
            control={(
              <Switch
                checked={draft.clickTrackingEnabled}
                onChange={(event) => onDraftChange({
                  clickTrackingEnabled: event.target.checked,
                })}
                inputProps={{ 'aria-label': 'Track donation clicks' }}
              />
            )}
            label={(
              <Box sx={{ pt: 0.35 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                  Track donation clicks
                </Typography>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25 }}>
                  Uses first-party tracking on donations.animallove.cr. Open tracking stays off.
                </Typography>
              </Box>
            )}
          />
        </Box>
      </Box>

      <Box
        component="fieldset"
        id={WIZARD_FOCUS_TARGET_IDS.schedule}
        tabIndex={-1}
        sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}
      >
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          Delivery
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'flex-start' }}
          sx={{ maxWidth: 680 }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateTimePicker
              label="Schedule send (optional)"
              value={scheduledAt}
              onChange={(value) => onDraftChange({
                scheduledAt: value?.isValid() ? value.toISOString() : null,
              })}
              minDateTime={dayjs()}
              disabled={zeroAudience}
              slotProps={{
                textField: {
                  fullWidth: true,
                  helperText: zeroAudience
                    ? 'No eligible recipients; save as Draft or change the audience.'
                    : scheduledAt
                      ? 'This campaign will be scheduled when saved.'
                      : 'Leave empty to save as Draft.',
                },
              }}
            />
          </LocalizationProvider>
          {draft.scheduledAt && (
            <Button
              variant="text"
              onClick={() => onDraftChange({ scheduledAt: null })}
              sx={{ mt: { sm: 1 }, flexShrink: 0 }}
            >
              Clear schedule
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
