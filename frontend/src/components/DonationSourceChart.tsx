import { Alert, Box, Paper, Skeleton, Stack, Typography, alpha, useTheme } from '@mui/material';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';

import type { DonationSourceData } from '../types/analytics.types';

interface DonationSourceChartProps {
  data: DonationSourceData[];
  loading: boolean;
  error: string;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const DonationSourceChart = ({ data, loading, error }: DonationSourceChartProps) => {
  const theme = useTheme();
  const colors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.warning.main,
    alpha(theme.palette.text.secondary, 0.72),
  ];

  if (loading) {
    return (
      <Paper sx={{ p: 3, height: 440 }} aria-label="Loading donation sources">
        <Skeleton width="46%" height={34} />
        <Skeleton width="72%" />
        <Skeleton variant="circular" width={184} height={184} sx={{ mx: 'auto', my: 3 }} />
        <Stack spacing={1}>{[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={30} />)}</Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3, height: 440, display: 'grid', placeItems: 'center' }}>
        <Alert severity="warning">{error}</Alert>
      </Paper>
    );
  }

  const activeData = data.filter((item) => item.value > 0);
  const total = activeData.reduce((sum, item) => sum + item.value, 0);

  if (activeData.length === 0 || total <= 0) {
    return (
      <Paper sx={{ p: 3, height: 440, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box>
          <Box sx={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: '16px', bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main', mx: 'auto' }}>
            <DonutLargeRoundedIcon />
          </Box>
          <Typography variant="h6" sx={{ mt: 2 }}>No source mix yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 260 }}>
            Donation channels will appear here once this month's data is available.
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2.25, sm: 3 }, height: 440, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box>
        <Typography variant="h5">Source mix</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Where this month's support is coming from.</Typography>
      </Box>

      <Box sx={{ height: 218, position: 'relative', mt: 0.5, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <PieChart>
            <Pie
              data={activeData}
              cx="50%"
              cy="50%"
              innerRadius={66}
              outerRadius={88}
              paddingAngle={3}
              cornerRadius={7}
              dataKey="value"
              stroke="none"
            >
              {activeData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
            </Pie>
            <ChartTooltip
              formatter={(value: number, _name: string, properties: { payload?: DonationSourceData }) => [
                `${currency.format(value)} · ${properties.payload?.percentage ?? 0}%`,
                properties.payload?.name ?? 'Source',
              ]}
              contentStyle={{ backgroundColor: alpha(theme.palette.background.paper, 0.95), backdropFilter: 'blur(12px)', border: `1px solid ${theme.palette.divider}`, borderRadius: 13, boxShadow: theme.shadows[3] }}
            />
          </PieChart>
        </ResponsiveContainer>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <Box>
            <Typography className="dashboard-data-value" sx={{ fontSize: '1.42rem', fontWeight: 600, lineHeight: 1.1 }}>{currency.format(total)}</Typography>
            <Typography variant="caption" color="text.secondary">total raised</Typography>
          </Box>
        </Box>
      </Box>

      <Stack spacing={1.25} sx={{ mt: 'auto', minHeight: 0 }}>
        {activeData.slice(0, 4).map((item, index) => {
          const percentage = item.percentage || (item.value / total) * 100;
          return (
            <Box key={item.name}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[index % colors.length], flexShrink: 0 }} />
                  <Typography variant="caption" color="text.secondary" noWrap>{item.name}</Typography>
                </Stack>
                <Typography variant="caption" fontWeight={700}>{percentage.toFixed(0)}%</Typography>
              </Stack>
              <Box sx={{ mt: 0.55, height: 3, borderRadius: 3, bgcolor: alpha(colors[index % colors.length], 0.12), overflow: 'hidden' }}>
                <Box sx={{ width: `${Math.min(Math.max(percentage, 2), 100)}%`, height: '100%', borderRadius: 'inherit', bgcolor: colors[index % colors.length] }} />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};
