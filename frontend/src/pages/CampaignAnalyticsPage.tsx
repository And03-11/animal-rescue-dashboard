// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Chip, Grid, Stack
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useWebSocket } from '../context/WebSocketProvider';
import { FormTitleSelector } from '../components/FormTitleSelector';

interface ApiListItem { 
    id: string; 
    name: string; 
    createdTime?: string; // ✅ AÑADE ESTA LÍNEA
}
interface Donation { id: string; date: string; amount: number; donorName: string; donorEmail: string; }
interface AnalyticsStats {
    total_amount: number;
    total_count: number;
    breakdown: {
        id: string;
        name: string;
        total_amount: number;
        donation_count: number;
        date_sent?: string; // Cambiar 'createdTime' por 'date_sent'
    }[];
}

interface CustomReportData { donations: Donation[]; totalAmount: number; donationsCount: number; }
interface AnalyticsData { stats: AnalyticsStats | null; report: CustomReportData | null; }

export const CampaignAnalyticsPage: React.FC = () => {
    const theme = useTheme();
    const { subscribe } = useWebSocket();

    const [sources, setSources] = useState<ApiListItem[]>([]);
    const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
    const [formTitles, setFormTitles] = useState<ApiListItem[]>([]);
    const [selectedSource, setSelectedSource] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [selectorKey, setSelectorKey] = useState(0);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({ stats: null, report: null });
    const [loading, setLoading] = useState({ initial: true, stats: false, report: false, dependent: false });
    const [error, setError] = useState('');

    const inFlight = useRef<AbortController | null>(null);
    const wsDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Normaliza y deduplica para tolerar shapes distintos
    const normalizeFormTitles = (data: any): ApiListItem[] => {
        if (!Array.isArray(data)) return [];
        const mapped = data
            .map((t: any) => ({
                id: t?.id ?? t?.form_title_id ?? t?.value ?? t?.key ?? '',
                name: t?.name ?? t?.title ?? t?.label ?? t?.form_title_name ?? '(Untitled)',
                createdTime: t?.createdTime, // ✅ AÑADE ESTA LÍNEA
            }))
            .filter((x: ApiListItem) => x.id);
        return Array.from(new Map(mapped.map(x => [x.id, x])).values());
    };

    useEffect(() => {
        apiClient.get('/campaigns/sources')
            .then(res => setSources(res.data.map((s: string) => ({ id: s, name: s }))))
            .catch(() => setError('Failed to load sources.'))
            .finally(() => setLoading(prev => ({ ...prev, initial: false })));
    }, []);

    useEffect(() => {
        if (!selectedSource) {
            setCampaigns([]);
            setSelectedCampaign('');
            return;
        }
        setLoading(prev => ({ ...prev, dependent: true }));
        apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`)
            .then(res => {
        // ✅ CORRECCIÓN: Ordenamos las campañas por fecha ascendente.
        const sortedCampaigns = res.data.sort((a, b) => {
          if (!a.createdTime || !b.createdTime) return 0;
          
          // ✅ CAMBIO DE LÓGICA: Simplemente invertimos 'a' y 'b'.
          // a - b nos da un orden ascendente (la más antigua primero).
          return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
        });
        
        setCampaigns(sortedCampaigns);
      })
      .catch(() => setError('Failed to load campaigns for the selected source.'))
      .finally(() => setLoading(prev => ({ ...prev, dependent: false })));
  }, [selectedSource]);

    useEffect(() => {
        if (!selectedCampaign) {
            setFormTitles([]);
            setSelectedTitles([]);
            setSelectorKey(k => k + 1);
            return;
        }
        setLoading(prev => ({ ...prev, dependent: true }));

        apiClient.get(`/form-titles?campaign_id=${selectedCampaign}`)
            .then(res => {
                const normalized = normalizeFormTitles(res.data);
                
                // ✅ CAMBIO: Ordenamos la lista por fecha (más antiguo primero)
                normalized.sort((a, b) => {
                    if (!a.createdTime || !b.createdTime) return 0; // Manejo por si alguna fecha no viniera
                    return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
                });

                setFormTitles(normalized);
            })
            .catch(async (err) => {
                // ... (el resto de la función no cambia)
                const status = err?.response?.status;
                if (status === 404) {
                    try {
                        const statsRes = await apiClient.get(`/campaigns/${selectedCampaign}/stats`);
                        const titlesFromStats = normalizeFormTitles(
                            (statsRes.data?.stats_by_form_title ?? []).map((i: any) => ({
                                form_title_id: i.form_title_id,
                                form_title_name: i.form_title_name ?? i.campaign_name ?? i.form_title_id,
                            }))
                        );
                        setFormTitles(titlesFromStats);
                    } catch {
                        setError('Failed to load form titles (fallback).');
                        setFormTitles([]);
                    }
                } else {
                    setError('Failed to load form titles.');
                    setFormTitles([]);
                }
            })
            .finally(() => setLoading(prev => ({ ...prev, dependent: false })));
    }, [selectedCampaign]);


    useEffect(() => { setError(''); }, [selectedSource, selectedCampaign, startDate, endDate, selectedTitles]);

    const fetchData = useCallback(async (isSilent = false) => {
        if (!selectedSource) {
            setError("Please select a source to begin.");
            return;
        }
        if (inFlight.current) inFlight.current.abort();
        const controller = new AbortController();
        inFlight.current = controller;

        if (!isSilent) setLoading(prev => ({ ...prev, stats: true, report: true }));
        setError('');

        try {
            const dedupTitles = Array.from(new Set(selectedTitles));
            const statsParams = new URLSearchParams();
            if (startDate) statsParams.append('start_date', startDate.format('YYYY-MM-DD'));
            if (endDate) statsParams.append('end_date', endDate.format('YYYY-MM-DD'));

            const hasCampaign = !!selectedCampaign;
            const totalTitles = formTitles.length;
            const hasSubset = hasCampaign && dedupTitles.length > 0 && totalTitles > 0 && dedupTitles.length < totalTitles;

            if (hasSubset) dedupTitles.forEach(id => statsParams.append('form_title_id', id));

            const statsQuery = statsParams.toString();
            const statsUrl = hasCampaign
                ? `/campaigns/${selectedCampaign}/stats?${statsQuery}`
                : `/campaigns/source/${selectedSource}/stats?${statsQuery}`;

            const statsPromise = apiClient.get(statsUrl, { signal: controller.signal });

            let reportPromise: Promise<{ data: CustomReportData } | null> | null = null;

            if (hasCampaign) {
                if (hasSubset) {
                    const payload = {
                        form_title_ids: dedupTitles,
                        start_date: startDate ? startDate.format('YYYY-MM-DD') : undefined,
                        end_date: endDate ? endDate.format('YYYY-MM-DD') : undefined,
                        };

                        reportPromise = apiClient.post<CustomReportData>(
                        '/form-titles/donations',
                        JSON.stringify(payload),               // asegura JSON "plano"
                        {
                            signal: controller.signal,
                            headers: { 'Content-Type': 'application/json' }, // fuerza JSON en esta request
                            transformRequest: [(data) => data],  // evita transformaciones globales
                        }
                        );
                } else {
                    const baseParams = new URLSearchParams();
                    if (startDate) baseParams.append('start_date', startDate.format('YYYY-MM-DD'));
                    if (endDate) baseParams.append('end_date', endDate.format('YYYY-MM-DD'));
                    const campaignReportUrl = `/campaigns/${selectedCampaign}/donations?${baseParams.toString()}`;

                    reportPromise = (async () => {
                        try {
                            const r = await apiClient.get<CustomReportData>(campaignReportUrl, { signal: controller.signal });
                            return r;
                        } catch (err: any) {
                            const status = err?.response?.status;
                            const canFallback = status === 404 || status === 405 || status === 501;
                            if (!canFallback) throw err;

                            const idsForFallback = formTitles.length > 0 ? formTitles.map(t => t.id) : dedupTitles;
                            const payloadFB = {
                                form_title_ids: Array.from(new Set(idsForFallback)),
                                start_date: startDate ? startDate.format('YYYY-MM-DD') : undefined,
                                end_date: endDate ? endDate.format('YYYY-MM-DD') : undefined,
                            };
                            return await apiClient.post<CustomReportData>(
                                '/form-titles/donations',
                                payloadFB,
                                { signal: controller.signal }
                            );
                        }
                    })();
                }
            }

            const [statsRes, reportRes] = await Promise.all([
                statsPromise,
                reportPromise ?? Promise.resolve(null)
            ]);

            const newStats: AnalyticsStats = {
                total_amount: statsRes.data.campaign_total_amount ?? statsRes.data.source_total_amount,
                total_count: statsRes.data.campaign_total_count ?? statsRes.data.source_total_count,
                breakdown: (statsRes.data.stats_by_form_title ?? statsRes.data.stats_by_campaign).map((item: any) => ({
                    id: item.form_title_id ?? item.campaign_id,
                    name: item.form_title_name ?? item.campaign_name,
                    total_amount: item.total_amount,
                    donation_count: item.donation_count,
                    date_sent: item.date_sent // Cambiar 'createdTime' por 'date_sent'
                }))
            };
            
            setAnalyticsData({
                stats: newStats,
                report: reportRes ? (reportRes as any).data : null,
            });
        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            setError('Failed to load analytics data.');
            setAnalyticsData({ stats: null, report: null });
        } finally {
            if (inFlight.current === controller) {
                if (!isSilent) setLoading(prev => ({ ...prev, stats: false, report: false }));
                inFlight.current = null;
            }
        }
    }, [selectedSource, selectedCampaign, selectedTitles, startDate, endDate, formTitles]);

    const handleApplyFilters = () => { fetchData(false); };

    useEffect(() => {
        const unsubscribe = subscribe('new_donation', () => {
            if (wsDebounce.current) clearTimeout(wsDebounce.current);
            wsDebounce.current = setTimeout(() => { fetchData(true); }, 500);
        });
        return () => {
            unsubscribe();
            if (wsDebounce.current) clearTimeout(wsDebounce.current);
            if (inFlight.current) inFlight.current.abort();
        };
    }, [subscribe, fetchData]);

    const handleClearAllFilters = () => {
        setSelectedSource('');
        setSelectedCampaign('');
        setSelectedTitles([]);
        setCampaigns([]);
        setFormTitles([]);
        setStartDate(null);
        setEndDate(null);
        setAnalyticsData({ stats: null, report: null });
        setError('');
    };

    const handleClearCampaign = () => { setSelectedCampaign(''); };
    const handleClearDates = () => { setStartDate(null); setEndDate(null); };

    const { stats, report } = analyticsData;
    const totalAmount = report?.totalAmount ?? stats?.total_amount ?? 0;
    const totalCount = report?.donationsCount ?? stats?.total_count ?? 0;
    const chartData = stats?.breakdown;

    return (
        <Box sx={{ flexGrow: 1, p: { xs: 1, md: 3 } }}>
            <Typography variant="h4" component="h1" gutterBottom>Campaign Analytics</Typography>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: '24px' }}>
                        <Typography variant="h6" gutterBottom>Control Panel</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <FormControl fullWidth>
                                <InputLabel>1. Select Source</InputLabel>
                                <Select value={selectedSource} label="1. Select Source" onChange={e => setSelectedSource(e.target.value)} disabled={loading.initial}>
                                    {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <Collapse in={!!selectedSource} timeout="auto" sx={{ width: '100%' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                                    <FormControl fullWidth disabled={!selectedSource || loading.dependent}>
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
                            <Collapse in={!!selectedCampaign} timeout="auto" unmountOnExit>
                                <Divider sx={{ my: 2 }}><Chip label="Detailed Report" icon={<TuneIcon />} /></Divider>
                                <FormTitleSelector key={selectorKey} titles={formTitles} onSelectionChange={setSelectedTitles} isLoading={loading.dependent} />
                            </Collapse>

                            <Divider sx={{ mt: 2 }} />
                            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                <Button variant="contained" color="primary" onClick={handleApplyFilters} disabled={!selectedSource || loading.stats} fullWidth>Apply Filters</Button>
                                <Button variant="outlined" color="secondary" onClick={handleClearAllFilters} disabled={!selectedSource} fullWidth>Clear All</Button>
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 7 }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, minHeight: '32px' }}>
                        {selectedSource && <Chip label={`Source: ${selectedSource}`} onDelete={handleClearAllFilters} />}
                        {selectedCampaign && <Chip color="primary" label={`Campaign: ${campaigns.find(c => c.id === selectedCampaign)?.name || ''}`} onDelete={handleClearCampaign} />}
                        {(startDate || endDate) && <Chip color="primary" label={`Period: ${startDate ? startDate.format('DD/MM/YY') : '...'} - ${endDate ? endDate.format('DD/MM/YY') : '...'}`} onDelete={handleClearDates} />}
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {loading.stats ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}><CircularProgress /></Box>
                    ) : !stats ? (
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', height: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <Typography variant="h6" color="text.secondary">Select filters and press "Apply Filters" to see data.</Typography>
                        </Paper>
                    ) : (
                        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', mb: 4 }}>
                                <StatCard title="Total Amount" value={`$${totalAmount.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
                                <StatCard title="Donations" value={`${totalCount}`} icon={<ReceiptLongIcon color="action" sx={{ fontSize: 40 }} />} />
                            </Box>

                            {/* --- GRÁFICO (RESTAURADO) --- */}
                            {chartData && chartData.length > 0 && (
                                <Paper variant="outlined" sx={{ width: '100%', height: 450, p: 2, mt: 2 }}>
                                    <Typography variant="h6" gutterBottom>{selectedCampaign ? 'Revenue by Form Title' : 'Revenue by Campaign'}</Typography>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 120 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                                            <YAxis tickFormatter={(tick) => `$${tick.toLocaleString()}`} tick={{ fill: theme.palette.text.secondary }} />
                                            <Tooltip formatter={(value: number) => [`$${Number(value).toFixed(2)}`, 'Amount']} contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                                            <Bar dataKey="total_amount" name="Amount" fill={theme.palette.primary.main} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Paper>
                            )}
                            <Box sx={{ mt: 4 }}>
                                {loading.report && (<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>)}
                                <Collapse in={!loading.report && !!report} timeout="auto">
                                    {report && (
                                        <>
                                            <Typography variant="h5" gutterBottom>Donors</Typography>
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
                                                        {report.donations.length === 0 ? (
                                                            <TableRow>
                                                                <TableCell colSpan={4} align="center">No donations found</TableCell>
                                                            </TableRow>
                                                        ) : (
                                                            report.donations.map(d => (
                                                                <TableRow key={d.id} hover>
                                                                    <TableCell>{d.donorName}</TableCell>
                                                                    <TableCell>{d.donorEmail}</TableCell>
                                                                    <TableCell>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                                                                    <TableCell align="right">${d.amount.toFixed(2)}</TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </>
                                    )}
                                </Collapse>
                            </Box>
                            {/* --- NUEVA TABLA DETALLADA --- */}
                            {chartData && chartData.length > 0 && (
                                <Paper variant="outlined" sx={{ width: '100%', mt: 4 }}>
                                    <Typography variant="h6" sx={{ p: 2 }}>Form Titles</Typography>
                                    <TableContainer>
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Form Title</TableCell>
                                                    <TableCell>First Donation Date</TableCell>
                                                    <TableCell align="right">Donations</TableCell>
                                                    <TableCell align="right">Amount Raised</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {chartData.map((item) => (
                                                    <TableRow key={item.id} hover>
                                                        <TableCell component="th" scope="row">{item.name}</TableCell>
                                                        <TableCell>
                                                            {item.date_sent ? dayjs(item.date_sent).format('DD/MM/YYYY') : 'N/A'}
                                                        </TableCell>
                                                        <TableCell align="right">{item.donation_count}</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                            ${item.total_amount.toFixed(2)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Paper>
                            )}

                            {/* --- TABLA DE DONADORES (sin cambios) --- */}
                            
                        </Paper>
                    )}
                </Grid>
            </Grid>
        </Box>
    );
};

export default CampaignAnalyticsPage;
