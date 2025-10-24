import { useState, useEffect, useCallback } from 'react';
import { Typography, Box, CircularProgress, Alert, Paper, Divider, Button } from '@mui/material';
import Grid from '@mui/material/Grid';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
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
}
interface FilteredData {
  amountInRange: number;
  donationsCount: number;
  dailyTrend: { date: string; total: number; count: number }[];
}

export const DashboardHomePage = () => {
  const [glanceData, setGlanceData] = useState<GlanceData | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredData | null>(null);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [loading, setLoading] = useState({ glance: true, filter: false, topDonors: true });
  const [error, setError] = useState({ glance: '', filter: '', topDonors: '' }); 
  const { subscribe } = useWebSocket();
  const [topDonors, setTopDonors] = useState<Donor[]>([]);

  // ✅ CAMBIO 1: La función ahora acepta un booleano `isRefresh`.
  // Por defecto es `false` para no afectar las llamadas existentes.
  const fetchGlanceMetrics = useCallback(async (isRefresh: boolean = false) => {
    // Solo activamos el 'loading' si NO es un refresco automático.
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

  // useEffect para la carga inicial (no cambia su lógica interna).
  useEffect(() => {
    // Se llama una sola vez con la configuración por defecto (isRefresh = false).
    fetchGlanceMetrics();
    fetchTopDonors();
  }, [fetchGlanceMetrics]);

  // ✅ CAMBIO 2: La función de búsqueda también acepta `isRefresh`.
  const handleSearchByRange = useCallback(async (isRefresh: boolean = false) => {
    if (!startDate || !endDate || startDate.isAfter(endDate)) {
      setFilteredData(null);
      return;
    }
    // Solo activamos el 'loading' si es una búsqueda manual del usuario.
    if (!isRefresh) {
        setLoading(prev => ({ ...prev, filter: true }));
    }
    setError(prev => ({...prev, filter: ''}));
    try {
      const params = {
        start_date: startDate.format('YYYY-MM-DD'),
        // Tu código original suma un día. Lo mantengo, aunque usualmente
        // es preferible que el backend maneje rangos de fecha inclusivos.
        end_date: endDate.add(1, 'day').format('YYYY-MM-DD'),
      };
      const response = await apiClient.get<{ filtered: FilteredData }>('/dashboard/metrics', { params });
      setFilteredData(response.data.filtered);
    } catch (err) {
      setError(prev => ({ ...prev, filter: 'Failed to load filtered metrics.'}));
    } finally {
      if (!isRefresh) {
        setLoading(prev => ({ ...prev, filter: false }));
      }
    }
  }, [startDate, endDate]);

  // ✅ CAMBIO 3: El WebSocket ahora llama a las funciones con `isRefresh = true`.
  useEffect(() => {
    console.log("Subscribing to 'new_donation' event...");

    const unsubscribe = subscribe('new_donation', () => {
      console.log('Notification received! Refreshing dashboard data silently...');
      
      // Refresca los datos "At a Glance" en segundo plano.
      fetchGlanceMetrics(true);

      // Si hay un rango de fechas seleccionado, refresca los datos filtrados.
      // Usar `startDate` y `endDate` es más robusto que `filteredData`
      // porque asegura el refresco aunque la búsqueda anterior no diera resultados.
      if (startDate && endDate) {
        handleSearchByRange(true);
      }
    });
    
    return () => {
      console.log("Unsubscribing from 'new_donation' event.");
      unsubscribe();
    };
    // El array de dependencias se ajusta para reflejar la nueva lógica.
  }, [subscribe, fetchGlanceMetrics, handleSearchByRange, startDate, endDate]);


  const formatXAxis = (tickItem: string) => dayjs(tickItem).format('D/M');
  console.log("glanceData", glanceData);
  console.log("filteredData", filteredData);

  return (
    <Box sx={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h4" component="h1">Global Dashboard</Typography>

      {/* --- SECCIÓN 1: VISTA RÁPIDA (Sin cambios en el JSX) --- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>At a Glance</Typography>
        <Divider sx={{ mb: 2 }} />
        {loading.glance ? <CircularProgress /> : error.glance ? <Alert severity="error">{error.glance}</Alert> : glanceData && (
          <Box>
            <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
              <CombinedStatCard
                title="Today"
                metrics={[
                  {
                    value: `$${glanceData.amountToday.toFixed(2)}`,
                    label: 'Amount',
                    icon: <MonetizationOnIcon sx={{ fontSize: 40 }} />
                  },
                  {
                    value: glanceData.donationsCountToday.toString(),
                    label: '# Donations',
                    icon: <ReceiptLongIcon sx={{ fontSize: 40 }} />
                  }
                ]}
              />
              <CombinedStatCard
                title="This Month"
                metrics={[
                  {
                    value: `$${glanceData.amountThisMonth.toFixed(2)}`,
                    label: 'Amount',
                    icon: <MonetizationOnIcon sx={{ fontSize: 40 }} />
                  },
                  {
                    value: glanceData.donationsCountThisMonth.toString(),
                    label: '# Donations',
                    icon: <ReceiptLongIcon sx={{ fontSize: 40 }} />
                  }
                ]}
              />
            </Box>

            <Box>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Trend (Last 30 Days)</Typography>
              <Box sx={{ height: '350px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={glanceData.glanceTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                    <XAxis dataKey="date" tickFormatter={formatXAxis} fontSize={12} />
                    
                    {/* ✅ Eje Y para el monto (izquierda) */}
                    <YAxis yAxisId="left" tickFormatter={(tick) => `$${tick}`} fontSize={12} domain={['auto', 'auto']} />
                    {/* ✅ Eje Y para el conteo (derecha) */}
                    <YAxis yAxisId="right" orientation="right" fontSize={12} domain={['auto', 'auto']} />
                    
                    <Tooltip 
                      formatter={(value: number, name: string) => [name === 'Amount' ? `$${value.toFixed(2)}` : value, name]}
                      contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: 'none' }} 
                      labelStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    
                    {/* ✅ Línea para el monto asociada al eje izquierdo */}
                    <Line yAxisId="left" type="monotone" dataKey="total" name="Amount" stroke="#38AECC" strokeWidth={2} dot={{r: 3}} activeDot={{ r: 6 }} />
                    {/* ✅ Línea para el conteo asociada al eje derecho */}
                    <Line yAxisId="right" type="monotone" dataKey="count" name="# Donations" stroke="#82ca9d" strokeWidth={2} dot={{r: 3}} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      {/* --- SECCIÓN 2: BÚSQUEDA POR RANGO (Sin cambios en el JSX) --- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
       <Typography variant="h5" gutterBottom>Custom Range Search</Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
          <DatePicker label="Start Date" value={startDate} onChange={setStartDate} slotProps={{ textField: { size: 'small' } }}/>
          <DatePicker label="End Date" value={endDate} onChange={setEndDate} slotProps={{ textField: { size: 'small' } }}/>
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {/* ✅ CAMBIO 4: El botón de búsqueda llama a la función sin parámetro o con `false`. */}
            <Button variant="contained" onClick={() => handleSearchByRange(false)} disabled={loading.filter}>
              {loading.filter ? 'Searching...' : 'Search'}
            </Button>
          </Box>
        </Box>
        {loading.filter ? <CircularProgress /> : error.filter ? <Alert severity="error">{error.filter}</Alert> : filteredData && (
          // Mantengo tu estructura de Grid original, como solicitaste.
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <StatCard title="Total Donated in Range" value={`$${filteredData.amountInRange.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <StatCard title="Number of Donations" value={`${filteredData.donationsCount}`} icon={<ReceiptLongIcon sx={{ fontSize: 40, color: '#BFACB5' }} />} />
            </Grid>
          </Grid>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>Top 10 Donors (All Time)</Typography>
        <Divider sx={{ mb: 2 }} />
        {loading.topDonors ? (
          <CircularProgress />
        ) : error.topDonors ? (
          <Alert severity="error">{error.topDonors}</Alert>
        ) : (
          <TopDonorsTable donors={topDonors} />
        )}
      </Paper>
      
    </Box>
  );
};

export default DashboardHomePage;