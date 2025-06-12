// src/pages/DashboardHomePage.tsx
import React, { useState, useEffect } from 'react';
import { Grid, Typography, Box, CircularProgress, Alert, Paper, Divider } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import apiClient from '../api/apiClient';
import { StatCard } from '../components/StatCard';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

export const DashboardHomePage = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/dashboard/metrics');
        setData(response.data);
      } catch (err) {
        setError('Failed to load dashboard metrics.');
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    date.setDate(date.getDate() + 1); 
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return <Typography>No data to display.</Typography>;
  }

  // Creamos un array con la información de cada sección para iterar sobre él
  const dashboardSections = [
    { title: "Main Donations", data: data.mainDonations, color: "#38AECC" },
    { title: "Donations not from BC", data: data.notfrombcdonations, color: "#BFACB5" },
    { title: "Donations from Influencers", data: data.influencerDonations, color: "#66BB6A" },
  ];

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Global Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Usamos .map() para crear una sección por cada fuente de donación */}
        {dashboardSections.map((section) => {
            // Verificamos que haya datos para la sección antes de intentar renderizarla
            if (!section.data) return null;

            return (
                <Grid item xs={12} lg={4} key={section.title}>
                    <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="h5" component="h2" gutterBottom>{section.title}</Typography>
                        <Divider sx={{ mb: 2 }} />

                        {/* Fila para las estadísticas */}
                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} sm={6}>
                                <StatCard title="Today" value={`$${section.data.total_today.toFixed(2)}`} icon={<TodayIcon color="primary" sx={{ fontSize: 40 }} />} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <StatCard title="This Month" value={`$${section.data.total_month.toFixed(2)}`} icon={<CalendarMonthIcon color="secondary" sx={{ fontSize: 40 }} />} />
                            </Grid>
                        </Grid>
                        
                        {/* Fila para el gráfico */}
                        <Box sx={{ height: 250, mt: 1 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={section.data.daily_trend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                                    <XAxis dataKey="date" tickFormatter={formatXAxis} fontSize={12} />
                                    <YAxis tickFormatter={(tick) => `$${tick}`} fontSize={12} domain={['dataMin', 'dataMax']} />
                                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total']} contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: 'none' }} labelStyle={{ color: '#fff' }}/>
                                    <Line type="monotone" dataKey="total" name={section.title} stroke={section.color} strokeWidth={2} dot={{r: 3}} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </Paper>
                </Grid>
            );
        })}
      </Grid>
    </Box>
  );
};