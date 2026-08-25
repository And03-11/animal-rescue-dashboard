import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Input,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import {
  AIRTABLE_AUDIENCES,
  applyAudienceShortcut,
  toggleAudience,
} from './audienceSelection';
import type { AudienceShortcut } from './audienceSelection';
import {
  CAMPAIGN_WIZARD_CSV_ERRORS,
  createSuggestedCsvMapping,
  isCsvColumnMapping,
  isCsvPreview,
  validateCsvContent,
  validateCsvFileSelection,
} from './campaignWizardState';
import type { CampaignWizardDraft } from './campaignWizardState';
import { WIZARD_FOCUS_TARGET_IDS } from './campaignWizardFocus';
import type {
  CampaignSource,
  CsvColumnMapping,
  CsvPreview,
} from './types';

const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

const EMPTY_MAPPING: CsvColumnMapping = {
  email: '',
  name: '',
  has_header: false,
};

interface AudienceStepProps {
  draft: CampaignWizardDraft;
  previewLoading: boolean;
  csvPreviewLoading: boolean;
  error: string | null;
  onDraftChange: (patch: Partial<CampaignWizardDraft>) => void;
  onErrorClear: () => void;
  onCsvError: (message: string) => void;
  onCsvPreviewLoadingChange: (loading: boolean) => void;
}

function parseCsvFile(
  file: File,
  reader: FileReader,
  onSuccess: (preview: CsvPreview) => void,
  onError: (message: string) => void,
) {
  reader.onerror = () => onError(CAMPAIGN_WIZARD_CSV_ERRORS.readFailure);
  reader.onload = (event) => {
    const text = typeof event.target?.result === 'string' ? event.target.result : '';
    const contentError = validateCsvContent(text);
    if (contentError) {
      onError(contentError);
      return;
    }

    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    const splitLine = (line: string) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const character of line) {
        if (character === '"') {
          inQuotes = !inQuotes;
        } else if (character === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += character;
        }
      }
      result.push(current.trim());
      return result;
    };

    const firstRow = splitLine(lines[0] ?? '');
    const secondRow = lines.length > 1 ? splitLine(lines[1]) : [];
    const hasHeader = firstRow.every((cell) => {
      const cleaned = cell.replace(/[.,]/g, '');
      return Number.isNaN(Number(cleaned)) || cleaned === '';
    });
    const columns = hasHeader
      ? firstRow
      : firstRow.map((_, index) => `Column ${index + 1}`);

    onSuccess({
      columns,
      has_header: hasHeader,
      preview_row: hasHeader ? secondRow : firstRow,
    });
  };
  reader.readAsText(file, 'utf-8');
}

export function AudienceStep({
  draft,
  previewLoading,
  csvPreviewLoading,
  error,
  onDraftChange,
  onErrorClear,
  onCsvError,
  onCsvPreviewLoadingChange,
}: AudienceStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const readerRef = useRef<FileReader | null>(null);
  const readGenerationRef = useRef(0);
  const csvPreview = isCsvPreview(draft.csvPreview) ? draft.csvPreview : null;
  const csvMapping = isCsvColumnMapping(draft.csvMapping)
    ? draft.csvMapping
    : { ...EMPTY_MAPPING, has_header: csvPreview?.has_header ?? false };

  useEffect(() => {
    if (draft.sourceType !== 'csv') {
      readGenerationRef.current += 1;
      readerRef.current?.abort();
      readerRef.current = null;
      onCsvPreviewLoadingChange(false);
    }

    return () => {
      readGenerationRef.current += 1;
      readerRef.current?.abort();
      readerRef.current = null;
    };
  }, [draft.sourceType, onCsvPreviewLoadingChange]);

  const setSource = (sourceType: CampaignSource | null) => {
    if (!sourceType || sourceType === draft.sourceType) return;
    const shouldDiscardPendingCsv = sourceType !== 'csv' && readerRef.current !== null;
    if (sourceType !== 'csv') {
      readGenerationRef.current += 1;
      readerRef.current?.abort();
      readerRef.current = null;
      onCsvPreviewLoadingChange(false);
    }
    onErrorClear();
    onDraftChange(
      shouldDiscardPendingCsv
        ? { sourceType, csvFile: null, csvPreview: null, csvMapping: null }
        : { sourceType },
    );
  };

  const setCsvFile = (file: File) => {
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    readerRef.current?.abort();
    readerRef.current = null;

    const fileError = validateCsvFileSelection(file);
    if (fileError) {
      onCsvError(fileError);
      onCsvPreviewLoadingChange(false);
      onDraftChange({ csvFile: null, csvPreview: null, csvMapping: null });
      return;
    }

    const reader = new FileReader();
    readerRef.current = reader;
    onErrorClear();
    onCsvPreviewLoadingChange(true);
    onDraftChange({ csvFile: file, csvPreview: null, csvMapping: null });
    parseCsvFile(
      file,
      reader,
      (preview) => {
        if (readGenerationRef.current !== generation || readerRef.current !== reader) return;
        readerRef.current = null;
        onDraftChange({
          csvPreview: preview,
          csvMapping: createSuggestedCsvMapping(preview),
        });
        onCsvPreviewLoadingChange(false);
      },
      (message) => {
        if (readGenerationRef.current !== generation || readerRef.current !== reader) return;
        readerRef.current = null;
        onDraftChange({ csvFile: null, csvPreview: null, csvMapping: null });
        onCsvError(message);
        onCsvPreviewLoadingChange(false);
      },
    );
  };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setCsvFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setCsvFile(file);
  };

  const isSelected = (region: 'USA' | 'EUR', isBounced: boolean) => (
    draft.audiences.some((audience) => (
      audience.region === region && audience.is_bounced === isBounced
    ))
  );

  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h6" component="h2">Choose recipients</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Select an Airtable audience or upload a CSV, then continue to verify eligibility.
        </Typography>
      </Box>

      {error && (
        <Alert
          id={WIZARD_FOCUS_TARGET_IDS.errorAlert}
          role="alert"
          tabIndex={-1}
          severity="error"
        >{error}</Alert>
      )}

      <FormControl component="fieldset" fullWidth>
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          Contact source
        </Typography>
        <ToggleButtonGroup
          value={draft.sourceType}
          exclusive
          fullWidth
          onChange={(_event, value: CampaignSource | null) => setSource(value)}
          aria-label="Contact source"
          sx={{ maxWidth: 480 }}
        >
          <ToggleButton value="airtable">Airtable contacts</ToggleButton>
          <ToggleButton value="csv">Upload CSV</ToggleButton>
        </ToggleButtonGroup>
      </FormControl>

      {draft.sourceType === 'airtable' ? (
        <Stack spacing={2.5}>
          <FormControl component="fieldset" fullWidth>
            <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
              Segment
            </Typography>
            <ToggleButtonGroup
              value={draft.segment}
              exclusive
              fullWidth
              onChange={(_event, segment: CampaignWizardDraft['segment'] | null) => {
                if (segment) {
                  onErrorClear();
                  onDraftChange({ segment });
                }
              }}
              aria-label="Recipient segment"
              sx={{ maxWidth: 480 }}
            >
              <ToggleButton value="standard">Not donors</ToggleButton>
              <ToggleButton value="dnr">Donors</ToggleButton>
            </ToggleButtonGroup>
          </FormControl>

          <Box
            component="fieldset"
            id={WIZARD_FOCUS_TARGET_IDS.audienceMatrix}
            tabIndex={-1}
            sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}
          >
            <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
              Airtable audiences
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              {(['All', 'USA', 'EUR', 'Valid', 'Bounced', 'Clear'] as AudienceShortcut[]).map((shortcut) => (
                <Button
                  key={shortcut}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    onErrorClear();
                    onDraftChange({ audiences: applyAudienceShortcut(shortcut) });
                  }}
                >
                  {shortcut}
                </Button>
              ))}
            </Stack>

            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, overflow: 'hidden' }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(64px, 1fr) repeat(2, minmax(84px, 1fr))',
                  alignItems: 'center',
                  columnGap: 1,
                  rowGap: 0.5,
                  minWidth: 0,
                }}
              >
                <Box />
                <Typography variant="caption" color="text.secondary" align="center">Valid</Typography>
                <Typography variant="caption" color="text.secondary" align="center">Bounced</Typography>
                {(['USA', 'EUR'] as const).flatMap((region) => [
                  <Typography key={`${region}-label`} variant="body2" fontWeight={600}>{region}</Typography>,
                  ...([false, true] as const).map((isBounced) => {
                    const audience = AIRTABLE_AUDIENCES.find((item) => (
                      item.region === region && item.is_bounced === isBounced
                    ));
                    if (!audience) return null;
                    const label = `${region} ${isBounced ? 'bounced' : 'valid'} emails`;
                    return (
                      <Box key={label} sx={{ display: 'flex', justifyContent: 'center' }}>
                        <FormControlLabel
                          control={(
                            <Checkbox
                              checked={isSelected(region, isBounced)}
                              onChange={() => {
                                onErrorClear();
                                onDraftChange({
                                  audiences: toggleAudience(draft.audiences, audience),
                                });
                              }}
                            />
                          )}
                          label={<Box component="span" sx={visuallyHidden}>{label}</Box>}
                          sx={{ m: 0 }}
                        />
                      </Box>
                    );
                  }),
                ])}
              </Box>
            </Paper>
          </Box>

          {previewLoading && (
            <Alert icon={<CircularProgress size={18} />} severity="info">
              Checking eligible recipients…
            </Alert>
          )}

          {draft.audiencePreview && !draft.audiencePreviewStale && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Box sx={{ mr: 'auto', minWidth: 0 }}>
                  <Typography variant="subtitle2">Eligible audience</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Unique recipients after overlap is removed.
                  </Typography>
                </Box>
                {draft.audiencePreview.branches.map((branch) => (
                  <Chip
                    key={`${branch.region}-${branch.is_bounced}`}
                    label={`${branch.region} · ${branch.is_bounced ? 'Bounced' : 'Valid'}: ${branch.count.toLocaleString()}`}
                    size="small"
                    variant="outlined"
                  />
                ))}
                <Chip
                  label={`${draft.audiencePreview.total_unique.toLocaleString()} unique`}
                  color={draft.audiencePreview.total_unique === 0 ? 'warning' : 'primary'}
                  size="small"
                />
              </Stack>
            </Paper>
          )}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Box
            id={WIZARD_FOCUS_TARGET_IDS.csvFile}
            role="group"
            tabIndex={-1}
            aria-labelledby="campaign-wizard-csv-upload-label"
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            sx={{
              border: '2px dashed',
              borderColor: isDragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: { xs: 2.5, sm: 4 },
              textAlign: 'center',
              bgcolor: isDragging ? 'action.hover' : 'background.paper',
              transition: (theme) => theme.transitions.create(['border-color', 'background-color']),
            }}
          >
            <CloudUploadOutlinedIcon color={isDragging ? 'primary' : 'action'} sx={{ fontSize: 40 }} />
            <Typography id="campaign-wizard-csv-upload-label" variant="subtitle1" sx={{ mt: 1 }}>
              {isDragging ? 'Drop CSV here' : 'Drag and drop a CSV'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              {draft.csvFile?.name ?? (draft.campaignId ? 'Keep the existing upload or choose a replacement.' : 'Choose a file to preview and map its columns.')}
            </Typography>
            <Button
              component="label"
              variant="outlined"
            >
              {draft.csvFile ? 'Change file' : 'Browse files'}
              <Input
                type="file"
                onChange={handleFileChange}
                inputProps={{ accept: '.csv,text/csv', 'aria-label': 'Choose CSV file' }}
                sx={{ display: 'none' }}
              />
            </Button>
          </Box>

          {csvPreviewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} aria-label="Loading CSV preview" />
            </Box>
          ) : csvPreview ? (
            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="subtitle2">Map CSV columns</Typography>
                <Chip
                  label={csvPreview.has_header ? 'Header detected' : 'No header detected'}
                  size="small"
                  variant="outlined"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                First data row
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ mt: 0.75, mb: 2 }}
              >
                {csvPreview.columns.map((column, index) => (
                  <Tooltip key={`${column}-${index}`} title={column}>
                    <Chip
                      label={`“${csvPreview.preview_row[index] || ''}”`}
                      size="small"
                      variant="outlined"
                      sx={{ maxWidth: '100%' }}
                    />
                  </Tooltip>
                ))}
              </Stack>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2,
                }}
              >
                <FormControl fullWidth required>
                  <InputLabel id="csv-email-column-label">Email column</InputLabel>
                  <Select
                    id={WIZARD_FOCUS_TARGET_IDS.csvEmailColumn}
                    labelId="csv-email-column-label"
                    label="Email column"
                    value={csvMapping.email}
                    onChange={(event) => {
                      onErrorClear();
                      onDraftChange({
                        csvMapping: { ...csvMapping, email: event.target.value },
                      });
                    }}
                  >
                    <MenuItem value=""><em>Select column</em></MenuItem>
                    {csvPreview.columns.map((column, index) => (
                      <MenuItem key={`${column}-${index}`} value={column}>{column}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth required>
                  <InputLabel id="csv-name-column-label">Name column</InputLabel>
                  <Select
                    id={WIZARD_FOCUS_TARGET_IDS.csvNameColumn}
                    labelId="csv-name-column-label"
                    label="Name column"
                    value={csvMapping.name}
                    onChange={(event) => {
                      onErrorClear();
                      onDraftChange({
                        csvMapping: { ...csvMapping, name: event.target.value },
                      });
                    }}
                  >
                    <MenuItem value=""><em>Select column</em></MenuItem>
                    {csvPreview.columns.map((column, index) => (
                      <MenuItem key={`${column}-${index}`} value={column}>{column}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              {csvMapping.email && csvMapping.email === csvMapping.name && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Email and name must use different columns.
                </Alert>
              )}
            </Paper>
          ) : draft.campaignId ? (
            <Alert severity="warning">
              The existing CSV preview could not be loaded. You can continue without changing its mapping.
            </Alert>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
