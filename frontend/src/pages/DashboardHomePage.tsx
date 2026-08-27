import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Link as RouterLink } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { motion, useReducedMotion } from 'motion/react';

import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import MonetizationOnRoundedIcon from '@mui/icons-material/MonetizationOnRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

import apiClient from '../api/axiosConfig';
import { DonationSourceChart } from '../components/DonationSourceChart';
import { StrategicInsightsPanel, type StrategicInsights } from '../components/StrategicInsightsPanel';
import { TopDonorsTable, type Donor } from '../components/TopDonorsTable';
import { useWebSocket } from '../context/webSocketContext';

interface GlanceData {
  amountToday: number;
  donationsCountToday: number;
  amountThisMonth: number;
  donationsCountThisMonth: number;
  glanceTrend: { date: string; total: number; count?: number }[];
  momGrowth: number;
  amountLastMonthSameDay: number;
}

interface FilteredData {
  amountInRange: number;
  donationsCount: number;
  dailyTrend: { date: string; total: number; count: number }[];
}

interface SourceData {
  name: string;
  value: number;
  percentage: number;
}

interface SourceResponse {
  total_amount: number;
  breakdown: SourceData[];
}

interface MetricTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'primary' | 'secondary' | 'success';
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat('en-US');

const MetricTile = ({ icon, label, value, detail, tone = 'primary' }: MetricTileProps) => {
  const theme = useTheme();
  const color = theme.palette[tone].main;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.25, sm: 2.5 },
        height: '100%',
        minHeight: 154,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: `linear-gradient(150deg, ${alpha(color, 0.08)}, ${theme.palette.background.paper} 52%)`,
        transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(color, 0.36),
          boxShadow: `0 18px 44px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.2 : 0.07)}`,
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Typography variant="body2" color="text.secondary" fontWeight={650}>{label}</Typography>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '12px', color, bgcolor: alpha(color, 0.1) }}>
          {icon}
        </Box>
      </Stack>
      <Box sx={{ mt: 2 }}>
        <Typography className="dashboard-data-value" sx={{ fontSize: { xs: '1.7rem', xl: '1.95rem' }, fontWeight: 600, lineHeight: 1.1 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.8, display: 'block' }}>{detail}</Typography>
      </Box>
    </Paper>
  );
};

const DashboardSkeleton = () => (
  <Stack spacing={2.5} aria-label="Loading dashboard overview">
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 7 }}><Skeleton variant="rounded" height={330} /></Grid>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Grid container spacing={2.5}>
          {[0, 1, 2, 3].map((item) => (
            <Grid key={item} size={{ xs: 12, sm: 6 }}><Skeleton variant="rounded" height={154} /></Grid>
          ))}
        </Grid>
      </Grid>
    </Grid>
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 8 }}><Skeleton variant="rounded" height={430} /></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Skeleton variant="rounded" height={430} /></Grid>
    </Grid>
  </Stack>
);

export const DashboardHomePage = () => {
  const theme = useTheme();
  const reduceMotion = Boolean(useReducedMotion());
  const { subscribe } = useWebSocket();
  const [glanceData, setGlanceData] = useState<GlanceData | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredData | null>(null);
  const [sourceData, setSourceData] = useState<SourceData[]>([]);
  const [strategicInsights, setStrategicInsights] = useState<StrategicInsights | null>(null);
  const [topDonors, setTopDonors] = useState<Donor[]>([]);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [loading, setLoading] = useState({ glance: true, filter: false, topDonors: true, sources: true, insights: true });
  const [error, setError] = useState({ glance: '', filter: '', topDonors: '', sources: '', insights: '' });

  const fetchGlanceMetrics = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading((previous) => ({ ...previous, glance: true }));
    setError((previous) => ({ ...previous, glance: '' }));
    try {
      const response = await apiClient.get<{ glance: GlanceData }>('/dashboard/metrics');
      setGlanceData(response.data.glance);
    } catch {
      setError((previous) => ({ ...previous, glance: 'We could not load the impact overview. Try again in a moment.' }));
    } finally {
      if (!isRefresh) setLoading((previous) => ({ ...previous, glance: false }));
    }
  }, []);

  const fetchTopDonors = useCallback(async () => {
    setLoading((previous) => ({ ...previous, topDonors: true }));
    setError((previous) => ({ ...previous, topDonors: '' }));
    try {
      const response = await apiClient.get<Donor[]>('/dashboard/top-donors');
      setTopDonors(response.data);
    } catch {
      setError((previous) => ({ ...previous, topDonors: 'Top donor data is temporarily unavailable.' }));
    } finally {
      setLoading((previous) => ({ ...previous, topDonors: false }));
    }
  }, []);

  const fetchSources = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading((previous) => ({ ...previous, sources: true }));
    setError((previous) => ({ ...previous, sources: '' }));
    try {
      const response = await apiClient.get<SourceResponse>('/dashboard/sources');
      setSourceData(response.data.breakdown);
    } catch {
      setError((previous) => ({ ...previous, sources: 'Donation source data is temporarily unavailable.' }));
    } finally {
      if (!isRefresh) setLoading((previous) => ({ ...previous, sources: false }));
    }
  }, []);

  const fetchStrategicInsights = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading((previous) => ({ ...previous, insights: true }));
    setError((previous) => ({ ...previous, insights: '' }));
    try {
      const response = await apiClient.get<StrategicInsights>('/dashboard/insights');
      setStrategicInsights(response.data);
    } catch {
      setError((previous) => ({ ...previous, insights: 'Strategic insights could not be refreshed.' }));
    } finally {
      if (!isRefresh) setLoading((previous) => ({ ...previous, insights: false }));
    }
  }, []);

  const handleSearchByRange = useCallback(async (isRefresh = false) => {
    if (!startDate || !endDate || startDate.isAfter(endDate)) {
      setFilteredData(null);
      setError((previous) => ({ ...previous, filter: 'Choose a valid start and end date.' }));
      return;
    }

    if (!isRefresh) setLoading((previous) => ({ ...previous, filter: true }));
    setError((previous) => ({ ...previous, filter: '' }));
    try {
      const response = await apiClient.get<{ filtered: FilteredData }>('/dashboard/metrics', {
        params: {
          start_date: startDate.format('YYYY-MM-DD'),
          end_date: endDate.format('YYYY-MM-DD'),
        },
      });
      setFilteredData(response.data.filtered);
    } catch {
      setError((previous) => ({ ...previous, filter: 'We could not analyze that date range.' }));
    } finally {
      if (!isRefresh) setLoading((previous) => ({ ...previous, filter: false }));
    }
  }, [endDate, startDate]);

  useEffect(() => {
    fetchGlanceMetrics();
    fetchTopDonors();
    fetchSources();
    fetchStrategicInsights();
  }, [fetchGlanceMetrics, fetchSources, fetchStrategicInsights, fetchTopDonors]);

  useEffect(() => {
    const unsubscribe = subscribe('new_donation', () => {
      fetchGlanceMetrics(true);
      fetchSources(true);
      fetchStrategicInsights(true);
      if (startDate && endDate) handleSearchByRange(true);
    });
    return unsubscribe;
  }, [endDate, fetchGlanceMetrics, fetchSources, fetchStrategicInsights, handleSearchByRange, startDate, subscribe]);

  const formatXAxis = (value: string) => (value.includes(':') ? value : dayjs(value).format('D/M'));
  const averageGift = glanceData && glanceData.donationsCountThisMonth > 0
    ? glanceData.amountThisMonth / glanceData.donationsCountThisMonth
    : 0;
  const todayAverageGift = glanceData && glanceData.donationsCountToday > 0
    ? glanceData.amountToday / glanceData.donationsCountToday
    : 0;
  const recentSevenDays = glanceData?.glanceTrend.slice(-7) ?? [];
  const sevenDayDailyAverage = recentSevenDays.length > 0
    ? recentSevenDays.reduce((sum, day) => sum + day.total, 0) / recentSevenDays.length
    : 0;
  const strongestRecentDay = glanceData?.glanceTrend.reduce<{ date: string; total: number } | null>(
    (peak, day) => (!peak || day.total > peak.total ? day : peak),
    null,
  );
  const comparisonMax = Math.max(glanceData?.amountThisMonth ?? 0, glanceData?.amountLastMonthSameDay ?? 0, 1);
  const rangePresets = [
    { label: '7 days', start: dayjs().subtract(6, 'day'), end: dayjs() },
    { label: '30 days', start: dayjs().subtract(29, 'day'), end: dayjs() },
    { label: 'This month', start: dayjs().startOf('month'), end: dayjs() },
    { label: 'Last month', start: dayjs().subtract(1, 'month').startOf('month'), end: dayjs().subtract(1, 'month').endOf('month') },
  ];
  const selectedPreset = rangePresets.find((preset) => (
    startDate?.isSame(preset.start, 'day') && endDate?.isSame(preset.end, 'day')
  ))?.label;
  const selectedRangeDays = startDate && endDate && !startDate.isAfter(endDate)
    ? endDate.diff(startDate, 'day') + 1
    : 0;
  const filteredAverageGift = filteredData && filteredData.donationsCount > 0
    ? filteredData.amountInRange / filteredData.donationsCount
    : 0;
  const filteredPeakDay = filteredData?.dailyTrend.reduce<{ date: string; total: number } | null>(
    (peak, day) => (!peak || day.total > peak.total ? day : peak),
    null,
  );
  const reveal = (delay = 0) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.38, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: { xs: 2.5, md: 3.25 } }}>
      <motion.div {...reveal()}>
        <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box>
            <Typography component="h1" variant="h4" fontWeight={750}>
              Fundraising overview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
              {dayjs().format('dddd, MMMM D, YYYY')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
            <Button component={RouterLink} to="/analytics" variant="outlined" endIcon={<ArrowOutwardRoundedIcon />}>
              Open analytics
            </Button>
          </Stack>
        </Box>
      </motion.div>

      {loading.glance ? (
        <DashboardSkeleton />
      ) : error.glance ? (
        <Alert severity="error" action={<Button color="inherit" onClick={() => fetchGlanceMetrics()}>Retry</Button>}>
          {error.glance}
        </Alert>
      ) : glanceData && (
        <>
          <motion.div {...reveal(0.05)}>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, lg: 7 }}>
                <Paper
                  sx={{
                    minHeight: { xs: 342, md: 330 },
                    height: '100%',
                    p: { xs: 2.75, sm: 3.5, lg: 4 },
                    position: 'relative',
                    overflow: 'hidden',
                    color: '#F6FFFC',
                    borderColor: alpha(theme.palette.primary.light, 0.26),
                    background: theme.palette.mode === 'dark'
                      ? 'linear-gradient(135deg, #12352D 0%, #0B2621 55%, #10211C 100%)'
                      : 'linear-gradient(135deg, #0D776B 0%, #096055 58%, #12483F 100%)',
                    boxShadow: `0 30px 80px ${alpha('#001B15', theme.palette.mode === 'dark' ? 0.34 : 0.2)}`,
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      width: 340,
                      height: 340,
                      borderRadius: '42% 58% 62% 38% / 48% 38% 62% 52%',
                      bgcolor: alpha(theme.palette.primary.light, 0.12),
                      right: -120,
                      top: -140,
                      transform: 'rotate(18deg)',
                    },
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      width: 220,
                      height: 220,
                      borderRadius: '50%',
                      border: `1px solid ${alpha('#FFFFFF', 0.11)}`,
                      right: 52,
                      bottom: -160,
                      boxShadow: `0 0 0 42px ${alpha('#FFFFFF', 0.025)}, 0 0 0 84px ${alpha('#FFFFFF', 0.018)}`,
                    },
                  }}
                >
                  <Box sx={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                      <Box>
                        <Typography variant="overline" sx={{ color: alpha('#FFFFFF', 0.66) }}>Raised this month</Typography>
                        <Typography className="dashboard-data-value" sx={{ mt: 0.75, fontSize: { xs: '2.55rem', sm: '3.65rem', xl: '4.2rem' }, fontWeight: 500, lineHeight: 1 }}>
                          {currency.format(glanceData.amountThisMonth)}
                        </Typography>
                      </Box>
                      <Chip
                        icon={glanceData.momGrowth >= 0 ? <TrendingUpRoundedIcon /> : <TrendingDownRoundedIcon />}
                        label={`${glanceData.momGrowth > 0 ? '+' : ''}${glanceData.momGrowth.toFixed(1)}% vs last month`}
                        sx={{
                          display: { xs: 'none', sm: 'flex' },
                          color: '#FFFFFF',
                          bgcolor: alpha('#FFFFFF', 0.09),
                          border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                          '& .MuiChip-icon': { color: glanceData.momGrowth >= 0 ? theme.palette.primary.light : theme.palette.secondary.light },
                        }}
                      />
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 3 }} sx={{ mt: 2 }}>
                      <Typography sx={{ color: alpha('#FFFFFF', 0.74) }}>
                        <strong style={{ color: '#FFFFFF' }}>{numberFormat.format(glanceData.donationsCountThisMonth)}</strong> donations received
                      </Typography>
                      <Typography sx={{ color: alpha('#FFFFFF', 0.74) }}>
                        <strong style={{ color: '#FFFFFF' }}>{preciseCurrency.format(averageGift)}</strong> average gift
                      </Typography>
                    </Stack>

                    <Box sx={{ mt: 'auto', pt: 4 }}>
                      <Typography variant="caption" sx={{ display: 'block', mb: 1, color: alpha('#FFFFFF', 0.7) }}>
                        This month to date
                      </Typography>
                      <Box role="img" aria-label={`This month ${currency.format(glanceData.amountThisMonth)}`} sx={{ height: 8, borderRadius: 10, bgcolor: alpha('#FFFFFF', 0.09), overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.max((glanceData.amountThisMonth / comparisonMax) * 100, 3)}%`, height: '100%', borderRadius: 'inherit', background: `linear-gradient(90deg, ${theme.palette.primary.light}, #B8F5E7)` }} />
                      </Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5, mb: 1 }}>
                        <Typography variant="caption" sx={{ color: alpha('#FFFFFF', 0.62) }}>Last month, same point</Typography>
                        <Typography variant="caption" sx={{ color: alpha('#FFFFFF', 0.78) }}>{currency.format(glanceData.amountLastMonthSameDay)}</Typography>
                      </Stack>
                      <Box role="img" aria-label={`Last month at the same point ${currency.format(glanceData.amountLastMonthSameDay)}`} sx={{ height: 6, borderRadius: 10, bgcolor: alpha('#FFFFFF', 0.08), overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.max((glanceData.amountLastMonthSameDay / comparisonMax) * 100, 3)}%`, height: '100%', borderRadius: 'inherit', bgcolor: alpha('#FFFFFF', 0.36) }} />
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, lg: 5 }}>
                <Grid container spacing={2.5} sx={{ height: '100%' }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <MetricTile
                      icon={<MonetizationOnRoundedIcon fontSize="small" />}
                      label="Raised today"
                      value={preciseCurrency.format(glanceData.amountToday)}
                      detail="Revenue recorded today"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <MetricTile
                      icon={<ReceiptLongRoundedIcon fontSize="small" />}
                      label="Gifts today"
                      value={numberFormat.format(glanceData.donationsCountToday)}
                      detail={`${preciseCurrency.format(todayAverageGift)} average today`}
                      tone="secondary"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <MetricTile
                      icon={<InsightsRoundedIcon fontSize="small" />}
                      label="7-day daily average"
                      value={currency.format(sevenDayDailyAverage)}
                      detail="Average revenue per day"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <MetricTile
                      icon={<TrendingUpRoundedIcon fontSize="small" />}
                      label="Strongest recent day"
                      value={currency.format(strongestRecentDay?.total ?? 0)}
                      detail={strongestRecentDay ? dayjs(strongestRecentDay.date).format('MMM D · [highest in 30 days]') : 'No recent activity'}
                      tone="success"
                    />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </motion.div>

          <motion.div {...reveal(0.1)}>
            <Grid container spacing={2.5} alignItems="stretch">
              <Grid size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0 }}>
                <Paper sx={{ p: { xs: 2.25, sm: 3 }, height: 440, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ mb: 2.5 }}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <InsightsRoundedIcon color="primary" fontSize="small" />
                        <Typography variant="h5">Donation pulse</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Thirty days of giving velocity and donor activity.</Typography>
                    </Box>
                    <Chip size="small" label="Last 30 days" variant="outlined" />
                  </Stack>
                  <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                      <AreaChart data={glanceData.glanceTrend} margin={{ top: 12, right: 8, left: 0, bottom: 10 }}>
                        <defs>
                          <linearGradient id="impactAmount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.36} />
                            <stop offset="92%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="impactCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.palette.secondary.main} stopOpacity={0.22} />
                            <stop offset="92%" stopColor={theme.palette.secondary.main} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={alpha(theme.palette.text.secondary, 0.1)} vertical={false} strokeDasharray="4 6" />
                        <XAxis dataKey="date" tickFormatter={formatXAxis} axisLine={false} tickLine={false} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} dy={10} />
                        <YAxis yAxisId="amount" tickFormatter={(value) => `$${value}`} axisLine={false} tickLine={false} width={54} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                        <YAxis yAxisId="count" orientation="right" axisLine={false} tickLine={false} width={30} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                        <ChartTooltip
                          formatter={(value: number, name: string) => [name === 'Donations' ? numberFormat.format(Math.round(value)) : preciseCurrency.format(value), name]}
                          contentStyle={{ backgroundColor: alpha(theme.palette.background.paper, 0.94), backdropFilter: 'blur(14px)', border: `1px solid ${theme.palette.divider}`, borderRadius: 14, boxShadow: theme.shadows[3] }}
                        />
                        <Legend iconType="circle" verticalAlign="top" align="right" height={34} />
                        <Area yAxisId="amount" type="monotone" dataKey="total" name="Raised" stroke={theme.palette.primary.main} strokeWidth={2.6} fill="url(#impactAmount)" activeDot={{ r: 5, strokeWidth: 3, stroke: theme.palette.background.paper }} />
                        <Area yAxisId="count" type="monotone" dataKey="count" name="Donations" stroke={theme.palette.secondary.main} strokeWidth={2} strokeDasharray="5 5" fill="url(#impactCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, lg: 4 }}>
                <DonationSourceChart data={sourceData} loading={loading.sources} error={error.sources} />
              </Grid>
            </Grid>
          </motion.div>
        </>
      )}

      <motion.div {...reveal(0.14)}>
        <StrategicInsightsPanel data={strategicInsights} loading={loading.insights} error={error.insights} />
      </motion.div>

      <motion.div {...reveal(0.18)}>
        <Grid container spacing={2.5} alignItems="stretch">
          <Grid size={{ xs: 12, xl: 5 }} sx={{ minWidth: 0 }}>
            <Paper sx={{ p: { xs: 2.25, sm: 3 }, height: '100%', minHeight: 560, overflow: 'hidden' }}>
              <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                  <Box sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: '15px', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.11), border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}` }}>
                    <QueryStatsRoundedIcon />
                  </Box>
                  <Box minWidth={0}>
                    <Typography variant="overline" color="primary.main" sx={{ display: 'block', lineHeight: 1.2, fontWeight: 750, letterSpacing: 1.15 }}>Custom report</Typography>
                    <Typography variant="h5" sx={{ mt: 0.35 }}>Analysis studio</Typography>
                  </Box>
                </Stack>
                {selectedRangeDays > 0 && (
                  <Chip size="small" label={`${selectedRangeDays} days`} sx={{ flexShrink: 0, bgcolor: alpha(theme.palette.primary.main, 0.09), color: 'primary.main', fontWeight: 700 }} />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, maxWidth: 390 }}>
                Inspect giving velocity across a focused fundraising window.
              </Typography>

              <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 2.5 }} aria-label="Date range presets">
                {rangePresets.map((preset) => {
                  const isSelected = selectedPreset === preset.label;
                  return (
                    <Button
                      key={preset.label}
                      size="small"
                      variant={isSelected ? 'contained' : 'outlined'}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setStartDate(preset.start);
                        setEndDate(preset.end);
                        setError((previous) => ({ ...previous, filter: '' }));
                      }}
                      sx={{ minHeight: 40, px: 1.55, borderRadius: '12px', whiteSpace: 'nowrap', boxShadow: 'none' }}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </Stack>

              <Box sx={{ mt: 2, p: { xs: 1.5, sm: 2 }, borderRadius: '18px', bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.025 : 0.018), border: `1px solid ${theme.palette.divider}` }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <CalendarMonthRoundedIcon color="primary" sx={{ fontSize: 18 }} />
                    <Typography variant="subtitle2" fontWeight={750}>Date window</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">Inclusive range</Typography>
                </Stack>
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <DatePicker label="Start date" value={startDate} onChange={setStartDate} slotProps={{ textField: { size: 'small', fullWidth: true, sx: { '& .MuiInputBase-root': { minHeight: 48 } } } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <DatePicker label="End date" value={endDate} onChange={setEndDate} slotProps={{ textField: { size: 'small', fullWidth: true, sx: { '& .MuiInputBase-root': { minHeight: 48 } } } }} />
                  </Grid>
                </Grid>
                <Button fullWidth variant="contained" onClick={() => handleSearchByRange(false)} disabled={loading.filter} endIcon={loading.filter ? <CircularProgress size={18} color="inherit" /> : <ArrowOutwardRoundedIcon />} sx={{ mt: 1.25, minHeight: 48 }}>
                  {loading.filter ? 'Building report' : 'Run analysis'}
                </Button>
              </Box>

              {error.filter && <Alert severity="error" sx={{ mt: 2 }}>{error.filter}</Alert>}

              {!filteredData && !error.filter && !loading.filter && (
                <Box sx={{ mt: 2, p: 3, textAlign: 'center', borderRadius: '18px', bgcolor: alpha(theme.palette.primary.main, 0.045), border: `1px dashed ${alpha(theme.palette.primary.main, 0.24)}` }}>
                  <CalendarMonthRoundedIcon color="primary" sx={{ mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700}>Choose a window to investigate</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Compare revenue and donation volume across any period.</Typography>
                </Box>
              )}

              {filteredData && !loading.filter && (
                <Box sx={{ mt: 2.25 }}>
                  <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} sx={{ mb: 1.5 }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={750}>Giving performance</Typography>
                      <Typography variant="caption" color="text.secondary">Daily revenue across the selected window</Typography>
                    </Box>
                    {filteredPeakDay && (
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography variant="caption" color="text.secondary">Peak day</Typography>
                        <Typography className="dashboard-data-value" variant="subtitle2" color="primary.main">{currency.format(filteredPeakDay.total)}</Typography>
                      </Box>
                    )}
                  </Stack>
                  <Grid container spacing={1}>
                    {[
                      { label: 'Raised', value: currency.format(filteredData.amountInRange), color: theme.palette.primary.main },
                      { label: 'Gifts', value: numberFormat.format(filteredData.donationsCount), color: theme.palette.secondary.main },
                      { label: 'Avg. gift', value: currency.format(filteredAverageGift), color: theme.palette.success.main },
                    ].map((metric) => (
                      <Grid key={metric.label} size={{ xs: 4 }}>
                        <Box sx={{ minHeight: 78, p: { xs: 1.15, sm: 1.5 }, borderRadius: '14px', bgcolor: alpha(metric.color, 0.07), border: `1px solid ${alpha(metric.color, 0.1)}` }}>
                          <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
                          <Typography className="dashboard-data-value" fontWeight={650} sx={{ mt: 0.45, fontSize: { xs: '0.95rem', sm: '1.08rem' }, lineHeight: 1.2 }}>{metric.value}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                  <Box role="img" aria-label={`Daily fundraising trend. ${currency.format(filteredData.amountInRange)} raised from ${numberFormat.format(filteredData.donationsCount)} donations.`} sx={{ height: 190, minWidth: 0, mt: 2 }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                      <AreaChart data={filteredData.dailyTrend} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                        <defs>
                          <linearGradient id="filteredImpact" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={alpha(theme.palette.text.secondary, 0.09)} vertical={false} strokeDasharray="4 6" />
                        <XAxis dataKey="date" tickFormatter={(value) => dayjs(value).format('D MMM')} axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} dy={8} />
                        <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} width={48} tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} />
                        <ChartTooltip labelFormatter={(label) => dayjs(label).format('MMM D, YYYY')} formatter={(value: number) => [preciseCurrency.format(value), 'Raised']} contentStyle={{ backgroundColor: alpha(theme.palette.background.paper, 0.96), border: `1px solid ${theme.palette.divider}`, borderRadius: 12, boxShadow: theme.shadows[3] }} />
                        <Area isAnimationActive={!reduceMotion} type="monotone" dataKey="total" stroke={theme.palette.primary.main} strokeWidth={2.4} fill="url(#filteredImpact)" activeDot={{ r: 4, strokeWidth: 3, stroke: theme.palette.background.paper }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, xl: 7 }}>
            <Paper sx={{ height: '100%', minHeight: 460, overflow: 'hidden' }}>
              <Box sx={{ px: { xs: 2.25, sm: 3 }, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography variant="h5">Supporter circle</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>Your most committed donors, ranked by lifetime impact.</Typography>
                </Box>
                <Button component={RouterLink} to="/contact-search" size="small" endIcon={<ArrowOutwardRoundedIcon />}>Find donor</Button>
              </Box>
              <Divider />
              {loading.topDonors ? (
                <Stack spacing={1.25} sx={{ p: 3 }}>
                  {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} variant="rounded" height={52} />)}
                </Stack>
              ) : error.topDonors ? (
                <Alert severity="warning" sx={{ m: 2.5 }}>{error.topDonors}</Alert>
              ) : topDonors.length === 0 ? (
                <Box sx={{ py: 8, px: 3, textAlign: 'center' }}>
                  <ReceiptLongRoundedIcon color="disabled" sx={{ fontSize: 36 }} />
                  <Typography variant="h6" sx={{ mt: 1.5 }}>No supporter data yet</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Top supporters will appear once donations are synced.</Typography>
                </Box>
              ) : (
                <TopDonorsTable donors={topDonors} />
              )}
            </Paper>
          </Grid>
        </Grid>
      </motion.div>
    </Box>
  );
};

export default DashboardHomePage;
