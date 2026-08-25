import { useState } from 'react';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

import {
  buildAudienceLabelProps,
  buildAudiencePresentation,
  buildAudienceTooltipProps,
} from './audiencePresentation';
import { buildCampaignPresentation } from './campaignPresentation';
import { campaignColumnPercentages } from './campaignTableLayout';
import type { EmailCampaign } from './types';

interface CampaignTableProps {
  campaigns: EmailCampaign[];
  total: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  loading: boolean;
  deleting: boolean;
  actionLoading: Record<string, boolean>;
  onPause: (campaignId: string) => void;
  onResume: (campaignId: string) => void;
  onLaunch: (campaignId: string) => void;
  onEdit: (campaignId: string) => void;
  onDelete: (campaign: EmailCampaign) => void;
}

export function CampaignTable({
  campaigns,
  total,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  loading,
  deleting,
  actionLoading,
  onPause,
  onResume,
  onLaunch,
  onEdit,
  onDelete,
}: CampaignTableProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuCampaign, setMenuCampaign] = useState<EmailCampaign | null>(null);

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        overflow: 'hidden',
        borderRadius: 3,
        bgcolor: 'background.paper',
        boxShadow: theme.palette.mode === 'dark'
          ? `0 1px 0 ${alpha(theme.palette.common.white, 0.025)} inset`
          : `0 18px 50px ${alpha(theme.palette.common.black, 0.045)}`,
      })}
    >
      <TableContainer sx={{ overflowX: 'hidden' }}>
        <Table
          aria-label="Email campaigns"
          sx={{
            width: '100%',
            tableLayout: 'fixed',
            '& .MuiTableCell-root': {
              px: { md: 1.25, xl: 2 },
              overflow: 'hidden',
            },
          }}
        >
          <colgroup>
            {campaignColumnPercentages.map((width, index) => (
              <col key={`${width}-${index}`} style={{ width }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Campaign</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Audience</TableCell>
              <TableCell>Delivered</TableCell>
              <TableCell align="right">Open rate</TableCell>
              <TableCell align="right">Click rate</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && campaigns.length === 0 && Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`campaign-skeleton-${index}`} sx={{ height: 88 }}>
                <TableCell>
                  <Skeleton width="72%" height={22} />
                  <Skeleton width="88%" height={18} />
                  <Skeleton width="45%" height={16} />
                </TableCell>
                <TableCell><Skeleton width={90} height={30} /></TableCell>
                <TableCell><Skeleton width="80%" height={38} /></TableCell>
                <TableCell><Skeleton width="90%" height={34} /></TableCell>
                <TableCell><Skeleton width={50} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell><Skeleton width={50} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell><Skeleton width={140} height={36} sx={{ ml: 'auto' }} /></TableCell>
              </TableRow>
            ))}

            {!loading && campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 10 }}>
                  <Stack alignItems="center" spacing={1.25} textAlign="center">
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 2,
                        color: 'primary.main',
                        bgcolor: 'action.selected',
                      }}
                    >
                      <EmailOutlinedIcon />
                    </Box>
                    <Typography variant="h6">No campaigns yet</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Create your first campaign to start reaching your contacts.
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}

            {campaigns.map((campaign) => {
              const presentation = buildCampaignPresentation(campaign);
              const audiencePresentation = buildAudiencePresentation(campaign);
              const audienceLabelProps = buildAudienceLabelProps(audiencePresentation);
              const audienceTooltipProps = campaign.source_type === 'airtable'
                ? buildAudienceTooltipProps(audiencePresentation)
                : null;
              const deliveryPercentage = presentation.total > 0
                ? Math.min(100, Math.max(0, (presentation.delivered / presentation.total) * 100))
                : 0;
              const isActionBusy = Boolean(actionLoading[campaign.id]);

              return (
                <TableRow
                  key={campaign.id}
                  hover
                  sx={{
                    height: 88,
                    '& td': { py: 1.75 },
                    '&:last-child td': { borderBottom: 0 },
                  }}
                >
                  <TableCell>
                    <Stack spacing={0.55} sx={{ minWidth: 0 }}>
                      <Link
                        component={RouterLink}
                        to={`/campaign/${campaign.id}`}
                        underline="hover"
                        color="text.primary"
                        sx={{
                          width: 'fit-content',
                          maxWidth: '100%',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          lineHeight: 1.35,
                        }}
                      >
                        {campaign.campaign_name || `(ID: ${campaign.id.substring(9)})`}
                      </Link>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        title={campaign.subject || 'No subject'}
                      >
                        {campaign.subject || 'No subject'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created {new Date(campaign.createdAt).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </Typography>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Stack spacing={0.65} alignItems="flex-start">
                      <Chip
                        label={campaign.status}
                        size="small"
                        color={
                          campaign.status === 'Completed'
                            ? 'success'
                            : campaign.status === 'Completed with Errors'
                              ? 'warning'
                            : campaign.status === 'Sending'
                              ? 'warning'
                              : campaign.status === 'Scheduled'
                                ? 'info'
                                : campaign.status.startsWith('Error')
                                  ? 'error'
                                  : 'default'
                        }
                        variant={campaign.status === 'Draft' ? 'outlined' : 'filled'}
                      />
                      {campaign.status === 'Scheduled' && campaign.scheduled_at && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(campaign.scheduled_at).toLocaleString('en-US', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Stack spacing={0.5} alignItems="flex-start">
                      <Chip
                        label={campaign.source_type?.toUpperCase()}
                        size="small"
                        color={campaign.source_type === 'airtable' ? 'info' : 'secondary'}
                        variant="outlined"
                        sx={{ height: 24, fontSize: '0.68rem' }}
                      />
                      {audienceTooltipProps ? (
                        <Tooltip title={audiencePresentation.tooltip} describeChild>
                          <Box
                            component="span"
                            {...audienceTooltipProps}
                            sx={{ display: 'block', maxWidth: '100%' }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                              noWrap
                            >
                              {audiencePresentation.label}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600 }}
                          noWrap
                          {...audienceLabelProps}
                        >
                          {audiencePresentation.label}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {audiencePresentation.detail}
                      </Typography>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    {presentation.total > 0 ? (
                      <Stack spacing={0.9}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>
                          <Box component="span" className="dashboard-data-value">
                            {presentation.delivered.toLocaleString()}
                          </Box>
                          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                            {' '}/ {presentation.total.toLocaleString()}
                          </Box>
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={deliveryPercentage}
                          color={campaign.status === 'Completed with Errors' ? 'warning' : 'primary'}
                          sx={{ height: 6, borderRadius: 99, bgcolor: 'action.selected' }}
                        />
                      </Stack>
                    ) : (
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>—</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Awaiting recipients
                        </Typography>
                      </Stack>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      className={presentation.openRate === null ? undefined : 'dashboard-data-value'}
                      sx={{ fontWeight: 700 }}
                    >
                      {presentation.openRate === null ? '—' : `${presentation.openRate.toFixed(1)}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {presentation.openRate === null ? 'Not tracked' : 'Unique opens'}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      className={presentation.clickRate === null ? undefined : 'dashboard-data-value'}
                      sx={{ fontWeight: 700 }}
                    >
                      {presentation.clickRate === null ? '—' : `${presentation.clickRate.toFixed(1)}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {presentation.clickRate === null ? 'Not tracked' : 'Unique clicks'}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5}>
                      {presentation.primaryAction === 'report' && (
                        <Button
                          component={RouterLink}
                          to={`/campaign/${campaign.id}`}
                          size="small"
                          variant="outlined"
                          startIcon={<AssessmentOutlinedIcon />}
                        >
                          View report
                        </Button>
                      )}
                      {(presentation.primaryAction === 'launch' || presentation.primaryAction === 'retry') && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<RocketLaunchOutlinedIcon />}
                          onClick={() => onLaunch(campaign.id)}
                        >
                          {presentation.primaryAction === 'retry' ? 'Retry failed' : 'Launch'}
                        </Button>
                      )}
                      {presentation.primaryAction === 'pause' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          startIcon={isActionBusy ? <CircularProgress size={16} /> : <PauseCircleOutlineIcon />}
                          onClick={() => onPause(campaign.id)}
                          disabled={isActionBusy || deleting}
                        >
                          Pause
                        </Button>
                      )}
                      {presentation.primaryAction === 'resume' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          startIcon={isActionBusy ? <CircularProgress size={16} /> : <PlayCircleOutlineIcon />}
                          onClick={() => onResume(campaign.id)}
                          disabled={isActionBusy || deleting}
                        >
                          Resume
                        </Button>
                      )}

                      <Tooltip title="More actions">
                        <IconButton
                          aria-label={`More actions for ${campaign.campaign_name || campaign.id}`}
                          size="small"
                          onClick={(event) => {
                            setMenuAnchor(event.currentTarget);
                            setMenuCampaign(campaign);
                          }}
                        >
                          <MoreHorizIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 15, 25]}
        onPageChange={(_event, nextPage) => onPageChange(nextPage)}
        onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
        labelRowsPerPage="Campaigns per page:"
        sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setMenuCampaign(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          disabled={!menuCampaign || menuCampaign.status === 'Sending' || deleting}
          onClick={() => {
            if (menuCampaign) onEdit(menuCampaign.id);
            setMenuAnchor(null);
            setMenuCampaign(null);
          }}
        >
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit campaign</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!menuCampaign || menuCampaign.status === 'Sending' || deleting}
          onClick={() => {
            if (menuCampaign) onDelete(menuCampaign);
            setMenuAnchor(null);
            setMenuCampaign(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Delete campaign</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
}
