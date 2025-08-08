// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Chip 
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune'; 
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts';
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
interface SourceStatsData {
    source_total_amount: number;
    source_total_count: number;
    stats_by_campaign: {
        campaign_id: string;
        campaign_name: string;
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
  const [loading, setLoading] = useState({ sources: true, campaigns: false, stats: false, report: false });
  const [error, setError] = useState('');
  const [sourceStats, setSourceStats] = useState<SourceStatsData | null>(null);

  
  // --- Carga inicial de Fuentes ---
  useEffect(() => {
    apiClient.get('/campaigns/sources')
      .then(res => setSources(res.data.map((s: string) => ({ id: s, name: s }))))
      .catch(() => setError('Failed to load sources.'))
      .finally(() => setLoading(prev => ({ ...prev, sources: false })));
  }, []);


  // --- Carga de Títulos y Estadísticas Generales al cambiar Campaña ---
  const fetchData = useCallback(async (isSilent = false) => {
    // Si no hay fuente seleccionada, reseteamos todo y salimos.
    if (!selectedSource) {
      setCampaigns([]);
      setSelectedCampaign('');
      setSourceStats(null);
      setCampaignStats(null);
      return;
    }

    if (!isSilent) setLoading(prev => ({ ...prev, stats: true }));
    setError('');

    // Preparamos los parámetros de fecha para enviarlos a la API
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate.format('YYYY-MM-DD'));
    if (endDate) params.append('end_date', endDate.format('YYYY-MM-DD'));
    const dateQuery = params.toString();

    try {
        // 1. Siempre obtenemos la lista de campañas para la fuente seleccionada.
        const campaignsRes = await apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`);
        setCampaigns(campaignsRes.data);

        if (selectedCampaign) {
            // 2A. SI hay una campaña seleccionada, pedimos sus estadísticas detalladas.
            const statsRes = await apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats?${dateQuery}`);
            setCampaignStats(statsRes.data);
            setSourceStats(null); // Limpiamos los datos de la fuente para no mezclarlos.
            
            // También cargamos los form titles para el filtro avanzado
            const titlesRes = await apiClient.get<ApiListItem[]>(`/form-titles?campaign_id=${selectedCampaign}`);
            setFormTitles(titlesRes.data);

        } else {
            // 2B. SI NO hay campaña seleccionada, pedimos las estadísticas de la FUENTE COMPLETA.
            const statsRes = await apiClient.get<SourceStatsData>(`/campaigns/source/${selectedSource}/stats?${dateQuery}`);
            setSourceStats(statsRes.data);
            setCampaignStats(null); // Limpiamos los datos de la campaña.
            setFormTitles([]); // No hay form titles en la vista de fuente.
        }
    } catch {
        setError('Failed to load analytics data.');
    } finally {
        if (!isSilent) setLoading(prev => ({ ...prev, stats: false }));
    }
  }, [selectedSource, selectedCampaign, startDate, endDate]);

  // Este único useEffect ahora controla toda la carga de datos principal.
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);


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
  // frontend/src/pages/CampaignAnalyticsPage.tsx

// --- WebSocket para actualizaciones en tiempo real ---
    useEffect(() => {
        const unsubscribe = subscribe('new_donation', () => {
            console.log('New donation detected! Refreshing analytics...');
            // Si hay una fuente seleccionada, refresca la vista actual (sea de fuente o de campaña)
            if (selectedSource) fetchData(true);
            // Si hay un reporte detallado visible, también lo refresca
            if (reportData) handleGenerateReport(true);
        });
        return () => unsubscribe();
    }, [subscribe, selectedSource, reportData, fetchData, handleGenerateReport]);

    const handleClearFilters = () => {
        setStartDate(null);
        setEndDate(null);
        setReportData(null); // Esto oculta la tabla de reporte y revierte los StatCards
        setSelectorKey(prev => prev + 1); // Esto fuerza el remount y reseteo del selector de títulos
    };
  
  // Función para renderizar los valores seleccionados en el Select
  const displayData = campaignStats || sourceStats;
  const totalAmount = reportData?.totalAmount ?? (campaignStats?.campaign_total_amount ?? sourceStats?.source_total_amount ?? 0);
  const totalCount = reportData?.donationsCount ?? (campaignStats?.campaign_total_count ?? sourceStats?.source_total_count ?? 0);
  
  const chartData = campaignStats?.stats_by_form_title 
    ? campaignStats.stats_by_form_title.map(d => ({ name: d.form_title_name, ...d }))
    : sourceStats?.stats_by_campaign.map(d => ({ name: d.campaign_name, ...d }));

  
  
  return (
    <Box sx={{ width: '100%', maxWidth: '1280px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h4" component="h1">Campaign Analytics</Typography>

        {/* --- SECCIÓN 1: PANEL DE CONTROL (FILTROS) --- */}
        {/* --- SECCIÓN 1: PANEL DE CONTROL (FILTROS) --- */}
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h5" gutterBottom>Analytics Filters</Typography>
            <Divider sx={{ mb: 2 }} />

            {/* Usamos un Box con flexbox para un control vertical limpio */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* --- PASO 1: SELECCIONAR FUENTE (Siempre visible) --- */}
                <FormControl fullWidth>
                    <InputLabel>1. Select Source</InputLabel>
                    <Select 
                        value={selectedSource} 
                        label="1. Select Source" 
                        onChange={e => {
                            setSelectedSource(e.target.value); 
                            setSelectedCampaign('');
                        }} 
                        disabled={loading.sources}
                    >
                        {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </Select>
                </FormControl>

                {/* --- PASO 2: FILTROS PRINCIPALES (Aparecen al seleccionar fuente) --- */}
                <Collapse in={!!selectedSource} timeout="auto" sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <FormControl fullWidth disabled={!selectedSource || loading.campaigns}>
                            <InputLabel>2. Drill Down by Campaign (Optional)</InputLabel>
                            <Select value={selectedCampaign} label="2. Drill Down by Campaign (Optional)" onChange={e => setSelectedCampaign(e.target.value)}>
                                <MenuItem value=""><em>-- View All Campaigns in Source --</em></MenuItem>
                                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                            <DatePicker 
                                label="Start Date" 
                                value={startDate} 
                                onChange={setStartDate} 
                                sx={{ width: '100%' }}
                            />
                            <DatePicker 
                                label="End Date" 
                                value={endDate} 
                                onChange={setEndDate} 
                                sx={{ width: '100%' }}
                            />
                        </Box>
                    </Box>
                </Collapse>

                {/* --- PASO 3: REPORTE DETALLADO (Desplegable y solo si hay campaña) --- */}
                <Collapse in={!!selectedCampaign} timeout="auto" unmountOnExit>
                    <Divider sx={{ my: 2, mt: 3 }}>
                        <Chip 
                            icon={<TuneIcon />} 
                            label="Generate Detailed Report"
                            onClick={() => setShowAdvancedFilters(prev => !prev)} // Esto controla el despliegue
                            sx={{ cursor: 'pointer', p: 2, fontSize: '1rem' }}
                        />
                    </Divider>
                    <Collapse in={showAdvancedFilters}>
                        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center', mt: 2 }}>
                            <Box sx={{ flexGrow: 1, width: '100%' }}>
                            <FormTitleSelector
                                    key={selectorKey}
                                    titles={formTitles}
                                    onSelectionChange={setSelectedTitles}
                                />
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                            {!!reportData && (
                                    <Button variant="text" onClick={handleClearFilters}>Clear</Button>
                                )}
                                <Button 
                                    variant="contained" 
                                    onClick={() => handleGenerateReport(false)} 
                                    disabled={loading.report || selectedTitles.length === 0}
                                    sx={{ height: '56px' }}
                                >
                                    {loading.report ? <CircularProgress size={24} /> : 'Generate'}
                                </Button>
                            </Box>
                        </Box>
                    </Collapse>
                </Collapse>
            </Box>
        </Paper>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {/* ✅ AÑADE ESTE BLOQUE DE CÓDIGO AQUÍ */}
        {/* Este spinner se mostrará mientras cargan los datos base de la campaña */}
        {loading.stats && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        )}

        {/* --- SECCIÓN 2 y 3 UNIFICADAS --- */}
        <Collapse in={!loading.stats && !!displayData} timeout="auto">
            {/* Contenedor principal para todos los resultados */}
            <Paper variant="outlined" sx={{ p: 3 }}>

                {/* --- Sub-sección 2.1: Resumen Visual (StatCards y Gráfico) --- */}
                <Typography variant="h5" gutterBottom>
                    {reportData ? 'Filtered Results' : 'Campaign Overview'}
                </Typography>
                <Divider sx={{ mb: 3 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', mb: 3 }}>
                    <StatCard title="Total Amount"
                        value={`$${totalAmount.toFixed(2)}`}
                        icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
                    <StatCard title="Donations"
                        value={`${totalCount}`}
                        icon={<ReceiptLongIcon color="action" sx={{ fontSize: 40 }} />} />
                </Box>
                {chartData && chartData.length > 0 && (
                    <Paper variant="outlined" sx={{ width: '100%', height: 450, p: 2, mt: 2 }}>
                        <Typography variant="h6" gutterBottom>
                            {selectedCampaign ? 'Revenue by Form Title' : 'Revenue by Campaign'}
                        </Typography>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 120 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="name" 
                                    angle={-45} 
                                    textAnchor="end" 
                                    interval={0} 
                                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} 
                                />

                                {/* ✅ Volvemos a un único eje Y a la izquierda para el monto */}
                                <YAxis 
                                    tickFormatter={tick => `$${tick.toLocaleString()}`} 
                                    tick={{ fill: theme.palette.text.secondary }} 
                                />

                                {/* ✅ Tooltip simplificado solo para el monto */}
                                <Tooltip 
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                                    contentStyle={{ 
                                        backgroundColor: theme.palette.background.paper, 
                                        border: `1px solid ${theme.palette.divider}` 
                                    }}
                                    cursor={{ fill: 'rgba(128,128,128,0.1)' }}
                                />

                                {/* ✅ Una única barra para el monto total */}
                                <Bar dataKey="total_amount" name="Amount" fill={theme.palette.primary.main} />
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