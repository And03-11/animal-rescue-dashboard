import {
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { Link as RouterLink } from 'react-router-dom';
import { CampaignProgressCell } from './CampaignProgressCell';
import { CampaignStatusCell } from './CampaignStatusCell';
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
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Created At</TableCell>
              <TableCell>Campaign Name</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Target Info</TableCell>
              <TableCell>Status</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Progress</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {campaigns.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No campaigns found. Create one to get started!
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  hover
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell>
                    {new Date(campaign.createdAt).toLocaleString('en-US', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    <Link
                      component={RouterLink}
                      to={`/campaign/${campaign.id}`}
                      underline="hover"
                      color="inherit"
                    >
                      {campaign.campaign_name || `(ID: ${campaign.id.substring(9)})`}
                    </Link>
                  </TableCell>
                  <TableCell>{campaign.subject || '(No Subject)'}</TableCell>
                  <TableCell>
                    <Chip
                      label={campaign.source_type?.toUpperCase()}
                      size="small"
                      color={campaign.source_type === 'airtable' ? 'info' : 'secondary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {campaign.source_type === 'airtable'
                      ? `${campaign.region} (Bounced: ${campaign.is_bounced ? 'Yes' : 'No'})`
                      : campaign.csv_filename ||
                        (campaign.status === 'Draft' ? 'CSV Pending Upload' : 'CSV Processed')}
                  </TableCell>
                  <CampaignStatusCell campaign={campaign} />
                  <CampaignProgressCell campaign={campaign} />
                  <TableCell align="right">
                    {campaign.status === 'Sending' && (
                      <Tooltip title="Pause Sending">
                        <span>
                          <IconButton
                            aria-label="pause campaign"
                            onClick={() => onPause(campaign.id)}
                            color="warning"
                            size="small"
                            disabled={actionLoading[campaign.id] || deleting}
                            sx={{ mr: 0.5 }}
                          >
                            {actionLoading[campaign.id] ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : (
                              <PauseCircleOutlineIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}

                    {campaign.status === 'Paused' && (
                      <Tooltip title="Resume Sending">
                        <span>
                          <IconButton
                            aria-label="resume campaign"
                            onClick={() => onResume(campaign.id)}
                            color="success"
                            size="small"
                            disabled={actionLoading[campaign.id] || deleting}
                            sx={{ mr: 0.5 }}
                          >
                            {actionLoading[campaign.id] ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : (
                              <PlayCircleOutlineIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}

                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RocketLaunchIcon />}
                      onClick={() => onLaunch(campaign.id)}
                      disabled={
                        !(
                          campaign.status === 'Ready' ||
                          (campaign.source_type === 'airtable' && campaign.status === 'Draft') ||
                          (campaign.status === 'Completed with Errors' &&
                            (campaign.sent_count_final ?? campaign.progress?.sent ?? 0) <
                              (campaign.target_count ?? campaign.progress?.total ?? 0))
                        )
                      }
                    >
                      {campaign.status === 'Sending'
                        ? 'Sending...'
                        : campaign.status === 'Completed with Errors'
                          ? 'Retry Failed'
                          : 'Launch'}
                    </Button>

                    <Tooltip title="Edit Campaign">
                      <span>
                        <IconButton
                          aria-label="edit campaign"
                          onClick={() => onEdit(campaign.id)}
                          color="primary"
                          size="small"
                          disabled={campaign.status === 'Sending' || deleting}
                          sx={{ ml: 1 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>

                    <Tooltip title="Delete Campaign">
                      <span>
                        <IconButton
                          aria-label="delete campaign"
                          onClick={() => onDelete(campaign)}
                          color="error"
                          size="small"
                          disabled={campaign.status === 'Sending' || deleting}
                          sx={{ ml: 1 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
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
      />
    </Paper>
  );
}
