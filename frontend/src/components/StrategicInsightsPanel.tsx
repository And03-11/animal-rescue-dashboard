import {
  Alert, Box, Chip, Divider, Paper, Skeleton, Stack, Typography, alpha, useTheme,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import RepeatRoundedIcon from '@mui/icons-material/RepeatRounded';
import StarsRoundedIcon from '@mui/icons-material/StarsRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

export interface StrategicInsights {
  period: {
    days: number;
    amount: number;
    donations: number;
    averageGift: number;
    amountChangePct: number;
    donationChangePct: number;
    averageGiftChangePct: number;
  };
  audience: {
    knownDonors: number;
    donorsWithGifts: number;
    oneTimeDonors: number;
    repeatDonors: number;
    threePlusDonors: number;
    highValueDonors: number;
    majorDonors: number;
    repeatRatePct: number;
    reactivationPool: number;
  };
  timing: {
    periodDays: number;
    bestWeekday: string;
    averageDailyAmount: number;
    averageDailyDonations: number;
  };
  channel: {
    periodDays: number;
    topSource: string;
    amount: number;
    donations: number;
    campaigns: number;
    averageGift: number;
  };
  generatedAt: string;
}

interface Props {
  data: StrategicInsights | null;
  loading: boolean;
  error?: string;
}

const numberFormat = new Intl.NumberFormat('en-US');
const currencyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

interface InsightMetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'primary' | 'success' | 'warning' | 'info';
}

const InsightMetric = ({ icon, label, value, detail, tone = 'primary' }: InsightMetricProps) => {
  const theme = useTheme();
  const color = theme.palette[tone].main;

  return (
    <Box sx={{ minWidth: 0, p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 2.5, color, bgcolor: alpha(color, 0.1), flexShrink: 0 }}>
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
      </Stack>
      <Typography variant="h3" sx={{ mb: 0.75 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{detail}</Typography>
    </Box>
  );
};

export const StrategicInsightsPanel = ({ data, loading, error }: Props) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Paper sx={{ p: 3 }} aria-label="Loading strategic insights">
        <Skeleton width={220} height={34} />
        <Skeleton width="42%" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 1, mt: 3 }}>
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} variant="rounded" height={142} />)}
        </Box>
      </Paper>
    );
  }

  if (error || !data) {
    return <Alert severity="warning">{error || 'Strategic insights are temporarily unavailable.'}</Alert>;
  }

  const momentumPositive = data.period.amountChangePct >= 0;
  const MomentumIcon = momentumPositive ? TrendingUpRoundedIcon : TrendingDownRoundedIcon;
  const momentumTone = momentumPositive ? 'success' : 'warning';
  const signedChange = `${data.period.amountChangePct > 0 ? '+' : ''}${data.period.amountChangePct.toFixed(1)}%`;

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2.5, md: 3 }, py: 2.5, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <InsightsRoundedIcon color="primary" />
            <Typography variant="h5">Strategic insights</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Signals for growth, retention and campaign planning.
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label="Derived from synced Airtable data" />
      </Box>

      <Divider />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, '& > *:not(:last-child)': { borderBottom: { xs: `1px solid ${theme.palette.divider}`, xl: 0 } }, '& > *:nth-of-type(odd)': { borderRight: { sm: `1px solid ${theme.palette.divider}`, xl: 0 } }, '& > * + *': { borderLeft: { xl: `1px solid ${theme.palette.divider}` } } }}>
        <InsightMetric
          icon={<MomentumIcon fontSize="small" />}
          label="30-day momentum"
          value={signedChange}
          detail={`${currencyFormat.format(data.period.amount)} raised · average gift ${data.period.averageGiftChangePct > 0 ? '+' : ''}${data.period.averageGiftChangePct.toFixed(1)}%`}
          tone={momentumTone}
        />
        <InsightMetric
          icon={<RepeatRoundedIcon fontSize="small" />}
          label="Repeat donor rate"
          value={`${data.audience.repeatRatePct.toFixed(1)}%`}
          detail={`${numberFormat.format(data.audience.repeatDonors)} repeat · ${numberFormat.format(data.audience.threePlusDonors)} with 3+ gifts`}
          tone="success"
        />
        <InsightMetric
          icon={<GroupsRoundedIcon fontSize="small" />}
          label="High-value donors"
          value={numberFormat.format(data.audience.highValueDonors)}
          detail={`$1,000+ lifetime · ${numberFormat.format(data.audience.majorDonors)} above $5,000`}
          tone="primary"
        />
        <InsightMetric
          icon={<CalendarMonthRoundedIcon fontSize="small" />}
          label="Strongest weekday"
          value={data.timing.bestWeekday}
          detail={`${currencyFormat.format(data.timing.averageDailyAmount)} average per ${data.timing.bestWeekday} · zero-revenue days included`}
          tone="info"
        />
      </Box>

      <Box sx={{ mx: { xs: 2.5, md: 3 }, mb: 3, mt: 0.5, p: 2.25, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.07), border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`, display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <StarsRoundedIcon color="primary" sx={{ mt: 0.25 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>Top channel · last {data.channel.periodDays} days</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              {data.channel.topSource} generated {currencyFormat.format(data.channel.amount)} from {numberFormat.format(data.channel.donations)} donations.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={3} sx={{ pl: { xs: 4.5, md: 0 } }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Avg. gift</Typography>
            <Typography fontWeight={700}>{currencyFormat.format(data.channel.averageGift)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Campaigns</Typography>
            <Typography fontWeight={700}>{numberFormat.format(data.channel.campaigns)}</Typography>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
};
