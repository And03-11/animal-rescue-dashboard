import {
  Alert, Box, Chip, Divider, Paper, Skeleton, Stack, Tooltip, Typography, alpha, useTheme,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
    sharePct: number;
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
  helpText?: string;
  tone?: 'primary' | 'success' | 'warning' | 'info';
}

const InsightMetric = ({ icon, label, value, detail, helpText, tone = 'primary' }: InsightMetricProps) => {
  const theme = useTheme();
  const color = theme.palette[tone].main;

  return (
    <Box sx={{ minWidth: 0, p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 2.5, color, bgcolor: alpha(color, 0.1), flexShrink: 0 }}>
          {icon}
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" minWidth={0}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
          {helpText && (
            <Tooltip title={helpText} arrow>
              <Box
                component="span"
                tabIndex={0}
                aria-label={helpText}
                sx={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 44,
                  height: 44,
                  ml: -1,
                  color: 'text.secondary',
                  cursor: 'help',
                  borderRadius: 1,
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
              </Box>
            </Tooltip>
          )}
        </Stack>
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
  const generatedAt = new Date(data.generatedAt);
  const updatedLabel = Number.isNaN(generatedAt.getTime())
    ? 'Updated recently'
    : `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(generatedAt)}`;

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
        <Chip size="small" variant="outlined" label={updatedLabel} />
      </Box>

      <Divider />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, '& > *:not(:last-child)': { borderBottom: { xs: `1px solid ${theme.palette.divider}`, xl: 0 } }, '& > *:nth-of-type(odd)': { borderRight: { sm: `1px solid ${theme.palette.divider}`, xl: 0 } }, '& > * + *': { borderLeft: { xl: `1px solid ${theme.palette.divider}` } } }}>
        <InsightMetric
          icon={<MomentumIcon fontSize="small" />}
          label="Last 30 days vs prior 30"
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
          detail={`${currencyFormat.format(data.timing.averageDailyAmount)} average · ${data.timing.averageDailyDonations.toFixed(1)} gifts per day`}
          helpText="The weekday average includes days with no revenue so the comparison is not inflated."
          tone="info"
        />
      </Box>

      <Box sx={{ mx: { xs: 2.5, md: 3 }, mb: 3, mt: 0.5, p: { xs: 2.25, md: 2.5 }, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.07), border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' }, alignItems: 'center', gap: { xs: 2.5, md: 4 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" minWidth={0}>
          <StarsRoundedIcon color="primary" sx={{ mt: 0.25, flexShrink: 0 }} />
          <Box minWidth={0}>
            <Typography variant="overline" color="primary.main">Top channel · last {data.channel.periodDays} days</Typography>
            <Typography variant="h5" sx={{ mt: 0.25 }}>{data.channel.topSource}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {numberFormat.format(data.channel.donations)} gifts across {numberFormat.format(data.channel.campaigns)} campaigns · {currencyFormat.format(data.channel.averageGift)} average gift
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ minWidth: { md: 205 }, textAlign: { xs: 'left', md: 'right' }, pl: { xs: 4.5, md: 0 } }}>
          <Typography variant="caption" color="text.secondary">Attributed revenue</Typography>
          <Typography className="dashboard-data-value" variant="h3" sx={{ mt: 0.2 }}>{currencyFormat.format(data.channel.amount)}</Typography>
          <Typography variant="caption" color="primary.main" fontWeight={700}>
            {(data.channel.sharePct ?? 0).toFixed(1)}% of {data.channel.periodDays}-day channel revenue
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};
