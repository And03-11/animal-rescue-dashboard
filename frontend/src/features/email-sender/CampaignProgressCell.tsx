import { Box, LinearProgress, TableCell, Typography } from '@mui/material';

import type { EmailCampaign } from './types';


export function CampaignProgressCell({ campaign }: { campaign: EmailCampaign }) {
  const hasProgress =
    (campaign.progress && campaign.progress.total > 0)
    || campaign.status === 'Sending'
    || campaign.status === 'Completed';

  return (
    <TableCell>
      {hasProgress ? (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.max(0, Number(campaign.progress?.percentage) || 0))}
              color={
                campaign.status === 'Sending'
                  ? 'warning'
                  : campaign.status === 'Completed'
                    ? 'success'
                    : 'primary'
              }
            />
          </Box>
          <Box sx={{ minWidth: 70 }}>
            <Typography variant="body2" color="text.secondary">
              {`${campaign.progress?.sent ?? campaign.sent_count_final ?? 0} / ${campaign.progress?.total ?? campaign.target_count ?? '?'}`}
            </Typography>
          </Box>
        </Box>
      ) : campaign.status === 'Draft' ? (
        <Typography variant="caption" color="text.secondary">Waiting...</Typography>
      ) : campaign.status === 'Ready' ? (
        <Typography variant="caption" color="success.main">Ready to Launch</Typography>
      ) : campaign.status === 'Scheduled' ? (
        <Typography variant="caption" color="info.main">⏰ Scheduled</Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">N/A</Typography>
      )}
    </TableCell>
  );
}
