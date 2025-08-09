// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Chip, Grid
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
import debounce from 'lodash-es/debounce';

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
    // --- Estados de Carga y Errores (Unificados) ---
    const [loading, setLoading] = useState({ sources: true, campaigns: false, stats: false, report: false, titles: false });

    const [error, setError] = useState('');
    const [sourceStats, setSourceStats] = useState<SourceStatsData | null>(null);

  
    // --- Carga inicial de Fuentes ---
    useEffect(() => {
        apiClient.get('/campaigns/sources')
        .then(res => setSources(res.data.map((s: string) => ({ id: s, name: s }))))
        .catch(() => setError('Failed to load sources.'))
        .finally(() => setLoading(prev => ({ ...prev, sources: false })));
    }, []);

    // --- AÑADE ESTOS BLOQUES DE CÓDIGO ---

    // --- Carga de Campañas (depende de la fuente) ---
    useEffect(() => {
        if (!selectedSource) {
            setCampaigns([]);
            setSelectedCampaign('');
            return;
        }
        setLoading(prev => ({ ...prev, campaigns: true }));
        apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`)
            .then(res => setCampaigns(res.data))
            .catch(() => setError('Failed to load campaigns for the selected source.'))
            .finally(() => setLoading(prev => ({ ...prev, campaigns: false })));
    }, [selectedSource]);

    // --- Carga de Títulos de Formulario (solo cuando cambia la campaña) ---
    // --- Carga de Títulos de Formulario (depende de la campaña) ---
    useEffect(() => {
        if (!selectedCampaign) {
            setFormTitles([]);
            // Limpia los títulos seleccionados cuando la campaña cambia
            setSelectedTitles([]); 
            setSelectorKey(k => k + 1); // Fuerza el reseteo del componente hijo
            return;
        }
        setLoading(prev => ({ ...prev, titles: true }));
        apiClient.get<ApiListItem[]>(`/form-titles?campaign_id=${selectedCampaign}`)
            .then(res => setFormTitles(res.data))
            .catch(() => setError('Failed to load form titles.'))
            .finally(() => setLoading(prev => ({ ...prev, titles: false })));
    }, [selectedCampaign]);

    // --- Lógica de Obtención de Datos de Estadísticas ---
    const fetchStats = useCallback(async (isSilent = false) => {
        // No hacer nada si no hay una fuente seleccionada
        if (!selectedSource) {
            setSourceStats(null);
            setCampaignStats(null);
            return;
        }

        if (!isSilent) setLoading(prev => ({ ...prev, stats: true }));
        setError('');

        // Construir los parámetros de fecha, que ahora aplican a ambas llamadas
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate.format('YYYY-MM-DD'));
        if (endDate) params.append('end_date', endDate.format('YYYY-MM-DD'));
        if (selectedTitles.length > 0) {
        selectedTitles.forEach(id => params.append('form_title_id', id));
        }
        const dateQuery = params.toString();
        
        try {
            // Si hay una campaña seleccionada, se buscan sus estadísticas detalladas
            if (selectedCampaign) {
                const statsRes = await apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats?${dateQuery}`);
                setCampaignStats(statsRes.data);
                setSourceStats(null); // Limpiamos el estado anterior
            } else {
            // Si solo hay una fuente, se buscan las estadísticas agrupadas por campaña
                const statsRes = await apiClient.get<SourceStatsData>(`/campaigns/source/${selectedSource}/stats?${dateQuery}`);
                setSourceStats(statsRes.data);
                setCampaignStats(null); // Limpiamos el estado anterior
            }
        } catch {
            setError('Failed to load analytics data.');
        } finally {
            if (!isSilent) setLoading(prev => ({ ...prev, stats: false }));
        }
    }, [selectedSource, selectedCampaign, startDate, endDate, selectedTitles]);




    // Este es el hook clave que soluciona el problema principal.
    useEffect(() => {
        // No llames a la función si la fuente aún no se ha cargado/seleccionado
        if (selectedSource) {
            fetchStats();
        }
    }, [fetchStats, selectedSource]); // fetchStats ya contiene todas las dependencias necesarias



  // --- Búsqueda/Generación del Reporte Detallado ---
    const handleGenerateReport = useCallback(async (isSilent = false) => {
        if (selectedTitles.length === 0) {
            setReportData(null);
            return;
        }
        
        if (!isSilent) setLoading(prev => ({ ...prev, report: true }));
        // No limpiamos reportData aquí para una mejor UX durante la recarga silenciosa
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
            if (!isSilent) setLoading(prev => ({ ...prev, report: false }));
        }
    }, [selectedTitles, startDate, endDate]);

    const debouncedReportGenerator = useCallback(
    debounce(() => {
        // Llamamos a la función original. Pasamos 'false' para que el spinner de carga aparezca.
        handleGenerateReport(false);
    }, 750), 
    [handleGenerateReport] // Depende de la función original
    );


     // --- ✅ MEJORA: useEffect para auto-actualizar el reporte si las fechas cambian ---
    // Este hook mejora la experiencia de usuario. Si ya se generó un reporte detallado
    // y el usuario cambia las fechas, el reporte se actualiza solo.
    useEffect(() => {
    // Solo intentamos generar un reporte si el usuario ha seleccionado al menos un título.
    if (selectedTitles.length > 0) {
        debouncedReportGenerator();
    } else {
        // Si el usuario borra todos los títulos, limpiamos los datos del reporte.
        setReportData(null);
    }

    // Función de limpieza: Es CRUCIAL para cancelar cualquier llamada pendiente
    // si el componente se desmonta o los filtros cambian de nuevo.
    return () => {
        debouncedReportGenerator.cancel();
    };
}, [selectedTitles, startDate, endDate, debouncedReportGenerator]);


  // --- ✅ CORREGIDO: WebSocket para actualizaciones en tiempo real ---
    useEffect(() => {
        const unsubscribe = subscribe('new_donation', () => {
            console.log('New donation detected! Refreshing analytics...');
            // Refresca las estadísticas generales silenciosamente
            if (selectedSource) {
                fetchStats(true); // <-- CORREGIDO: fetchStats en lugar de fetchData
            }
            // Si hay un reporte detallado visible, también lo refresca silenciosamente
            if (reportData) {
                handleGenerateReport(true);
            }
        });
        return () => unsubscribe();
    // No necesitamos `reportData` en las dependencias aquí para evitar re-suscripciones innecesarias
    // `handleGenerateReport` y `fetchStats` son estables gracias a useCallback
    }, [subscribe, selectedSource, handleGenerateReport, fetchStats]);

    
    const handleClearAllFilters = () => {
    setSelectedSource('');
    setSelectedCampaign('');
    setSelectedTitles([]);
    setStartDate(null);
    setEndDate(null);
    setReportData(null);
    setCampaignStats(null);
    setSourceStats(null);
    setSelectorKey(k => k + 1);
};

const handleClearCampaign = () => {
    setSelectedCampaign('');
    setSelectedTitles([]);
    setReportData(null);
    setSelectorKey(k => k + 1);
};

const handleClearDates = () => {
    setStartDate(null);
    setEndDate(null);
};
  
  // Función para renderizar los valores seleccionados en el Select
  const displayData = campaignStats || sourceStats;
  const totalAmount = reportData?.totalAmount ?? (campaignStats?.campaign_total_amount ?? sourceStats?.source_total_amount ?? 0);
  const totalCount = reportData?.donationsCount ?? (campaignStats?.campaign_total_count ?? sourceStats?.source_total_count ?? 0);
  
  const chartData = campaignStats?.stats_by_form_title 
    ? campaignStats.stats_by_form_title.map(d => ({ name: d.form_title_name, ...d }))
    : sourceStats?.stats_by_campaign.map(d => ({ name: d.campaign_name, ...d }));

  
  
    return (
        <Box sx={{ flexGrow: 1, p: { xs: 1, md: 3 } }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Campaign Analytics
            </Typography>
            
            <Grid container spacing={3}>
                {/* === COLUMNA IZQUIERDA: PANEL DE CONTROL (5 de 12 columnas) === */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: '24px' }}>
                        <Typography variant="h6" gutterBottom>
                            Control Panel
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            {/* 1. Selector de Fuente */}
                            <FormControl fullWidth>
                                <InputLabel>1. Select Source</InputLabel>
                                <Select 
                                    value={selectedSource} 
                                    label="1. Select Source" 
                                    onChange={e => {
                                        setSelectedSource(e.target.value); 
                                        setSelectedCampaign('');
                                        setSelectedTitles([]);
                                        setReportData(null);
                                        setSelectorKey(k => k + 1);
                                    }} 
                                    disabled={loading.sources}
                                >
                                    {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                </Select>
                            </FormControl>

                            {/* 2. Filtros Principales */}
                            <Collapse in={!!selectedSource} timeout="auto" sx={{ width: '100%' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                                    <FormControl fullWidth disabled={!selectedSource || loading.campaigns}>
                                        <InputLabel>2. Drill Down by Campaign (Optional)</InputLabel>
                                        <Select value={selectedCampaign} label="2. Drill Down by Campaign (Optional)" onChange={e => setSelectedCampaign(e.target.value)}>
                                            <MenuItem value=""><em>-- View All Campaigns in Source --</em></MenuItem>
                                            {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                                        <DatePicker label="Start Date" value={startDate} onChange={setStartDate} disabled={!selectedSource} sx={{ width: '100%' }} />
                                        <DatePicker label="End Date" value={endDate} onChange={setEndDate} disabled={!selectedSource} sx={{ width: '100%' }} />
                                    </Box>
                                </Box>
                            </Collapse>

                            {/* 3. Reporte Detallado */}
                            <Collapse in={!!selectedCampaign} timeout="auto" unmountOnExit>
                                <Divider sx={{ my: 2 }}><Chip label="Detailed Report" icon={<TuneIcon />} /></Divider>
                                <FormTitleSelector key={selectorKey} titles={formTitles} onSelectionChange={setSelectedTitles} />
                                
                            </Collapse>
                            
                            <Divider sx={{ mt: 2 }} />

                            {/* 4. Acción de Limpiar Filtros */}
                            <Button variant="outlined" color="secondary" onClick={handleClearAllFilters} disabled={!selectedSource && !startDate && !endDate && !selectedCampaign}>
                                Clear All Filters
                            </Button>
                        </Box>
                    </Paper>
                </Grid>

                {/* === COLUMNA DERECHA: VISUALIZACIÓN DE DATOS (7 de 12 columnas) === */}
                <Grid size={{ xs: 12, md: 7 }}>
                    {/* Indicadores de Filtros Activos */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                        {selectedSource && <Chip label={`Source: ${selectedSource}`} onDelete={handleClearAllFilters} />}
                        {selectedCampaign && <Chip color="primary" label={`Campaign: ${campaigns.find(c => c.id === selectedCampaign)?.name || ''}`} onDelete={handleClearCampaign}/>}
                        {(startDate || endDate) && <Chip color="primary" label={`Period: ${startDate ? startDate.format('DD/MM/YY') : '...'} - ${endDate ? endDate.format('DD/MM/YY') : '...'}`} onDelete={handleClearDates} />}
                    </Box>
                    
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {/* Lógica de Renderizado Condicional */}
                    {loading.stats && !displayData ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}><CircularProgress /></Box>
                    ) : !displayData ? (
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', height: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <Typography variant="h6" color="text.secondary">Select a source from the control panel to begin.</Typography>
                        </Paper>
                    ) : (
                        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
                            {/* StatCards */}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', mb: 4 }}>
                                <StatCard title="Total Amount" value={`$${totalAmount.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
                                <StatCard title="Donations" value={`${totalCount}`} icon={<ReceiptLongIcon color="action" sx={{ fontSize: 40 }} />} />
                            </Box>
                            
                            {/* Gráfico */}
                            {chartData && chartData.length > 0 && (
                                <Paper variant="outlined" sx={{ width: '100%', height: 450, p: 2, mt: 2 }}>
                                    <Typography variant="h6" gutterBottom>{selectedCampaign ? 'Revenue by Form Title' : 'Revenue by Campaign'}</Typography>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 120 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                                            <YAxis tickFormatter={tick => `$${tick.toLocaleString()}`} tick={{ fill: theme.palette.text.secondary }} />
                                            <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']} contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} cursor={{ fill: 'rgba(128,128,128,0.1)' }}/>
                                            <Bar dataKey="total_amount" name="Amount" fill={theme.palette.primary.main} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Paper>
                            )}
                            
                            {/* Tabla de Reporte Detallado */}
                            <Box sx={{ mt: 4 }}>
                                {loading.report && (<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>)}
                                <Collapse in={!loading.report && !!reportData} timeout="auto">
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
                    )}
                </Grid>
            </Grid>
        </Box>
    );
};

export default CampaignAnalyticsPage;