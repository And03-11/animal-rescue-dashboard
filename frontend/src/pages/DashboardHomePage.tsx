import { useState, useEffect, useCallback } from 'react';
import { Typography, Box, CircularProgress, Alert, Paper, Button, useTheme, alpha, Card } from '@mui/material';
import Grid from '@mui/material/Grid';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { motion } from 'framer-motion';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useWebSocket } from '../context/WebSocketProvider';
import { CombinedStatCard } from '../components/CombinedStatCard';
import { TopDonorsTable, type Donor } from '../components/TopDonorsTable';

// Interfaces de datos
interface GlanceData {
  amountToday: number;
  donationsCountToday: number;
  amountThisMonth: number;
  donationsCountThisMonth: number;
  glanceTrend: { date: string; total: number }[];
  momGrowth: number;
  amountLastMonthSameDay: number;
}
interface FilteredData {
  amountInRange: number;
  donationsCount: number;
  dailyTrend: { date: string; total: number; count: number }[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100
    }
  }
};

export const DashboardHomePage = () => {
  const theme = useTheme();
  const [glanceData, setGlanceData] = useState<GlanceData | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredData | null>(null);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [loading, setLoading] = useState({ glance: true, filter: false, topDonors: true });
  const [error, setError] = useState({ glance: '', filter: '', topDonors: '' });
  const { subscribe } = useWebSocket();
  const [topDonors, setTopDonors] = useState<Donor[]>([]);

  const fetchGlanceMetrics = useCallback(async (isRefresh: boolean = false) => {
    if (!isRefresh) {
      setLoading(prev => ({ ...prev, glance: true }));
    }
    try {
      const response = await apiClient.get<{ glance: GlanceData }>('/dashboard/metrics');
      setGlanceData(response.data.glance);
    } catch (err) {
      setError(prev => ({ ...prev, glance: 'Failed to load initial metrics.' }));
    } finally {
      if (!isRefresh) {
        setLoading(prev => ({ ...prev, glance: false }));
      }
    }
  }, []);

  const fetchTopDonors = useCallback(async () => {
    setLoading(prev => ({ ...prev, topDonors: true }));
    try {
      const response = await apiClient.get<Donor[]>('/dashboard/top-donors');
      setTopDonors(response.data);
    } catch (err) {
      setError(prev => ({ ...prev, topDonors: 'Failed to load top donors.' }));
    } finally {
      setLoading(prev => ({ ...prev, topDonors: false }));
    }
  }, []);

  useEffect(() => {
    fetchGlanceMetrics();
    fetchTopDonors();
  }, [fetchGlanceMetrics]);

  const handleSearchByRange = useCallback(async (isRefresh: boolean = false) => {
    if (!startDate || !endDate || startDate.isAfter(endDate)) {
      setFilteredData(null);
      return;
    }
    if (!isRefresh) {
      setLoading(prev => ({ ...prev, filter: true }));
    }
    setError(prev => ({ ...prev, filter: '' }));
    try {
      const params = {
        start_date: startDate.format('YYYY-MM-DD'),
        end_date: endDate.add(1, 'day').format('YYYY-MM-DD'),
      };
      const response = await apiClient.get<{ filtered: FilteredData }>('/dashboard/metrics', { params });
      setFilteredData(response.data.filtered);
    } catch (err) {
      setError(prev => ({ ...prev, filter: 'Failed to load filtered metrics.' }));
    } finally {
      if (!isRefresh) {
        setLoading(prev => ({ ...prev, filter: false }));
      }
    }
  }, [startDate, endDate]);

  useEffect(() => {
    console.log("Subscribing to 'new_donation' event...");
    const unsubscribe = subscribe('new_donation', () => {
      console.log('Notification received! Refreshing dashboard data silently...');
      fetchGlanceMetrics(true);
      if (startDate && endDate) {
        handleSearchByRange(true);
      }
    });
    return () => {
      console.log("Unsubscribing from 'new_donation' event.");
      unsubscribe();
    };
  }, [subscribe, fetchGlanceMetrics, handleSearchByRange, startDate, endDate]);

  const formatXAxis = (tickItem: string) => dayjs(tickItem).format('D/M');

  return (
    <Box
      component={motion.div}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      sx={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="800" sx={{ background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, backgroundClip: 'text', textFillColor: 'transparent', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Overview of your fundraising performance
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Placeholder for future global actions */}
        </Box>
      </Box>

      {/* --- SECCIÓN 1: VISTA RÁPIDA --- */}
      <Grid container spacing={3}>
        {loading.glance ? (
          <Grid size={12} sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Grid>
        ) : error.glance ? (
          <Grid size={12}>
            <Alert severity="error">{error.glance}</Alert>
          </Grid>
        ) : glanceData && (
          <>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <motion.div variants={itemVariants}>
                <CombinedStatCard
                  title="Today's Performance"
                  metrics={[
                    {
                      value: `$${glanceData.amountToday.toFixed(2)}`,
                      label: 'Raised',
                      icon: <MonetizationOnIcon sx={{ fontSize: 28 }} />
                    },
                    {
                      value: glanceData.donationsCountToday.toString(),
                      label: 'Donations',
                      icon: <ReceiptLongIcon sx={{ fontSize: 28 }} />
                    }
                  ]}
                />
              </motion.div>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <motion.div variants={itemVariants}>
                <CombinedStatCard
                  title="This Month"
                  metrics={[
                    {
                      value: `$${glanceData.amountThisMonth.toFixed(2)}`,
                      label: 'Raised',
                      icon: <MonetizationOnIcon sx={{ fontSize: 28 }} />
                    },
                    {
                      value: glanceData.donationsCountThisMonth.toString(),
                      label: 'Donations',
                      icon: <ReceiptLongIcon sx={{ fontSize: 28 }} />
                    }
                  ]}
                />
              </motion.div>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <motion.div variants={itemVariants} style={{ height: '100%' }}>
                <Card
                  component={motion.div}
                  whileHover={{ y: -4, boxShadow: theme.shadows[8] }}
                  transition={{ type: "spring", stiffness: 300 }}
                  sx={{
                    height: '100%',
                    background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                  }}
                >
                  <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1.2} gutterBottom>
                      MoM Growth
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {glanceData.momGrowth >= 0 ? (
                        <TrendingUpIcon sx={{ fontSize: 48, color: theme.palette.success.main }} />
                      ) : (
                        <TrendingDownIcon sx={{ fontSize: 48, color: theme.palette.error.main }} />
                      )}
                      <Typography variant="h3" fontWeight="800" color={glanceData.momGrowth >= 0 ? 'success.main' : 'error.main'}>
                        {glanceData.momGrowth > 0 ? '+' : ''}{glanceData.momGrowth}%
                      </Typography>
                    </Box>

                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      vs last month (same day)
                    </Typography>
                  </Box>
                </Card>
              </motion.div>
            </Grid>

            <Grid size={12}>
              <motion.div variants={itemVariants}>
                <Paper sx={{ p: 3, height: '400px' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight="700">Donation Trend (Last 30 Days)</Typography>
                  </Box>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={glanceData.glanceTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.secondary, 0.1)} vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatXAxis}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        yAxisId="left"
                        tickFormatter={(tick) => `$${tick}`}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: alpha(theme.palette.background.paper, 0.8),
                          backdropFilter: 'blur(10px)',
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: '12px',
                          boxShadow: theme.shadows[4]
                        }}
                        itemStyle={{ color: theme.palette.text.primary }}
                      />
                      <Legend iconType="circle" />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="total"
                        name="Amount Raised"
                        stroke={theme.palette.primary.main}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        strokeWidth={3}
                      />
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="count"
                        name="Donation Count"
                        stroke={theme.palette.secondary.main}
                        fillOpacity={1}
                        fill="url(#colorCount)"
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>
              </motion.div>
            </Grid>
          </>
        )}
      </Grid>

      {/* --- SECCIÓN 2: BÚSQUEDA POR RANGO --- */}
      <motion.div variants={itemVariants}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <FilterAltIcon color="primary" />
            <Typography variant="h6" fontWeight="700">Custom Analysis</Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 4 }}>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={setStartDate}
              slotProps={{ textField: { size: 'small', sx: { width: 200 } } }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={setEndDate}
              slotProps={{ textField: { size: 'small', sx: { width: 200 } } }}
            />
            <Button
              variant="contained"
              onClick={() => handleSearchByRange(false)}
              disabled={loading.filter}
              startIcon={loading.filter ? <CircularProgress size={20} color="inherit" /> : <FilterAltIcon />}
              sx={{ px: 4 }}
            >
              {loading.filter ? 'Analyzing...' : 'Analyze Range'}
            </Button>
          </Box>

          {loading.filter ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : error.filter ? (
            <Alert severity="error">{error.filter}</Alert>
          ) : filteredData && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <StatCard
                  title="Total Donated in Range"
                  value={`$${filteredData.amountInRange.toFixed(2)}`}
                  icon={<MonetizationOnIcon sx={{ fontSize: 40 }} />}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <StatCard
                  title="Number of Donations"
                  value={`${filteredData.donationsCount}`}
                  icon={<ReceiptLongIcon sx={{ fontSize: 40 }} />}
                />
              </Grid>
            </Grid>
          )}
        </Paper>
      </motion.div>

      {/* --- SECCIÓN 3: TOP DONORS --- */}
      <motion.div variants={itemVariants}>
        <Paper sx={{ p: 0, overflow: 'hidden' }}>
          <Box sx={{ p: 3, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="h6" fontWeight="700">Top 10 Donors (All Time)</Typography>
          </Box>
          {loading.topDonors ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : error.topDonors ? (
            <Alert severity="error">{error.topDonors}</Alert>
          ) : (
            <TopDonorsTable donors={topDonors} />
          )}
        </Paper>
      </motion.div>

    </Box>
  );
};

export default DashboardHomePage;