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
        start_date?: string; // Cambiar 'createdTime' por 'date_sent'
    }[];
}

interface PaginatedDonationsResponse {
  donations: Donation[];
  total_count: number; // El total general que coincide con los filtros
}



const DONATIONS_PAGE_SIZE = 50;

export const CampaignAnalyticsPage: React.FC = () => {
    const theme = useTheme();
    const { subscribe } = useWebSocket();
    const scrollObserver = useRef<IntersectionObserver | null>(null); // PAGINACIÓN: Ref para el observer
    const loadMoreRef = useRef(null);
    const tableContainerRef = useRef<HTMLDivElement | null>(null);

    const [sources, setSources] = useState<ApiListItem[]>([]);
    const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
    const [formTitles, setFormTitles] = useState<ApiListItem[]>([]);
    const [selectedSource, setSelectedSource] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [selectorKey, setSelectorKey] = useState(0);
    const [analyticsStats, setAnalyticsStats] = useState<AnalyticsStats | null>(null);
    // PAGINACIÓN: Nuevos estados para la lista de donantes y paginación
    const [donations, setDonations] = useState<Donation[]>([]);
    const [totalDonationsCount, setTotalDonationsCount] = useState(0);
    const [currentOffset, setCurrentOffset] = useState(0);
    const [hasMoreDonations, setHasMoreDonations] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const [loading, setLoading] = useState({ initial: true, stats: false, donations: false, dependent: false });
    const [error, setError] = useState('');

    const inFlightStats = useRef<AbortController | null>(null);
    const inFlightDonations = useRef<AbortController | null>(null); // PAGINACIÓN: Ref separada
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


    const fetchMoreDonations = useCallback(async () => {
        console.log("fetchMoreDonations called. Current state:", { isLoadingMore, hasMoreDonations, currentOffset });
        // Evitar llamadas múltiples si ya está cargando o no hay más
        if (isLoadingMore || !hasMoreDonations || !selectedSource) return;
        console.log("fetchMoreDonations aborted (loading, no more data, or no source)");

        setIsLoadingMore(true);
        if (inFlightDonations.current) inFlightDonations.current.abort(); // Abortar si hay una en curso
        const controller = new AbortController();
        inFlightDonations.current = controller;

        try {

            console.log(`Making API call with offset: ${currentOffset}, pageSize: ${DONATIONS_PAGE_SIZE}`);
            const dedupTitles = Array.from(new Set(selectedTitles));
            const hasCampaign = !!selectedCampaign;
            const currentFormTitles = formTitles; // Capturar valor actual del estado
            const totalTitles = currentFormTitles.length;
            const hasSubset = hasCampaign && dedupTitles.length > 0 && totalTitles > 0 && dedupTitles.length < totalTitles;
            const usePost = hasCampaign && hasSubset;

            let donationsRes: { data: PaginatedDonationsResponse };

            const commonParams = {
                start_date: startDate ? startDate.format('YYYY-MM-DD') : undefined,
                end_date: endDate ? endDate.format('YYYY-MM-DD') : undefined,
                page_size: DONATIONS_PAGE_SIZE,
                offset: currentOffset // <-- Usar el offset actual para pedir la siguiente página
            };

            if (usePost) {
                 const payload = {
                     form_title_ids: dedupTitles,
                     ...commonParams
                 };
                donationsRes = await apiClient.post<PaginatedDonationsResponse>(
                     '/form-titles/donations',
                     JSON.stringify(payload),
                     {
                        signal: controller.signal,
                        headers: { 'Content-Type': 'application/json' },
                        transformRequest: [(data) => data],
                     }
                 );
            } else if (hasCampaign) {
                // GET para campaña completa o si no hay títulos definidos
                 const campaignReportUrl = `/campaigns/${selectedCampaign}/donations`;
                 donationsRes = await apiClient.get<PaginatedDonationsResponse>(campaignReportUrl, {
                     params: commonParams,
                     signal: controller.signal
                 });
            } else {
                 // GET para fuente completa (si se implementara paginación a nivel de fuente)
                 // Por ahora, asumimos que esto no debería ocurrir si no hay campaña seleccionada
                 // O podrías adaptar para llamar a /form-titles/donations con todos los títulos de la fuente
                 console.warn("Fetching donations without a specific campaign selected - pagination might need source-level endpoint");
                 setIsLoadingMore(false); // Detener carga si no se maneja
                 return; // Salir por ahora
            }

            console.log(`Making API call with offset: ${currentOffset}, pageSize: ${DONATIONS_PAGE_SIZE}`);


            const { donations: newDonations, total_count } = donationsRes.data;

             // Añadir las nuevas donaciones a las existentes
            const nextOffset = currentOffset + newDonations.length;
            const hasMore = nextOffset < total_count;
            

            console.log("fetchMoreDonations finished. Response:", {
                newDonationsCount: newDonations.length,
                total_count
            }, "Calculated next state:", {
                nextOffset,
                hasMore // Log calculated 'hasMore' value
            });

            setDonations(prev => [...prev, ...newDonations]);
            setCurrentOffset(nextOffset);
            setHasMoreDonations(nextOffset < total_count); // Hay más si el nuevo offset es menor que el total
            setTotalDonationsCount(total_count); // Actualizar el total por si acaso cambia


        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            setError(prev => prev || 'Failed to load more donations.'); // Mostrar error si no hay uno ya
        } finally {
            if (inFlightDonations.current === controller) {
                setIsLoadingMore(false);
                inFlightDonations.current = null;
            }
        }
    }, [isLoadingMore, hasMoreDonations, selectedSource, selectedCampaign, selectedTitles, startDate, endDate, formTitles, currentOffset]);

    const fetchData = useCallback(async (isSilent = false) => {
        if (!selectedSource) {
            // ... (limpieza como antes) ...
            setError("Please select a source to begin.");
            setAnalyticsStats(null); setDonations([]); setTotalDonationsCount(0);
            setCurrentOffset(0); setHasMoreDonations(false);
            return;
        }
        if (inFlightStats.current) inFlightStats.current.abort();
        if (inFlightDonations.current) inFlightDonations.current.abort();

        const statsController = new AbortController();
        const donationsController = new AbortController();
        inFlightStats.current = statsController;
        inFlightDonations.current = donationsController;

        if (!isSilent) {
             // CORRECCIÓN: Usar setLoading correctamente
            setLoading(prev => ({ ...prev, stats: true, donations: true }));
            setAnalyticsStats(null); setDonations([]); setTotalDonationsCount(0);
            setCurrentOffset(0); setHasMoreDonations(false);
        }
        setError('');

        const currentFormTitles = formTitles; // Usar valor estable del estado
        const totalTitles = currentFormTitles.length;
        const dedupTitles = Array.from(new Set(selectedTitles));
        const hasCampaign = !!selectedCampaign;
        const hasSubset = hasCampaign && dedupTitles.length > 0 && totalTitles > 0 && dedupTitles.length < totalTitles;


        // --- 1. Fetch Stats ---
        try {
            // Ya no necesitamos definir totalTitles aquí
            const statsParams = new URLSearchParams();
            if (startDate) statsParams.append('start_date', startDate.format('YYYY-MM-DD'));
            if (endDate) statsParams.append('end_date', endDate.format('YYYY-MM-DD'));
            // hasCampaign y hasSubset ya están definidos arriba
            if (hasSubset) dedupTitles.forEach(id => statsParams.append('form_title_id', id));

            const statsQuery = statsParams.toString();
            const statsUrl = hasCampaign
                ? `/campaigns/${selectedCampaign}/stats?${statsQuery}`
                : `/campaigns/source/${selectedSource}/stats?${statsQuery}`;

            const statsRes = await apiClient.get(statsUrl, { signal: statsController.signal });
            // ... (resto del mapeo de stats como antes)...
            const rawBreakdown = statsRes.data?.stats_by_campaign ?? statsRes.data?.stats_by_form_title ?? [];
            const breakdown = Array.isArray(rawBreakdown) ? rawBreakdown.map((item: any) => ({
                id: item?.campaign_id ?? item?.form_title_id ?? '',
                name: item?.campaign_name ?? item?.form_title_name ?? 'Unknown',
                total_amount: typeof item?.total_amount === 'number' ? item.total_amount : 0,
                donation_count: typeof item?.donation_count === 'number' ? item.donation_count : 0,
                start_date: item?.start_date ?? item?.createdTime,
            })) : [];
             const newStats: AnalyticsStats = {
                total_amount: typeof statsRes.data?.source_total_amount === 'number' ? statsRes.data.source_total_amount :
                              typeof statsRes.data?.campaign_total_amount === 'number' ? statsRes.data.campaign_total_amount : 0,
                total_count: typeof statsRes.data?.source_total_count === 'number' ? statsRes.data.source_total_count :
                             typeof statsRes.data?.campaign_total_count === 'number' ? statsRes.data.campaign_total_count : 0,
                breakdown: breakdown
            };
            setAnalyticsStats(newStats); // <-- Actualiza stats aquí
            

        } catch (err: any) {
             if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
             setError(prev => prev || 'Failed to load analytics stats.'); // Mostrar error si no hay uno ya
             setAnalyticsStats(null); // Limpiar en caso de error
        } finally {
            if (inFlightStats.current === statsController) {
                if (!isSilent) setLoading(prev => ({ ...prev, stats: false }));
                inFlightStats.current = null;
            }
        }

        // --- 2. Fetch First Page of Donations (Solo si hay campaña o títulos seleccionados) ---
        //    (Podrías querer cargar donaciones incluso a nivel de Fuente, ajusta la lógica si es necesario)
        const shouldFetchDonations = !!selectedCampaign || (selectedTitles.length > 0 && formTitles.length > 0);

        if (shouldFetchDonations) {
            try {
                const dedupTitles = Array.from(new Set(selectedTitles));
                const hasCampaign = !!selectedCampaign;
                const hasSubset = hasCampaign && dedupTitles.length > 0 && formTitles.length > 0 && dedupTitles.length < totalTitles;
                const usePost = hasCampaign && hasSubset;

                let donationsRes: { data: PaginatedDonationsResponse };

                 const commonParams = {
                    start_date: startDate ? startDate.format('YYYY-MM-DD') : undefined,
                    end_date: endDate ? endDate.format('YYYY-MM-DD') : undefined,
                    page_size: DONATIONS_PAGE_SIZE,
                    offset: 0 // <-- Siempre 0 para la primera carga
                 };

                 if (usePost) {
                     const payload = {
                         form_title_ids: dedupTitles,
                         ...commonParams
                     };
                     donationsRes = await apiClient.post<PaginatedDonationsResponse>(
                         '/form-titles/donations',
                         JSON.stringify(payload),
                         {
                             signal: donationsController.signal,
                             headers: { 'Content-Type': 'application/json' },
                             transformRequest: [(data) => data],
                         }
                     );
                 } else if (hasCampaign) {
                     const campaignReportUrl = `/campaigns/${selectedCampaign}/donations`;
                     donationsRes = await apiClient.get<PaginatedDonationsResponse>(campaignReportUrl, {
                         params: commonParams,
                         signal: donationsController.signal
                     });
                 } else {
                     // Lógica para fuente completa si se implementa
                     console.warn("Attempting to fetch donations without campaign - adjust logic if needed for source-level.");
                     // Si no se maneja, limpia el estado de donaciones
                      setDonations([]);
                      setTotalDonationsCount(0);
                      setCurrentOffset(0);
                      setHasMoreDonations(false);
                      if (!isSilent) setLoading(prev => ({ ...prev, donations: false })); // Asegura quitar loading
                      inFlightDonations.current = null;
                      return; // Salir si no hay lógica para fuente
                 }


                const { donations: firstPageDonations, total_count } = donationsRes.data;

                setDonations(firstPageDonations); // <-- Establece la primera página
                const nextOffset = firstPageDonations.length;
                setCurrentOffset(nextOffset); // <-- Establece el offset para la *siguiente* carga
                setHasMoreDonations(nextOffset < total_count); // <-- Hay más si cargamos menos que el total
                setTotalDonationsCount(total_count); // <-- Guardar el total


            } catch (err: any) {
                 if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
                 setError(prev => prev || 'Failed to load initial donations.');
                 setDonations([]); // Limpiar en caso de error
                 setTotalDonationsCount(0);
                 setCurrentOffset(0);
                 setHasMoreDonations(false);
            } finally {
                if (inFlightDonations.current === donationsController) {
                    if (!isSilent) setLoading(prev => ({ ...prev, donations: false }));
                    inFlightDonations.current = null;
                }
            }
        } else {
             // Si no debemos cargar donaciones (ej. solo fuente seleccionada sin lógica específica)
             setDonations([]);
             setTotalDonationsCount(0);
             setCurrentOffset(0);
             setHasMoreDonations(false);
             if (!isSilent) setLoading(prev => ({ ...prev, donations: false })); // Asegura quitar loading
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
            if (inFlightStats.current) inFlightStats.current.abort();
            if (inFlightDonations.current) inFlightDonations.current.abort();
        };
    }, [subscribe, fetchData]);

    // PAGINACIÓN: useEffect para configurar el IntersectionObserver
    useEffect(() => {
        // Captura la referencia actual del contenedor de la tabla
        const currentTableContainer = tableContainerRef.current;
        if (!currentTableContainer) return; // Salir si el contenedor aún no existe

        const options = {
            root: currentTableContainer, // <-- 3. USA EL CONTENEDOR COMO RAÍZ
            rootMargin: '0px',
            threshold: 0.1 // Trigger cuando el elemento esté completamente visible DENTRO DEL CONTENEDOR
        };

        const callback = (entries: IntersectionObserverEntry[]) => {
            const target = entries[0];
    // DETAILED LOG
            console.log("Observer callback:", {
                isIntersecting: target.isIntersecting,
                isLoadingMore: isLoadingMore, // Check loading state
                hasMore: hasMoreDonations   // Check if it thinks there's more
            });
            if (target.isIntersecting && !isLoadingMore && hasMoreDonations) {
                console.log("%c--> Triggering fetchMoreDonations", "color: green; font-weight: bold;"); // Make it stand out
                fetchMoreDonations();
            }
        };

        scrollObserver.current = new IntersectionObserver(callback, options);

        const currentLoadMoreRef = loadMoreRef.current; // Capturar el ref actual
        if (currentLoadMoreRef) {
            scrollObserver.current.observe(currentLoadMoreRef);
        }

        // Limpieza
        return () => {
            if (scrollObserver.current && currentLoadMoreRef) {
                scrollObserver.current.unobserve(currentLoadMoreRef);
            }
        };
    }, [fetchMoreDonations, isLoadingMore, hasMoreDonations]); // Asegúrate de incluir dependencias


    const handleClearAllFilters = () => {
        // ... (sin cambios)
        setSelectedSource('');
        setSelectedCampaign('');
        setSelectedTitles([]);
        setCampaigns([]);
        setFormTitles([]);
        setStartDate(null);
        setEndDate(null);
        setAnalyticsStats(null); // Limpiar stats
        setDonations([]); // Limpiar donaciones
        setTotalDonationsCount(0);
        setCurrentOffset(0);
        setHasMoreDonations(false);
        setError('');
    };

    const handleClearCampaign = () => { setSelectedCampaign(''); /* No limpiar donaciones aquí, fetchData lo hará */ };
    const handleClearDates = () => { setStartDate(null); setEndDate(null); /* No limpiar donaciones aquí */ };

    // --- Variables para Renderizado (Usar nuevos estados) ---
    const stats = analyticsStats; // Usar el estado de stats
    const totalAmount = stats?.total_amount ?? 0;
    const totalCount = stats?.total_count ?? 0;
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
                            {/* --- MODIFIED section --- */}
                            <Box sx={{ mt: 4 }}>
    {/* Muestra spinner inicial SOLO si se espera cargar donaciones detalladas Y AÚN NO HAY */}
    {loading.donations && donations.length === 0 && (selectedCampaign || selectedTitles.length > 0) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
    )}

    {/* Muestra Título y Contenedor SIEMPRE que se haya SELECCIONADO algo para buscar donaciones */}
    {(selectedCampaign || selectedTitles.length > 0) && !loading.stats && ( // Puedes ajustar esta condición si prefieres mostrarlo siempre
        <>
            {/* Mostramos el título solo si hay donaciones o si ya terminó de cargar y no encontró */}
            {(donations.length > 0 || totalDonationsCount > 0 || !loading.donations) && (
                 <Typography variant="h5" gutterBottom>Donors ({totalDonationsCount} Total)</Typography>
            )}
             <Divider sx={{ mb: 2 }} />

            {/* 👇 TableContainer SIEMPRE RENDERIZADO (si aplica la búsqueda) para que la ref exista */}
            <TableContainer ref={tableContainerRef} component={Paper} variant="outlined" sx={{ maxHeight: 600, overflow: 'auto' }}>
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
                        {/* El mapeo de donaciones SÍ puede estar vacío o no */}
                        {donations.map(d => (
                            <TableRow key={d.id} hover>
                                <TableCell>{d.donorName}</TableCell>
                                <TableCell>{d.donorEmail}</TableCell>
                                <TableCell>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                                <TableCell align="right">${d.amount.toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                        {/* 👇 Fila sentinela SIEMPRE RENDERIZADA (dentro del tbody) para que la ref exista */}
                        <TableRow ref={loadMoreRef} sx={{ height: '1px', padding: 0, border: 'none', visibility: hasMoreDonations ? 'visible' : 'hidden' }}>
                           <TableCell colSpan={4} sx={{ padding: 0, border: 'none', textAlign: 'center' }}>
                               {/* El spinner solo se ve si está cargando */}
                               {isLoadingMore && <CircularProgress size={24} sx={{ my: 1}} />}
                           </TableCell>
                       </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    )}

    {/* Muestra "No donations found" (condición sin cambios) */}
    {!loading.donations && (selectedCampaign || selectedTitles.length > 0) && donations.length === 0 && totalDonationsCount === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
            No donations found for the selected criteria.
        </Typography>
    )}
</Box>
                            {/* ... Rest of the component ... */}
                            {/* --- NUEVA TABLA DETALLADA --- */}
                            {chartData && chartData.length > 0 && (
                                <Paper variant="outlined" sx={{ width: '100%', mt: 4 }}>
                                    <Typography variant="h6" sx={{ p: 2 }}>Form Titles</Typography>
                                    <TableContainer>
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Form Title</TableCell>
                                                    <TableCell>Start Date</TableCell>
                                                    <TableCell align="right">Donations</TableCell>
                                                    <TableCell align="right">Amount Raised</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {chartData.map((item) => (
                                                    <TableRow key={item.id} hover>
                                                        <TableCell component="th" scope="row">{item.name}</TableCell>
                                                        <TableCell>
                                                            {item.start_date ? dayjs(item.start_date).format('DD/MM/YYYY') : 'N/A'}
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
