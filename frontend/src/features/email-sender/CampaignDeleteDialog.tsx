import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

import type { EmailCampaign } from './types';


interface CampaignDeleteDialogProps {
  campaign: EmailCampaign | null;
  deleting: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}


export function CampaignDeleteDialog({
  campaign,
  deleting,
  open,
  onClose,
  onConfirm,
}: CampaignDeleteDialogProps) {
  const isCancellation = ['Sending', 'Paused'].includes(campaign?.status ?? '');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="delete-confirm-title"
      aria-describedby="delete-confirm-description"
    >
      <DialogTitle id="delete-confirm-title">Confirm Deletion</DialogTitle>
      <DialogContent>
        <DialogContentText id="delete-confirm-description">
          {isCancellation
            ? 'Are you sure you want to cancel and permanently delete the campaign '
            : 'Are you sure you want to permanently delete the campaign '}
          <strong>"{campaign?.subject || 'this campaign'}"</strong>?
          {isCancellation && ' The sending process will be stopped.'}
          {' This action cannot be undone.'}
        </DialogContentText>
        {deleting && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mt: 2 }} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Cancel</Button>
        <Button onClick={onConfirm} color="error" disabled={deleting} autoFocus>
          {isCancellation ? 'Cancel & Delete' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
