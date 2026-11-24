import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { DonorDetectionNotice } from '../features/email-sender/useDonorHtmlDetection';

interface Props {
  isDetecting: boolean;
  notice: DonorDetectionNotice | null;
  canUndo: boolean;
  onDetect: () => void;
  onUndo: () => void;
  disabled?: boolean;
}

export function DonorDetectionFeedback({ isDetecting, notice, canUndo, onDetect, onUndo, disabled }: Props) {
  return <Stack spacing={1.5} aria-live="polite">
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1}>
      {isDetecting ? <Stack direction="row" alignItems="center" gap={1} role="status">
        <CircularProgress size={16} />
        <Typography variant="body2">Detecting donor wording…</Typography>
      </Stack> : <>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Donor wording is detected automatically when you paste HTML.
        </Typography>
        <Button size="small" onClick={onDetect} disabled={disabled}>Detect donor wording</Button>
      </>}
    </Stack>
    {notice && <Alert severity={notice.severity}
      action={canUndo ? <Button color="inherit" size="small" onClick={onUndo} disabled={disabled}>Undo</Button> : undefined}>
      {notice.message}
      {notice.originalPhrase && <Box component="span" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>
        {`“${notice.originalPhrase}” → {{Day}}`}
      </Box>}
    </Alert>}
  </Stack>;
}
