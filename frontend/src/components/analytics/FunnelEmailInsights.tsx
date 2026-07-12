import { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, LinearProgress, Paper, Skeleton, Stack,
  ToggleButton, ToggleButtonGroup, Typography, alpha, useTheme,
} from '@mui/material';
import AdsClickRoundedIcon from '@mui/icons-material/AdsClickRounded';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import MarkEmailReadRoundedIcon from '@mui/icons-material/MarkEmailReadRounded';
import MarkEmailUnreadRoundedIcon from '@mui/icons-material/MarkEmailUnreadRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../api/axiosConfig';

interface FunnelEmailData {
  scope: 'new_comer_funnel';
  scopeLabel: string;
  source: 'Brevo' | 'Airtable events';
  periodDays: number;
  totalTags: number;
  syncedTags: number;
  backfillComplete: boolean;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  clickEvents: number;
  deliveryRatePct: number;
  openRatePct: number;
  clickRatePct: number;
  clickToOpenActivityPct: number;
  bounceRatePct: number;
  deliveryIssues: number;
  softBounces: number;
  hardBounces: number;
  blocked: number;
  invalidEmails: number;
  spamReports: number;
  unsubscribes: number;
  deviceMix: Array<{ device: string; count: number; percentage: number }>;
  trend: Array<{ date: string; sent: number; delivered: number; opens: number; clicks: number; issues: number }>;
  rateBasis: 'event_counts' | 'brevo_aggregated';
  rateNotice: string;
  lastSyncedAt: string | null;
}

const numberFormat = new Intl.NumberFormat('en-US');

interface EventMetricProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  helper: string;
  color: string;
}

const EventMetric = ({ icon, label, value, helper, color }: EventMetricProps) => (
  <Paper variant="outlined" sx={{ p: 2.5, height: '100%', bgcolor: 'background.paper' }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
        <Typography variant="h3" sx={{ mt: 1 }}>{numberFormat.format(value)}</Typography>
      </Box>
      <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 3, color, bgcolor: alpha(color, 0.1) }}>
        {icon}
      </Box>
    </Stack>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{helper}</Typography>
  </Paper>
);

const HealthStat = ({ label, value, helper }: { label: string; value: number; helper: string }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h6" sx={{ mt: 0.25 }}>{numberFormat.format(value)}</Typography>
    <Typography variant="caption" color="text.secondary">{helper}</Typography>
  </Box>
);

export const FunnelEmailInsights = () => {
  const theme = useTheme();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FunnelEmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchInsights = async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
        setError('');
      }
      try {
        const response = await apiClient.get<FunnelEmailData>('/dashboard/funnel-email-insights', { params: { days } });
        if (active) {
          setData(response.data);
          setError('');
        }
      } catch {
        if (active && showLoading) setError('Funnel email engagement is not available yet. The first Supabase sync may still be running.');
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };
    fetchInsights(true);
    const refreshInterval = window.setInterval(() => fetchInsights(), 10 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [days]);

  const handlePeriodChange = (_event: React.MouseEvent<HTMLElement>, value: number | null) => {
    if (value) setDays(value);
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3 }} aria-label="Loading funnel email engagement">
        <Skeleton width={280} height={36} />
        <Skeleton width="48%" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2, mt: 3 }}>
          {[0, 1, 2, 3].map(item => <Skeleton key={item} variant="rounded" height={132} />)}
        </Box>
        <Skeleton variant="rounded" height={320} sx={{ mt: 2 }} />
      </Paper>
    );
  }

  if (error || !data) return <Alert severity="info">{error || 'No funnel email events are available.'}</Alert>;

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' }, mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
            <EmailRoundedIcon color="primary" />
            <Typography variant="h5">Funnel email engagement</Typography>
            <Chip label="New Comer Funnel only" color="primary" variant="outlined" size="small" />
            <Chip label={data.source} variant="outlined" size="small" />
            {data.rateBasis === 'brevo_aggregated' && !data.backfillComplete && (
              <Chip label={`Backfill ${data.syncedTags}/${data.totalTags}`} color="warning" variant="outlined" size="small" />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Transactional delivery and engagement generated exclusively by the automated funnel.
          </Typography>
          {data.lastSyncedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Brevo totals refreshed {dayjs(data.lastSyncedAt).format('MMM D, h:mm A')}
            </Typography>
          )}
        </Box>
        <ToggleButtonGroup exclusive size="small" value={days} onChange={handlePeriodChange} aria-label="Email engagement period">
          <ToggleButton value={7}>7 days</ToggleButton>
          <ToggleButton value={30}>30 days</ToggleButton>
          <ToggleButton value={90}>90 days</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
        <EventMetric icon={<SendRoundedIcon />} label="Sent" value={data.sent} helper={data.rateBasis === 'brevo_aggregated' ? 'Transactional requests recorded by Brevo' : 'Waiting for the first Brevo aggregate sync'} color={theme.palette.primary.main} />
        <EventMetric icon={<MarkEmailReadRoundedIcon />} label="Delivered" value={data.delivered} helper={data.rateBasis === 'brevo_aggregated' ? `${data.deliveryRatePct.toFixed(1)}% delivery rate` : 'Delivery totals are not available yet'} color={theme.palette.success.main} />
        <EventMetric icon={<MarkEmailUnreadRoundedIcon />} label="Unique opens" value={data.uniqueOpens} helper={data.rateBasis === 'brevo_aggregated' ? `${data.openRatePct.toFixed(1)}% of delivered emails` : 'Unique open events recorded'} color={theme.palette.secondary.main} />
        <EventMetric icon={<AdsClickRoundedIcon />} label="Unique clicks" value={data.uniqueClicks} helper={data.rateBasis === 'brevo_aggregated' ? `${data.clickRatePct.toFixed(1)}% click rate · ${data.clickToOpenActivityPct.toFixed(1)}% click-to-open` : `${data.clickToOpenActivityPct.toFixed(1)} clicks per 100 unique opens`} color={theme.palette.info.main} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(260px, 0.8fr)' }, gap: 2, mt: 2 }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>Daily engagement trend</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Event activity over the selected period.</Typography>
          <Box sx={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 12, right: 12, left: -18, bottom: 8 }}>
                <defs>
                  <linearGradient id="funnelDeliveredFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="funnelOpenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.24} />
                    <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={alpha(theme.palette.text.secondary, 0.12)} />
                <XAxis dataKey="date" tickFormatter={value => dayjs(value).format('D/M')} tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={22} />
                <YAxis allowDecimals={false} tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={value => dayjs(String(value)).format('MMM D, YYYY')} contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 12 }} />
                <Legend iconType="circle" />
                {data.rateBasis === 'brevo_aggregated' && (
                  <Area type="monotone" dataKey="delivered" name="Delivered" stroke={theme.palette.success.main} strokeWidth={2.5} fill="url(#funnelDeliveredFill)" />
                )}
                <Area type="monotone" dataKey="opens" name="Unique opens" stroke={theme.palette.primary.main} strokeWidth={2.5} fill="url(#funnelOpenFill)" />
                <Area type="monotone" dataKey="clicks" name="Unique clicks" stroke={theme.palette.info.main} strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="issues" name="Delivery issues" stroke={theme.palette.warning.main} strokeWidth={1.75} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <ReportProblemRoundedIcon color="warning" />
              <Typography variant="subtitle1" fontWeight={700}>Delivery health</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Failures and audience-loss signals from Brevo.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2.5 }}>
              <HealthStat label="Delivery issues" value={data.deliveryIssues} helper={`${data.bounceRatePct.toFixed(1)}% of sent`} />
              <HealthStat label="Hard bounces" value={data.hardBounces} helper={`${numberFormat.format(data.softBounces)} soft`} />
              <HealthStat label="Unsubscribes" value={data.unsubscribes} helper="During this period" />
              <HealthStat label="Spam reports" value={data.spamReports} helper={`${numberFormat.format(data.blocked)} blocked`} />
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <DevicesRoundedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={700}>Device mix</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Devices used for opens and clicks.</Typography>
            {data.deviceMix.length ? (
              <Stack spacing={2.25}>
                {data.deviceMix.map(item => (
                  <Box key={item.device}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ mb: 0.75 }}>
                      <Typography variant="body2" fontWeight={600}>{item.device}</Typography>
                      <Typography variant="body2" color="text.secondary">{item.percentage.toFixed(1)}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={item.percentage} sx={{ height: 7, borderRadius: 7, bgcolor: alpha(theme.palette.primary.main, 0.09), '& .MuiLinearProgress-bar': { borderRadius: 7 } }} />
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">No device data is available for this period.</Typography>
            )}
          </Paper>
        </Stack>
      </Box>

      <Alert severity={data.rateBasis === 'brevo_aggregated' ? (data.backfillComplete ? 'success' : 'warning') : 'info'} variant="outlined" sx={{ mt: 2 }}>
        {data.rateNotice}
      </Alert>
    </Paper>
  );
};
