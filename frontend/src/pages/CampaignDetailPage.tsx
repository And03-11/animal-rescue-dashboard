import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import apiClient from '../api/axiosConfig';
import { EmailPreview } from '../components/EmailPreview';
import {
  buildCampaignReportCards,
  formatActivityClassification,
  formatCampaignDestination,
  formatCampaignRate,
  hasCampaignEngagement,
} from '../features/email-sender/campaignReport';
import type {
  CampaignDetailsResponse,
  CampaignReportResponse,
} from '../features/email-sender/types';

function classificationColor(
  classification: 'human_likely' | 'unconfirmed' | 'suspected_automation',
): 'success' | 'default' | 'warning' {
  if (classification === 'human_likely') return 'success';
  if (classification === 'suspected_automation') return 'warning';
  return 'default';
}

export const CampaignDetailPage = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [detailsData, setDetailsData] = useState<CampaignDetailsResponse | null>(null);
  const [report, setReport] = useState<CampaignReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const fetchCampaign = useCallback(async (showLoading = false) => {
    if (!campaignId) return;
    if (showLoading) setLoading(true);
    try {
      const detailsResponse = await apiClient.get<CampaignDetailsResponse>(
        `/sender/campaigns/${campaignId}/details`,
      );
      setDetailsData(detailsResponse.data);
      setError(null);
      try {
        const reportResponse = await apiClient.get<CampaignReportResponse>(
          `/sender/campaigns/${campaignId}/report`,
        );
        setReport(reportResponse.data);
        setReportError(null);
      } catch {
        setReportError('Engagement metrics are temporarily unavailable. Campaign details are still shown.');
      }
    } catch {
      setError('Failed to load campaign details.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchCampaign(true);
  }, [fetchCampaign]);

  useEffect(() => {
    if (detailsData?.details?.status !== 'Sending') return undefined;
    const intervalId = window.setInterval(() => {
      void fetchCampaign(false);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [detailsData?.details?.status, fetchCampaign]);

  const details = detailsData?.details;
  const cards = useMemo(
    () => (report ? buildCampaignReportCards(report.summary) : []),
    [report],
  );

  if (loading) {
    return (
      <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">Loading campaign report…</Typography>
        </Stack>
      </Box>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ width: '100%', maxWidth: 1500, mx: 'auto' }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2.5 }}>
        <Link component={RouterLink} underline="hover" color="text.secondary" to="/email-sender">
          Email campaigns
        </Link>
        <Typography color="text.primary">Campaign report</Typography>
      </Breadcrumbs>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="h4" component="h1" sx={{ fontWeight: 750 }}>
              {details?.campaign_name || details?.subject || 'Campaign report'}
            </Typography>
            {details?.status && (
              <Chip
                label={details.status}
                size="small"
                color={details.status === 'Completed' ? 'success' : details.status === 'Sending' ? 'warning' : 'default'}
              />
            )}
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {details?.subject || 'No subject'}
          </Typography>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
            <Typography variant="caption" color="text.secondary">
              Landing rate <strong>{formatCampaignRate(report?.summary.landing_rate)}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Human click rate <strong>{formatCampaignRate(report?.summary.human_click_rate)}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Open tracking <strong>Off</strong>
            </Typography>
          </Stack>
        </Box>
      </Stack>

      {reportError && <Alert severity="warning" sx={{ mb: 2.5 }}>{reportError}</Alert>}

      {report && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {cards.map((card) => (
              <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.25,
                    height: '100%',
                    borderColor: card.tone === 'warning' ? 'warning.main' : 'divider',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                  <Typography variant="h4" className="dashboard-data-value" sx={{ mt: 0.75, fontWeight: 750 }}>
                    {card.value.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {card.helper}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {!hasCampaignEngagement(report.summary) && (
            <Alert severity="info" sx={{ mb: 3 }}>
              No tracked landing engagement yet. Gmail-accepted sends remain visible above; activity will appear after a tracked donation link is opened and the page script runs.
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 2 }}>
                  <Typography variant="h6">Top donation links</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    Unique sent recipients with landing or human-likely activity.
                  </Typography>
                </Box>
                <Divider />
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Destination</TableCell>
                        <TableCell align="right">Landings</TableCell>
                        <TableCell align="right">Human-likely</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.top_links.length === 0 ? (
                        <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6 }}>No link activity yet.</TableCell></TableRow>
                      ) : report.top_links.map((link) => {
                        const destination = formatCampaignDestination(
                          link.destination_origin,
                          link.destination_path,
                        );
                        return (
                          <TableRow key={`${link.destination_origin}${link.destination_path}`} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 650 }}>{destination.path}</Typography>
                              <Typography variant="caption" color="text.secondary">{destination.host}</Typography>
                            </TableCell>
                            <TableCell align="right" className="dashboard-data-value">{link.landing_visits.toLocaleString()}</TableCell>
                            <TableCell align="right" className="dashboard-data-value">{link.human_likely_clicks.toLocaleString()}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 2 }}>
                  <Typography variant="h6">Recent engagement</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    Recipients are masked; scanner-like activity stays separate.
                  </Typography>
                </Box>
                <Divider />
                <TableContainer sx={{ maxHeight: 390 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Recipient</TableCell>
                        <TableCell>Signal</TableCell>
                        <TableCell align="right">When</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.recent_engagement.length === 0 ? (
                        <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6 }}>No recent engagement.</TableCell></TableRow>
                      ) : report.recent_engagement.map((event, index) => (
                        <TableRow key={`${event.occurred_at}-${event.recipient}-${index}`} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 650 }}>{event.recipient}</Typography>
                            <Typography variant="caption" color="text.secondary">{event.destination_path}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              variant="outlined"
                              color={classificationColor(event.classification)}
                              label={formatActivityClassification(event.classification)}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="caption">
                              {new Date(event.occurred_at).toLocaleString('en-US', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
          sx={{ px: 2.5, py: 2 }}
        >
          <Box>
            <Typography variant="h6">Email content</Typography>
            <Typography variant="body2" color="text.secondary">The saved campaign content, shown without recipient tracking tokens.</Typography>
          </Box>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_event, mode: 'preview' | 'code' | null) => mode && setViewMode(mode)}
            aria-label="Email content view"
          >
            <ToggleButton value="preview" aria-label="Preview email"><VisibilityOutlinedIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="code" aria-label="View email code"><CodeOutlinedIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Divider />
        <Box sx={{ p: 2.5 }}>
          {viewMode === 'preview' ? (
            <EmailPreview subject={details?.subject ?? ''} htmlBody={details?.html_body ?? ''} />
          ) : (
            <TextField
              fullWidth
              multiline
              slotProps={{ input: { readOnly: true } }}
              minRows={14}
              value={details?.html_body ?? ''}
            />
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default CampaignDetailPage;
