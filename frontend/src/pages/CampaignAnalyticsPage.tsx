// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Chip 
} from '@mui/material';
import Grid from '@mui/material/Grid';
import TuneIcon from '@mui/icons-material/Tune'; 
import ClearIcon from '@mui/icons-material/Clear';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useWebSocket } from '../context/WebSocketProvider';
import { FormTitleSelector } from '../components/FormTitleSelector';

// --- Interfaces ---
interface ApiListItem { id: string; name: string; }
interface Donation {
  id: string;
  date: string;
  amount: number;
  donorName: string;
  donorEmail: string;
}
interface CampaignStatsData {
  campaign_total_amount: number;
  campaign_total_count: number;
  stats_by_form_title: {
    form_title_id: string;
    form_title_name: string;
    total_amount: number;
    donation_count: number;
  }[];
}
interface CustomReportData {
    donations: Donation[];
    totalAmount: number;
    donationsCount: number;
}


export const CampaignAnalyticsPage: React.FC = () => {
  const theme = useTheme();
  const { subscribe } = useWebSocket();

  // --- Estados de Filtros (Unificados) ---
  const [sources, setSources] = useState<ApiListItem[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [formTitles, setFormTitles] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [selectorKey, setSelectorKey] = useState(0);

  // --- Estados de Datos (Unificados) ---
  const [campaignStats, setCampaignStats] = useState<CampaignStatsData | null>(null);
  const [reportData, setReportData] = useState<CustomReportData | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // --- Estados de Carga y Errores (Unificados) ---
  const [loading, setLoading] = useState({ sources: true, campaigns: false, titles: false, report: false });
  const [error, setError] = useState('');
  
  // --- Carga inicial de Fuentes ---
  useEffect(() => {
    apiClient.get('/campaigns/sources')
      .then(res => setSources(res.data.map((s: string) => ({ id: s, name: s }))))
      .catch(() => setError('Failed to load sources.'))
      .finally(() => setLoading(prev => ({ ...prev, sources: false })));
  }, []);

  // --- Carga de Campañas al cambiar Fuente ---
  useEffect(() => {
    if (!selectedSource) {
      setCampaigns([]);
      setSelectedCampaign('');
      return;
    }
    setLoading(prev => ({ ...prev, campaigns: true }));
    apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`)
      .then(res => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(prev => ({ ...prev, campaigns: false })));
  }, [selectedSource]);

  // --- Carga de Títulos y Estadísticas Generales al cambiar Campaña ---
  const fetchCampaignBaseData = useCallback(async (isSilent = false) => {
    if (!selectedCampaign) {
      setFormTitles([]);
      setCampaignStats(null);
      setReportData(null);
      setShowAdvancedFilters(false);
      return;
    }
    if (!isSilent) {
        setLoading(prev => ({ ...prev, titles: true }));
    }
    setError('');

    try {
      const [titlesRes, statsRes] = await Promise.all([
        apiClient.get<ApiListItem[]>(`/form-titles?campaign_id=${selectedCampaign}`),
        apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats`)
      ]);
      setFormTitles(titlesRes.data);
      setCampaignStats(statsRes.data);
      // Seleccionar todos los títulos por defecto
      
    } catch {
      setError('Failed to load campaign data.');
    } finally {
      if (!isSilent) {
        setLoading(prev => ({ ...prev, titles: false }));
      }
    }
  }, [selectedCampaign]);
  
  useEffect(() => {
    fetchCampaignBaseData();
  }, [fetchCampaignBaseData]);

  // --- Búsqueda/Generación del Reporte Detallado ---
  const handleGenerateReport = useCallback(async (isSilent = false) => {
    if (selectedTitles.length === 0) {
      setReportData(null); // Limpiar si no hay títulos
      return;
    }
     if (!isSilent) {
        setLoading(prev => ({ ...prev, report: true }));
    }
    setReportData(null); 
    setError('');
    
    try {
      const params = new URLSearchParams();
      selectedTitles.forEach(id => params.append('form_title_id', id));
      if (startDate) params.append('start_date', startDate.format('YYYY-MM-DD'));
      if (endDate) params.append('end_date', endDate.format('YYYY-MM-DD'));

      const res = await apiClient.get<CustomReportData>(`/form-titles/donations?${params.toString()}`);
      setReportData(res.data);
    } catch {
      setError('Failed to generate the report.');
    } finally {
       if (!isSilent) {
        setLoading(prev => ({ ...prev, report: false }));
       }
    }
  }, [selectedTitles, startDate, endDate]);

  // --- WebSocket para actualizaciones en tiempo real ---
  useEffect(() => {
    const unsubscribe = subscribe('new_donation', () => {
      console.log('New donation detected! Refreshing analytics...');
      // Si hay una campaña seleccionada, refresca sus datos base
      if (selectedCampaign) fetchCampaignBaseData(true);
      // Si hay un reporte activo en pantalla, lo refresca también
      if (reportData) handleGenerateReport(true);
    });
    return () => unsubscribe();
  }, [subscribe, selectedCampaign, reportData, fetchCampaignBaseData, handleGenerateReport]);

  const handleClearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setReportData(null); // Esto oculta la tabla de reporte y revierte los StatCards
    setSelectorKey(prev => prev + 1); // Esto fuerza el remount y reseteo del selector de títulos
  };
  
  // Función para renderizar los valores seleccionados en el Select

  
  
  return (
    <Box sx={{ width: '100%', maxWidth: '1280px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h4" component="h1">Campaign Analytics</Typography>

        {/* --- SECCIÓN 1: PANEL DE CONTROL (FILTROS) --- */}
        {/* --- SECCIÓN 1: PANEL DE CONTROL (FILTROS) --- */}
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h5" gutterBottom>Filters</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
                {/* Selector de Fuente (sin cambios) */}
                <Grid size={{ xs: 12, md: 12 }}>
                    <FormControl fullWidth>
                        <InputLabel>1. Select Source</InputLabel>
                        <Select value={selectedSource} label="1. Select Source" onChange={e => setSelectedSource(e.target.value)} disabled={loading.sources}>
                            {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Selector de Campaña (sin cambios) */}
                <Grid size={{ xs: 12, md: 12 }}>
                    <Collapse in={!!selectedSource} timeout="auto" unmountOnExit>
                        <FormControl fullWidth disabled={!selectedSource || loading.campaigns}>
                            <InputLabel>2. Select Campaign</InputLabel>
                            <Select value={selectedCampaign} label="2. Select Campaign" onChange={e => setSelectedCampaign(e.target.value)}>
                                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Collapse>
                </Grid>
            </Grid>

            {/* ✅ NUEVO: Botón para mostrar los filtros avanzados */}
             <Collapse in={!!selectedCampaign} timeout="auto" unmountOnExit>
                <Divider sx={{ my: 2, '&::before, &::after': { top: '50%', transform: 'translateY(-50%)' } }}>
                    <Chip 
                        icon={<TuneIcon />} 
                        label="Advanced Filters"
                        // ✅ PASO 4: Añadimos el onClick y el estilo de cursor
                        onClick={() => setShowAdvancedFilters(prev => !prev)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Divider>

                {/* Este Collapse interno controla los filtros detallados */}
                <Collapse in={showAdvancedFilters} timeout="auto" unmountOnExit>
                    <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <FormTitleSelector
                                key={selectorKey} // Esta key fuerza el reseteo
                                titles={formTitles}
                                onSelectionChange={setSelectedTitles}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                            <DatePicker 
                                label="Start Date (Optional)" 
                                value={startDate} 
                                onChange={setStartDate} 
                                sx={{ width: '100%' }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                            <DatePicker 
                                label="End Date (Optional)" 
                                value={endDate} 
                                onChange={setEndDate} 
                                sx={{ width: '100%' }}
                            />
                        </Grid>
                   
                        <Grid size={{ xs: 12, md: 2 }} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            {/* ✅ CAMBIO: Usamos renderizado condicional directo en lugar de Collapse */}
                            {!!reportData && (
                                <Button 
                                    variant="text" 
                                    onClick={handleClearFilters} 
                                    sx={{ height: '56px', mr: 1 }} // Añadimos un pequeño margen derecho
                                    startIcon={<ClearIcon />}
                                >
                                    Clear
                                </Button>
                            )}
                            <Button 
                                variant="contained" 
                                onClick={() => handleGenerateReport(false)} 
                                disabled={loading.report || selectedTitles.length === 0}
                                sx={{ height: '56px', flexGrow: 1 }}
                            >
                                {loading.report ? <CircularProgress size={24} /> : 'Apply'}
                            </Button>
                        </Grid>
                    </Grid>
                </Collapse>
            </Collapse>
        </Paper>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {/* ✅ AÑADE ESTE BLOQUE DE CÓDIGO AQUÍ */}
        {/* Este spinner se mostrará mientras cargan los datos base de la campaña */}
        {loading.titles && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        )}

        {/* --- SECCIÓN 2 y 3 UNIFICADAS --- */}
        <Collapse in={!!selectedCampaign && !loading.titles} timeout="auto">
            {/* Contenedor principal para todos los resultados */}
            <Paper variant="outlined" sx={{ p: 3 }}>

                {/* --- Sub-sección 2.1: Resumen Visual (StatCards y Gráfico) --- */}
                <Typography variant="h5" gutterBottom>
                    {reportData ? 'Filtered Results' : 'Campaign Overview'}
                </Typography>
                <Divider sx={{ mb: 3 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', mb: 3 }}>
                    <StatCard title="Total Amount"
                        value={`$${(reportData?.totalAmount ?? campaignStats?.campaign_total_amount ?? 0).toFixed(2)}`}
                        icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
                    <StatCard title="Donations"
                        value={`${(reportData?.donationsCount ?? campaignStats?.campaign_total_count ?? 0)}`}
                        icon={<ReceiptLongIcon color="action" sx={{ fontSize: 40 }} />} />
                </Box>
                {campaignStats && (
                    <Paper variant="outlined" sx={{ width: '100%', height: 450, p: 2, mt: 2 }}>
                        <Typography variant="h6" gutterBottom>Revenue by Form Title</Typography>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={campaignStats?.stats_by_form_title ?? []} margin={{ top: 5, right: 30, left: 20, bottom: 120 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="form_title_name" angle={-45} textAnchor="end" interval={0} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                                <YAxis tickFormatter={tick => `$${tick.toLocaleString()}`} tick={{ fill: theme.palette.text.secondary }} />
                                <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                                <Bar dataKey="total_amount" fill={theme.palette.primary.main} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                )}

                {/* --- Sub-sección 3.1: Tabla Detallada y Círculo de Carga --- */}
                <Box sx={{ mt: 4 }}>
                    
                    {/* El círculo de carga aparece aquí cuando es necesario */}
                    {loading.report && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    )}

                    {/* La tabla aparece solo si NO está cargando Y hay datos para mostrar */}
                    <Collapse in={!loading.report && !!reportData} timeout="auto">
                        {/* Verificamos de nuevo que reportData no sea nulo antes de renderizar */}
                        {reportData && (
                            <>
                                <Typography variant="h5" gutterBottom>Detailed Report</Typography>
                                <Divider sx={{ mb: 2 }} />
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
                                    <Table stickyHeader size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Donor</TableCell>
                                                <TableCell>Email</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {reportData.donations.map(d => (
                                                <TableRow key={d.id} hover>
                                                    <TableCell>{d.donorName}</TableCell>
                                                    <TableCell>{d.donorEmail}</TableCell>
                                                    <TableCell>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                                                    <TableCell align="right">${d.amount.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </>
                        )}
                    </Collapse>
                </Box>
            </Paper>
        </Collapse>
    </Box>
  );
};

export default CampaignAnalyticsPage;