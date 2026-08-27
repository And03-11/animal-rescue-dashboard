import ScheduleIcon from '@mui/icons-material/Schedule';
import { Chip, TableCell, Typography } from '@mui/material';

import type { EmailCampaign } from './types';


export function CampaignStatusCell({ campaign }: { campaign: EmailCampaign }) {
  return (
    <TableCell>
      <Chip
        icon={campaign.status === 'Scheduled' ? <ScheduleIcon fontSize="small" /> : undefined}
        label={campaign.status}
        size="small"
        color={
          campaign.status === 'Completed'
            ? 'success'
            : campaign.status === 'Sending'
              ? 'warning'
              : campaign.status === 'Scheduled'
                ? 'info'
                : campaign.status.startsWith('Error')
                  ? 'error'
                  : 'default'
        }
      />
      {campaign.status === 'Scheduled' && campaign.scheduled_at && (
        <Typography variant="caption" display="block" color="info.main" sx={{ mt: 0.5 }}>
          📅 {new Date(campaign.scheduled_at).toLocaleString('en-US', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </Typography>
      )}
    </TableCell>
  );
}
