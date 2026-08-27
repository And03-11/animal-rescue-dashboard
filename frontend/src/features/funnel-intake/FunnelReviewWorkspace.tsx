import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import axios from 'axios';

import {
  applyFunnelReviewAction,
  getFunnelReviewEvidence,
  getFunnelReviewOptions,
  getPendingFunnelReviews,
} from './api';
import type {
  BrevoReviewMatch,
  ContactActivity,
  FunnelReviewAction,
  FunnelReviewEvidence,
  FunnelReviewItem,
  MailchimpReviewMatch,
} from './types';

type PendingAction = 'approve' | 'potential_duplicate' | 'change_stage';

const panelSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 3,
  bgcolor: 'background.paper',
  backgroundImage: 'none',
} as const;

function personName(person: Pick<FunnelReviewItem, 'first_name' | 'last_name'>) {
  return `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unnamed donor';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(parsed);
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

function EvidenceBadge({ reason }: { reason: string }) {
  const label = reason === 'email' ? 'Exact email' : reason.replace(/_/g, ' ');
  return (
    <Chip
      size="small"
      label={label}
      color={reason === 'email' ? 'primary' : 'default'}
      variant={reason === 'email' ? 'filled' : 'outlined'}
      sx={{ textTransform: 'capitalize', height: 24 }}
    />
  );
}

function ActivityList({ activity }: { activity: ContactActivity[] }) {
  if (!activity.length) {
    return <Typography variant="body2" color="text.secondary">No recent email activity returned.</Typography>;
  }
  return (
    <Stack spacing={1}>
      {activity.slice(0, 6).map((event, index) => (
        <Box
          key={`${event.timestamp || 'event'}-${index}`}
          sx={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) auto', gap: 1.25, alignItems: 'start' }}
        >
          <Box sx={{ mt: 0.75, width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {event.subject || event.campaign_name || `Campaign ${event.campaign_id || ''}`.trim()}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {(event.type || 'activity').replace(/_/g, ' ')}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {formatDate(event.timestamp)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

type SourceMatch = BrevoReviewMatch | MailchimpReviewMatch;

function MatchCard({ source, match }: { source: 'Brevo' | 'Mailchimp'; match: SourceMatch }) {
  const mailchimpMatch = match as MailchimpReviewMatch;
  const brevoMatch = match as BrevoReviewMatch;
  const tags = source === 'Mailchimp' ? mailchimpMatch.tags : brevoMatch.lists;
  const status = source === 'Mailchimp'
    ? mailchimpMatch.status || 'Status unavailable'
    : brevoMatch.email_blacklisted ? 'Email blacklisted' : 'Email active';
  const changed = source === 'Mailchimp' ? mailchimpMatch.last_changed : brevoMatch.modified_at;

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.default' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={650} noWrap>
            {`${match.first_name || ''} ${match.last_name || ''}`.trim() || 'Name unavailable'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{match.email || 'Email unavailable'}</Typography>
        </Box>
        <Chip size="small" label={status} variant="outlined" color={status.includes('blacklisted') ? 'warning' : 'default'} />
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.5 }}>
        {match.matched_by.map((reason) => <EvidenceBadge key={reason} reason={reason} />)}
      </Stack>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">{source === 'Brevo' ? 'Lists' : 'Tags'}</Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
          {tags.length
            ? tags.map((tag) => <Chip key={tag} size="small" label={tag} sx={{ height: 24 }} />)
            : <Typography variant="body2" color="text.secondary">None returned</Typography>}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.25 }}>
        <Typography variant="caption" color="text.secondary">Recent email activity</Typography>
        <Typography variant="caption" color="text.secondary">Updated {formatDate(changed)}</Typography>
      </Stack>
      <ActivityList activity={match.recent_activity || []} />
    </Box>
  );
}

function SourcePanel({
  title,
  searched_by,
  status,
  message,
  matches,
}: {
  title: 'Brevo' | 'Mailchimp';
  searched_by: string[];
  status: 'ok' | 'unavailable';
  message?: string;
  matches: SourceMatch[];
}) {
  return (
    <Paper variant="outlined" sx={{ ...panelSx, p: 2.25, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontSize="1rem">{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            Searched by {searched_by.join(' + ')}
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={status === 'ok' ? <TaskAltRoundedIcon /> : <ErrorOutlineRoundedIcon />}
          label={status === 'ok' ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'Unavailable'}
          color={status === 'ok' && matches.length ? 'primary' : status === 'unavailable' ? 'warning' : 'default'}
          variant="outlined"
        />
      </Stack>

      {status === 'unavailable' ? (
        <Alert severity="warning" variant="outlined">{message || `${title} search failed.`}</Alert>
      ) : matches.length ? (
        <Stack spacing={1.5}>{matches.map((match, index) => (
          <MatchCard key={`${match.email || match.id || index}`} source={title} match={match} />
        ))}</Stack>
      ) : (
        <Box sx={{ py: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2.5 }}>
          <SearchRoundedIcon color="disabled" />
          <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>No matches returned</Typography>
          <Typography variant="caption" color="text.secondary">This is evidence, not an automatic decision.</Typography>
        </Box>
      )}
    </Paper>
  );
}

export function FunnelReviewWorkspace() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [items, setItems] = useState<FunnelReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<FunnelReviewEvidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [stageOptions, setStageOptions] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [selectedStage, setSelectedStage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const [queue, options] = await Promise.all([
        getPendingFunnelReviews(),
        getFunnelReviewOptions(),
      ]);
      setItems(queue.items);
      setTotal(queue.total);
      setStageOptions(options.stage_options);
      setSelectedId((current) => {
        if (current && queue.items.some((item) => item.id === current)) return current;
        return queue.items[0]?.id || null;
      });
    } catch (error) {
      setQueueError(apiErrorMessage(error, 'Could not load the review queue.'));
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  useEffect(() => {
    if (!selectedId) {
      setEvidence(null);
      return;
    }
    let active = true;
    setLoadingEvidence(true);
    setEvidence(null);
    getFunnelReviewEvidence(selectedId)
      .then((result) => { if (active) setEvidence(result); })
      .catch((error) => {
        if (active) setNotice({ severity: 'error', message: apiErrorMessage(error, 'Evidence search failed.') });
      })
      .finally(() => { if (active) setLoadingEvidence(false); });
    return () => { active = false; };
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [
      item.first_name, item.last_name, ...item.emails, item.region, item.status,
    ].some((value) => String(value || '').toLowerCase().includes(normalized)));
  }, [items, query]);

  const selected = evidence?.donor || items.find((item) => item.id === selectedId) || null;

  const closeDialog = () => {
    if (saving) return;
    setPendingAction(null);
    setSelectedStage('');
  };

  const confirmAction = async () => {
    if (!selected || !pendingAction) return;
    let action: FunnelReviewAction;
    if (pendingAction === 'change_stage') {
      if (!selectedStage) return;
      action = { action: 'change_stage', value: selectedStage };
    } else {
      action = { action: pendingAction };
    }
    setSaving(true);
    try {
      await applyFunnelReviewAction(selected.id, action);
      const label = pendingAction === 'approve'
        ? 'Approved for Funnel.'
        : pendingAction === 'potential_duplicate'
          ? 'Marked as Potential Duplicate.'
          : `Stage changed to ${selectedStage}.`;
      setNotice({ severity: 'success', message: label });
      closeDialog();
      await loadQueue();
    } catch (error) {
      setNotice({ severity: 'error', message: apiErrorMessage(error, 'The Airtable update failed.') });
    } finally {
      setSaving(false);
      setPendingAction(null);
      setSelectedStage('');
    }
  };

  const dialogCopy = pendingAction === 'approve'
    ? { title: 'Approve for Funnel?', body: 'Only Stage will change from Pending Approval to Funnel.' }
    : pendingAction === 'potential_duplicate'
      ? { title: 'Mark as Potential Duplicate?', body: 'Only Status will change to Potential Duplicate.' }
      : { title: 'Change donor stage?', body: 'Choose the exact Airtable Stage value to apply.' };

  return (
    <Stack spacing={2.25}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={650}>Pending approval review</Typography>
          <Typography variant="body2" color="text.secondary">
            Gather the evidence here. You make every final decision.
          </Typography>
        </Box>
        <Chip icon={<PersonSearchRoundedIcon />} label={`${total} waiting`} variant="outlined" />
      </Stack>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert>}
      {queueError && <Alert severity="error" action={<Button color="inherit" onClick={loadQueue}>Retry</Button>}>{queueError}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(19rem, 22rem) minmax(0, 1fr)', gap: 2, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ ...panelSx, overflow: 'hidden' }}>
          <Stack direction="row" gap={1} sx={{ p: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search queue"
              slotProps={{ input: { startAdornment: <SearchRoundedIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
            />
            <Button variant="outlined" aria-label="Refresh queue" onClick={loadQueue} sx={{ minWidth: 42, px: 1 }}>
              <RefreshRoundedIcon fontSize="small" />
            </Button>
          </Stack>
          <Divider />
          <List disablePadding sx={{ maxHeight: narrow ? 340 : 'min(68vh, 760px)', overflowY: 'auto' }}>
            {loadingQueue ? [0, 1, 2, 3].map((key) => (
              <Box key={key} sx={{ p: 2 }}><Skeleton width="65%" /><Skeleton width="90%" /></Box>
            )) : filteredItems.length ? filteredItems.map((item) => {
              const active = item.id === selectedId;
              return (
                <ListItemButton
                  key={item.id}
                  selected={active}
                  onClick={() => setSelectedId(item.id)}
                  sx={{ alignItems: 'flex-start', px: 2, py: 1.6, borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Stack direction="row" gap={1.25} sx={{ width: '100%', minWidth: 0 }}>
                    <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: active ? 'primary.main' : 'action.selected' }}>
                      {(item.first_name?.[0] || '?').toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={650} noWrap>{personName(item)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {item.emails[0] || 'No linked email'}
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                        <Typography variant="caption" color="text.secondary">{item.region || 'No region'}</Typography>
                        <Typography variant="caption" color="text.secondary">{formatDate(item.last_modified)}</Typography>
                      </Stack>
                    </Box>
                  </Stack>
                </ListItemButton>
              );
            }) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CheckRoundedIcon color="success" />
                <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>No records in this view</Typography>
              </Box>
            )}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ ...panelSx, minWidth: 0, overflow: 'hidden' }}>
          {!selected ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <PersonSearchRoundedIcon color="disabled" sx={{ fontSize: 40 }} />
              <Typography fontWeight={600} sx={{ mt: 1 }}>Select a donor to review</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={650}>{personName(selected)}</Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1 }}>
                      {selected.emails.map((email) => <Chip key={email} size="small" icon={<EmailRoundedIcon />} label={email} />)}
                    </Stack>
                  </Box>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <Chip size="small" label={selected.region || 'No region'} variant="outlined" />
                    <Chip size="small" label={selected.status || 'No status'} variant="outlined" />
                  </Stack>
                </Stack>

                <Box sx={{ mt: 2.25, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: 1 }}>
                  {[
                    ['Last donation', formatDate(selected.last_donation)],
                    ['Last form', selected.last_form_title || '—'],
                    ['Donations', String(selected.donations_count || 0)],
                    ['Total donated', formatCurrency(selected.total_donated)],
                    ['Current stage', selected.stage || '—'],
                    ['Airtable tag', selected.tag || '—'],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.035), minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={600} noWrap title={value}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Divider />
              <Box sx={{ p: { xs: 2, md: 2.5 }, bgcolor: alpha(theme.palette.background.default, 0.35) }}>
                {loadingEvidence ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
                    {[0, 1].map((key) => <Skeleton key={key} variant="rounded" height={320} />)}
                  </Box>
                ) : evidence ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
                    <SourcePanel title="Brevo" {...evidence.brevo} />
                    <SourcePanel title="Mailchimp" {...evidence.mailchimp} />
                  </Box>
                ) : null}
              </Box>

              <Divider />
              <Box sx={{ p: 2, position: 'sticky', bottom: 0, zIndex: 2, bgcolor: alpha(theme.palette.background.paper, 0.96), backdropFilter: 'blur(12px)' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
                  <Box>
                    <Typography variant="body2" fontWeight={650}>Your decision</Typography>
                    <Typography variant="caption" color="text.secondary">No field changes until you confirm an action.</Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                    <Button variant="outlined" startIcon={<SwapHorizRoundedIcon />} onClick={() => setPendingAction('change_stage')}>Change stage</Button>
                    <Button variant="outlined" color="warning" startIcon={<ContentCopyRoundedIcon />} onClick={() => setPendingAction('potential_duplicate')}>Potential duplicate</Button>
                    <Button variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => setPendingAction('approve')}>Approve for Funnel</Button>
                  </Stack>
                </Stack>
              </Box>
            </>
          )}
        </Paper>
      </Box>

      <Dialog open={Boolean(pendingAction)} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogCopy.title}</DialogTitle>
        <DialogContent>
          <Alert severity="info" variant="outlined" sx={{ mb: pendingAction === 'change_stage' ? 2.5 : 0 }}>
            {dialogCopy.body}
          </Alert>
          {pendingAction === 'change_stage' && (
            <FormControl fullWidth>
              <InputLabel id="review-stage-label">Stage</InputLabel>
              <Select
                labelId="review-stage-label"
                label="Stage"
                value={selectedStage}
                onChange={(event) => setSelectedStage(event.target.value)}
              >
                {stageOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            color={pendingAction === 'potential_duplicate' ? 'warning' : 'primary'}
            onClick={confirmAction}
            disabled={saving || (pendingAction === 'change_stage' && !selectedStage)}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm change
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
