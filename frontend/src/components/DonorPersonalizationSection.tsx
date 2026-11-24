import { useState } from 'react';
import { Alert, Box, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DONOR_PLURAL_PRESETS, DONOR_SINGULAR_PRESETS, donorSamplePhrase, validateDonorPhrases } from '../features/email-sender/donorPersonalization';
import type { DonorPhrasePreset, DonorPhraseSettings } from '../features/email-sender/donorPersonalization';

const OTHER = 'other';

interface PhraseSelectorProps {
  label: string;
  customLabel: string;
  value: string;
  presets: readonly DonorPhrasePreset[];
  onChange: (phrase: string) => void;
  helperText: string;
  disabled?: boolean;
}

function PhraseSelector({ label, customLabel, value, presets, onChange, helperText, disabled }: PhraseSelectorProps) {
  const preset = presets.find((option) => option.phrase === value);
  const [choice, setChoice] = useState({ phrase: value, manual: !preset });
  const [customDraft, setCustomDraft] = useState<string | null>(preset ? null : value);

  // A different template may hydrate this same form. Reset only for an external
  // value change; our own selections keep the last manual draft available.
  if (choice.phrase !== value) {
    setChoice({ phrase: value, manual: !preset });
    setCustomDraft(preset ? null : value);
  }

  return (
    <Stack spacing={1.5}>
      <TextField select label={label} fullWidth disabled={disabled}
        value={choice.manual ? OTHER : preset?.id ?? OTHER}
        onChange={(event) => {
          if (event.target.value === OTHER) {
            const phrase = customDraft ?? value;
            setChoice({ phrase, manual: true });
            setCustomDraft(phrase);
            onChange(phrase);
          } else {
            const option = presets.find((item) => item.id === event.target.value);
            if (option) {
              setChoice({ phrase: option.phrase, manual: false });
              onChange(option.phrase);
            }
          }
        }}
        helperText={helperText}
      >
        {presets.map((option) => (
          <MenuItem key={option.id} value={option.id} sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {option.phrase}
          </MenuItem>
        ))}
        <MenuItem value={OTHER}>Other — write your own</MenuItem>
      </TextField>
      {choice.manual && (
        <TextField label={customLabel} fullWidth multiline minRows={2} required
          value={value} disabled={disabled}
          onChange={(event) => {
            const phrase = event.target.value;
            setChoice({ phrase, manual: true });
            setCustomDraft(phrase);
            onChange(phrase);
          }}
          helperText={'Use {{when}} for the donation date wording and {{count}} for the number of donations.'}
        />
      )}
    </Stack>
  );
}

interface Props {
  settings: DonorPhraseSettings;
  onChange: (patch: Partial<DonorPhraseSettings>) => void;
  disabled?: boolean;
  sampleCount: number;
  onSampleCountChange: (count: number) => void;
}

export function DonorPersonalizationSection({ settings, onChange, disabled, sampleCount, onSampleCountChange }: Props) {
  const error = validateDonorPhrases(settings);
  return (
    <Paper component="section" aria-label="Donor personalization" variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>Donor personalization</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {'Put {{Day}} in your HTML and choose the text that replaces it. Keep surrounding words, such as “for your”, in the HTML.'}
          </Typography>
        </Box>
        <PhraseSelector label="Phrase for one donation" customLabel="Custom phrase for one donation"
          presets={DONOR_SINGULAR_PRESETS}
          value={settings.donor_singular_phrase} disabled={disabled}
          onChange={(phrase) => onChange({ donor_singular_phrase: phrase })}
          helperText={'{{when}} becomes today, yesterday or three days ago when sending. Choose Other for different wording.'}
        />
        <PhraseSelector label="Phrase for multiple donations" customLabel="Custom phrase for multiple donations"
          presets={DONOR_PLURAL_PRESETS}
          value={settings.donor_plural_phrase} disabled={disabled}
          onChange={(phrase) => onChange({ donor_plural_phrase: phrase })}
          helperText={'{{count}} counts all donations to the active campaign, including donations older than a week.'}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1.5, p: 2, minWidth: 0 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Typography variant="subtitle2">Preview example</Typography>
            <ToggleButtonGroup value={sampleCount} exclusive size="small" aria-label="Donor preview example"
              onChange={(_, value: number | null) => { if (value !== null) onSampleCountChange(value); }}>
              <ToggleButton value={1}>One donation</ToggleButton>
              <ToggleButton value={3}>Three donations</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Typography variant="body2" sx={{ mt: 1.5, overflowWrap: 'anywhere' }}>
            {error ? 'Review the phrases above to see this example.' : donorSamplePhrase(settings, sampleCount)}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0, mt: 1 }}>
            Example data: last donation three days ago. Actual dates use Costa Rica time when sending.
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
