import React, { useState, useEffect, useCallback } from 'react';
import { Grid, Typography, Box, CircularProgress, Alert, Paper, Divider, Button } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/apiClient';
import { StatCard } from '../components/StatCard';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// Interfaces de datos
interface GlanceData {
  amountToday: number;
  amountThisMonth: number;
  glanceTrend: { date: string; total: number }[];
}
interface FilteredData {
  amountInRange: number;
  donationsCount: number;
  dailyTrend: { date: string; total: number }[];
}

export const DashboardHomePage = () => {
  // Lógica de estado y fetch de datos (sin cambios)
  const [glanceData, setGlanceData] = useState<GlanceData | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredData | null>(null);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [loading, setLoading] = useState({ glance: true, filter: false });
  const [error, setError] = useState({ glance: '', filter: '' });

  useEffect(() => {
    const fetchGlanceMetrics = async () => {
      setLoading(prev => ({ ...prev, glance: true }));
      try {
        const response = await apiClient.get<{ glance: GlanceData }>('/dashboard/metrics');
        setGlanceData(response.data.glance);
      } catch (err) {
        setError(prev => ({ ...prev, glance: 'Failed to load initial metrics.' }));
      } finally {
        setLoading(prev => ({ ...prev, glance: false }));
      }
    };
    fetchGlanceMetrics();
  }, []);

  const handleSearchByRange = useCallback(async () => {
    if (!startDate || !endDate || startDate.isAfter(endDate)) {
      setFilteredData(null);
      return;
    }
    setLoading(prev => ({ ...prev, filter: true }));
    setError(prev => ({...prev, filter: ''}));
    try {
      const params = {
        start_date: startDate.format('YYYY-MM-DD'),
        end_date: endDate.add(1, 'day').format('YYYY-MM-DD'),
      };
      const response = await apiClient.get<{ filtered: FilteredData }>('/dashboard/metrics', { params });
      setFilteredData(response.data.filtered);
    } catch (err) {
      setError(prev => ({ ...prev, filter: 'Failed to load filtered metrics.'}));
    } finally {
      setLoading(prev => ({ ...prev, filter: false }));
    }
  }, [startDate, endDate]);

  const formatXAxis = (tickItem: string) => dayjs(tickItem).format('D/M');

  return (
    <Box sx={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h4" component="h1">Global Dashboard</Typography>

      {/* --- SECCIÓN 1: VISTA RÁPIDA --- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>At a Glance</Typography>
        <Divider sx={{ mb: 2 }} />
        {loading.glance ? <CircularProgress /> : error.glance ? <Alert severity="error">{error.glance}</Alert> : glanceData && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center' }}>
              <StatCard title="Donations Today" value={`$${glanceData.amountToday.toFixed(2)}`} icon={<TodayIcon color="primary" sx={{ fontSize: 40 }} />} />
              <StatCard title="This Month" value={`$${glanceData.amountThisMonth.toFixed(2)}`} icon={<CalendarMonthIcon color="secondary" sx={{ fontSize: 40 }} />} />
            </Box>

            <Box>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Trend (Last 30 Days)</Typography>
              <Box sx={{ height: '350px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={glanceData.glanceTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                    <XAxis dataKey="date" tickFormatter={formatXAxis} fontSize={12} />
                    <YAxis tickFormatter={(tick) => `$${tick}`} fontSize={12} domain={['auto', 'auto']} />
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total']} contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: 'none' }} labelStyle={{ color: '#fff' }}/>
                    <Legend />
                    <Line type="monotone" dataKey="total" name="Donations" stroke="#38AECC" strokeWidth={2} dot={{r: 3}} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      {/* --- SECCIÓN 2: BÚSQUEDA POR RANGO --- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
       <Typography variant="h5" gutterBottom>Custom Range Search</Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
          <DatePicker label="Start Date" value={startDate} onChange={setStartDate} slotProps={{ textField: { size: 'small' } }}/>
          <DatePicker label="End Date" value={endDate} onChange={setEndDate} slotProps={{ textField: { size: 'small' } }}/>
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSearchByRange} disabled={loading.filter}>
              {loading.filter ? 'Searching...' : 'Search'}
            </Button>
          </Box>
        </Box>
        {loading.filter ? <CircularProgress /> : error.filter ? <Alert severity="error">{error.filter}</Alert> : filteredData && (
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <StatCard title="Total Donated in Range" value={`$${filteredData.amountInRange.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
            </Grid>
            <Grid item xs={12} sm={6}>
              {/* ¡AQUÍ ESTÁ EL CAMBIO! */}
              <StatCard title="Number of Donations" value={`${filteredData.donationsCount}`} icon={<ReceiptLongIcon sx={{ fontSize: 40, color: '#BFACB5' }} />} />
            </Grid>
          </Grid>
        )}
      </Paper>
    </Box>
  );
};
