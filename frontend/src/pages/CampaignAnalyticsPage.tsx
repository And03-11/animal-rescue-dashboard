// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Chip, Stack, alpha, Card, CardContent, Grid
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import FilterListIcon from '@mui/icons-material/FilterList';
import BarChartIcon from '@mui/icons-material/BarChart';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useWebSocket } from '../context/WebSocketProvider';
import { FormTitleSelector } from '../components/FormTitleSelector';

interface ApiListItem {
    id: string;
    name: string;
    createdTime?: string;
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
        start_date?: string;
    }[];
}

interface PaginatedDonationsResponse {
    donations: Donation[];
    total_count: number;
}

const DONATIONS_PAGE_SIZE = 50;

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

export const CampaignAnalyticsPage: React.FC = () => {
    const theme = useTheme();
    const { subscribe } = useWebSocket();
    const scrollObserver = useRef<IntersectionObserver | null>(null);
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
    const [donations, setDonations] = useState<Donation[]>([]);
    const [totalDonationsCount, setTotalDonationsCount] = useState(0);
    const [currentOffset, setCurrentOffset] = useState(0);
    const [hasMoreDonations, setHasMoreDonations] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const [loading, setLoading] = useState({ initial: true, stats: false, donations: false, dependent: false });
    const [error, setError] = useState('');

    const inFlightStats = useRef<AbortController | null>(null);
    const inFlightDonations = useRef<AbortController | null>(null);
    const wsDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const normalizeFormTitles = (data: any): ApiListItem[] => {
        if (!Array.isArray(data)) return [];
        const mapped = data
            .map((t: any) => ({
                id: t?.id ?? t?.form_title_id ?? t?.value ?? t?.key ?? '',
                name: t?.name ?? t?.title ?? t?.label ?? t?.form_title_name ?? '(Untitled)',
                createdTime: t?.createdTime,
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
                const sortedCampaigns = res.data.sort((a, b) => {
                    if (!a.createdTime || !b.createdTime) return 0;
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
                normalized.sort((a, b) => {
                    if (!a.createdTime || !b.createdTime) return 0;
                    return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
                });
                setFormTitles(normalized);
            })
            .catch(async (err) => {
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
        if (isLoadingMore || !hasMoreDonations || !selectedSource) return;

        setIsLoadingMore(true);
        if (inFlightDonations.current) inFlightDonations.current.abort();
        const controller = new AbortController();
        inFlightDonations.current = controller;

        try {
            const dedupTitles = Array.from(new Set(selectedTitles));
            const hasCampaign = !!selectedCampaign;
            const currentFormTitles = formTitles;
            const totalTitles = currentFormTitles.length;
            const hasSubset = hasCampaign && dedupTitles.length > 0 && totalTitles > 0 && dedupTitles.length < totalTitles;
            const usePost = hasCampaign && hasSubset;

            let donationsRes: { data: PaginatedDonationsResponse };

            const commonParams = {
                start_date: startDate ? startDate.format('YYYY-MM-DD') : undefined,
                end_date: endDate ? endDate.format('YYYY-MM-DD') : undefined,
                page_size: DONATIONS_PAGE_SIZE,
                offset: currentOffset
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
                const campaignReportUrl = `/campaigns/${selectedCampaign}/donations`;
                donationsRes = await apiClient.get<PaginatedDonationsResponse>(campaignReportUrl, {
                    params: commonParams,
                    signal: controller.signal
                });
            } else {
                setIsLoadingMore(false);
                return;
            }

            const { donations: newDonations, total_count } = donationsRes.data;
            const nextOffset = currentOffset + newDonations.length;

            setDonations(prev => [...prev, ...newDonations]);
            setCurrentOffset(nextOffset);
            setHasMoreDonations(nextOffset < total_count);
            setTotalDonationsCount(total_count);

        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            setError(prev => prev || 'Failed to load more donations.');
        } finally {
            if (inFlightDonations.current === controller) {
                setIsLoadingMore(false);
                inFlightDonations.current = null;
            }
        }
    }, [isLoadingMore, hasMoreDonations, selectedSource, selectedCampaign, selectedTitles, startDate, endDate, formTitles, currentOffset]);

    const fetchData = useCallback(async (isSilent = false) => {
        if (!selectedSource) {
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
            setLoading(prev => ({ ...prev, stats: true, donations: true }));
            setAnalyticsStats(null); setDonations([]); setTotalDonationsCount(0);
            setCurrentOffset(0); setHasMoreDonations(false);
        }
        setError('');

        const currentFormTitles = formTitles;
        const totalTitles = currentFormTitles.length;
        const dedupTitles = Array.from(new Set(selectedTitles));
        const hasCampaign = !!selectedCampaign;
        const hasSubset = hasCampaign && dedupTitles.length > 0 && totalTitles > 0 && dedupTitles.length < totalTitles;

        // Fetch Stats
        try {
            const statsParams = new URLSearchParams();
            if (startDate) statsParams.append('start_date', startDate.format('YYYY-MM-DD'));
            if (endDate) statsParams.append('end_date', endDate.format('YYYY-MM-DD'));
            if (hasSubset) dedupTitles.forEach(id => statsParams.append('form_title_id', id));

            const statsQuery = statsParams.toString();
            const statsUrl = hasCampaign
                ? `/campaigns/${selectedCampaign}/stats?${statsQuery}`
                : `/campaigns/source/${selectedSource}/stats?${statsQuery}`;

            const statsRes = await apiClient.get(statsUrl, { signal: statsController.signal });
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
            setAnalyticsStats(newStats);

        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            setError(prev => prev || 'Failed to load analytics stats.');
            setAnalyticsStats(null);
        } finally {
            if (inFlightStats.current === statsController) {
                if (!isSilent) setLoading(prev => ({ ...prev, stats: false }));
                inFlightStats.current = null;
            }
        }

        // Fetch First Page of Donations
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
                    offset: 0
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
                    setDonations([]);
                    setTotalDonationsCount(0);
                    setCurrentOffset(0);
                    setHasMoreDonations(false);
                    if (!isSilent) setLoading(prev => ({ ...prev, donations: false }));
                    inFlightDonations.current = null;
                    return;
                }

                const { donations: firstPageDonations, total_count } = donationsRes.data;

                setDonations(firstPageDonations);
                const nextOffset = firstPageDonations.length;
                setCurrentOffset(nextOffset);
                setHasMoreDonations(nextOffset < total_count);
                setTotalDonationsCount(total_count);

            } catch (err: any) {
                if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
                setError(prev => prev || 'Failed to load initial donations.');
                setDonations([]);
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
            setDonations([]);
            setTotalDonationsCount(0);
            setCurrentOffset(0);
            setHasMoreDonations(false);
            if (!isSilent) setLoading(prev => ({ ...prev, donations: false }));
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

    useEffect(() => {
        const currentTableContainer = tableContainerRef.current;
        if (!currentTableContainer) return;

        const options = {
            root: currentTableContainer,
            rootMargin: '0px',
            threshold: 0.1
        };

        const callback = (entries: IntersectionObserverEntry[]) => {
            const target = entries[0];
            if (target.isIntersecting && !isLoadingMore && hasMoreDonations) {
                fetchMoreDonations();
            }
        };

        scrollObserver.current = new IntersectionObserver(callback, options);

        const currentLoadMoreRef = loadMoreRef.current;
        if (currentLoadMoreRef) {
            scrollObserver.current.observe(currentLoadMoreRef);
        }

        return () => {
            if (scrollObserver.current && currentLoadMoreRef) {
                scrollObserver.current.unobserve(currentLoadMoreRef);
            }
        };
    }, [fetchMoreDonations, isLoadingMore, hasMoreDonations]);

    const handleClearAllFilters = () => {
        setSelectedSource('');
        setSelectedCampaign('');
        setSelectedTitles([]);
        setCampaigns([]);
        setFormTitles([]);
        setStartDate(null);
        setEndDate(null);
        setAnalyticsStats(null);
        setDonations([]);
        setTotalDonationsCount(0);
        setCurrentOffset(0);
        setHasMoreDonations(false);
        setError('');
    };

    const handleClearCampaign = () => { setSelectedCampaign(''); };
    const handleClearDates = () => { setStartDate(null); setEndDate(null); };

    const stats = analyticsStats;
    const totalAmount = stats?.total_amount ?? 0;
    const totalCount = stats?.total_count ?? 0;
    const chartData = stats?.breakdown;

    // Generate gradient colors for chart bars
    const getBarColor = (index: number, total: number) => {
        const hue = (index / total) * 360;
        return `hsl(${hue}, 70%, 60%)`;
    };

    return (
        <Box
            component={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            sx={{ width: '100%', maxWidth: '1600px', mx: 'auto', p: { xs: 2, md: 4 } }}
        >
            {/* Modern Header */}
            <Box
                sx={{
                    mb: 4,
                    p: 4,
                    borderRadius: '20px',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    boxShadow: theme.shadows[4]
                }}
            >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                    <Typography
                        variant="h3"
                        component={motion.h1}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        sx={{
                            fontWeight: 800,
                            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            mb: 1,
                            textShadow: '0 2px 10px rgba(0,0,0,0.1)'
                        }}
                    >
                        Campaign Analytics
                    </Typography>
                    <Typography
                        variant="h6"
                        component={motion.p}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        sx={{
                            color: theme.palette.text.secondary,
                            fontWeight: 500,
                            maxWidth: '600px',
                            mb: 3
                        }}
                    >
                        Deep insights into your fundraising campaigns
                    </Typography>

                    {/* Quick Stats in Header */}
                    {stats && (
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <motion.div variants={itemVariants}>
                                    <Card
                                        sx={{
                                            background: alpha(theme.palette.background.paper, 0.15),
                                            backdropFilter: 'blur(10px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                                        }}
                                    >
                                        <CardContent sx={{ p: 2 }}>
                                            <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.8) }}>
                                                Total Raised
                                            </Typography>
                                            <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700 }}>
                                                ${totalAmount.toFixed(2)}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <motion.div variants={itemVariants}>
                                    <Card
                                        sx={{
                                            background: alpha(theme.palette.background.paper, 0.15),
                                            backdropFilter: 'blur(10px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                                        }}
                                    >
                                        <CardContent sx={{ p: 2 }}>
                                            <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.8) }}>
                                                Donations
                                            </Typography>
                                            <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700 }}>
                                                {totalCount}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <motion.div variants={itemVariants}>
                                    <Card
                                        sx={{
                                            background: alpha(theme.palette.background.paper, 0.15),
                                            backdropFilter: 'blur(10px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                                        }}
                                    >
                                        <CardContent sx={{ p: 2 }}>
                                            <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.8) }}>
                                                Avg. Donation
                                            </Typography>
                                            <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700 }}>
                                                ${totalCount > 0 ? (totalAmount / totalCount).toFixed(2) : '0.00'}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <motion.div variants={itemVariants}>
                                    <Card
                                        sx={{
                                            background: alpha(theme.palette.background.paper, 0.15),
                                            backdropFilter: 'blur(10px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                                        }}
                                    >
                                        <CardContent sx={{ p: 2 }}>
                                            <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.8) }}>
                                                Emails
                                            </Typography>
                                            <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700 }}>
                                                {chartData?.length ?? 0}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                        </Grid>
                    )}
                </Box>
            </Box>

            <Grid container spacing={3}>
                {/* Control Panel */}
                <Grid size={{ xs: 12, lg: 4 }}>
                    <motion.div variants={itemVariants}>
                        <Paper
                            sx={{
                                p: 4,
                                position: 'sticky',
                                top: '24px',
                                background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.6)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                                backdropFilter: 'blur(20px)',
                                border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                                borderRadius: '24px',
                                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                                overflow: 'hidden'
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                                <Box
                                    sx={{
                                        p: 1,
                                        borderRadius: '12px',
                                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)} 0%, ${alpha(theme.palette.primary.main, 0.1)} 100%)`,
                                        display: 'flex'
                                    }}
                                >
                                    <FilterListIcon sx={{ color: theme.palette.primary.main }} />
                                </Box>
                                <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px' }}>
                                    CONTROL PANEL
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <FormControl fullWidth variant="filled">
                                    <InputLabel sx={{ color: alpha(theme.palette.text.primary, 0.7) }}>1. Select Source</InputLabel>
                                    <Select
                                        value={selectedSource}
                                        onChange={e => setSelectedSource(e.target.value)}
                                        disabled={loading.initial}
                                        disableUnderline
                                        sx={{
                                            borderRadius: '16px',
                                            backgroundColor: alpha(theme.palette.background.default, 0.3),
                                            border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                borderColor: alpha(theme.palette.primary.main, 0.3),
                                            },
                                            '&.Mui-focused': {
                                                backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                borderColor: theme.palette.primary.main,
                                                boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`
                                            },
                                            '& .MuiSelect-icon': { color: theme.palette.primary.main }
                                        }}
                                    >
                                        {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                    </Select>
                                </FormControl>

                                <Collapse in={!!selectedSource} timeout="auto" sx={{ width: '100%' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <FormControl fullWidth disabled={!selectedSource || loading.dependent} variant="filled">
                                            <InputLabel sx={{ color: alpha(theme.palette.text.primary, 0.7) }}>2. Drill Down by Campaign (Optional)</InputLabel>
                                            <Select
                                                value={selectedCampaign}
                                                onChange={e => setSelectedCampaign(e.target.value)}
                                                disableUnderline
                                                sx={{
                                                    borderRadius: '16px',
                                                    backgroundColor: alpha(theme.palette.background.default, 0.3),
                                                    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                                                    transition: 'all 0.3s ease',
                                                    '&:hover': {
                                                        backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                        borderColor: alpha(theme.palette.primary.main, 0.3),
                                                    },
                                                    '&.Mui-focused': {
                                                        backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                        borderColor: theme.palette.primary.main,
                                                        boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`
                                                    },
                                                    '& .MuiSelect-icon': { color: theme.palette.primary.main }
                                                }}
                                            >
                                                <MenuItem value=""><em>-- View All Campaigns in Source --</em></MenuItem>
                                                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                            </Select>
                                        </FormControl>

                                        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                                            <DatePicker
                                                label="Start Date"
                                                value={startDate}
                                                onChange={setStartDate}
                                                disabled={!selectedSource}
                                                slotProps={{
                                                    textField: {
                                                        fullWidth: true,
                                                        variant: 'filled',
                                                        InputProps: { disableUnderline: true },
                                                        sx: {
                                                            '& .MuiFilledInput-root': {
                                                                borderRadius: '16px',
                                                                backgroundColor: alpha(theme.palette.background.default, 0.3),
                                                                border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                                                                transition: 'all 0.3s ease',
                                                                '&:hover': {
                                                                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                                    borderColor: alpha(theme.palette.primary.main, 0.3),
                                                                },
                                                                '&.Mui-focused': {
                                                                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                                    borderColor: theme.palette.primary.main,
                                                                    boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`
                                                                }
                                                            },
                                                            '& .MuiInputLabel-root': { color: alpha(theme.palette.text.primary, 0.7) },
                                                            '& .MuiSvgIcon-root': { color: theme.palette.primary.main }
                                                        }
                                                    }
                                                }}
                                            />
                                            <DatePicker
                                                label="End Date"
                                                value={endDate}
                                                onChange={setEndDate}
                                                disabled={!selectedSource}
                                                slotProps={{
                                                    textField: {
                                                        fullWidth: true,
                                                        variant: 'filled',
                                                        InputProps: { disableUnderline: true },
                                                        sx: {
                                                            '& .MuiFilledInput-root': {
                                                                borderRadius: '16px',
                                                                backgroundColor: alpha(theme.palette.background.default, 0.3),
                                                                border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                                                                transition: 'all 0.3s ease',
                                                                '&:hover': {
                                                                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                                    borderColor: alpha(theme.palette.primary.main, 0.3),
                                                                },
                                                                '&.Mui-focused': {
                                                                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                                                                    borderColor: theme.palette.primary.main,
                                                                    boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`
                                                                }
                                                            },
                                                            '& .MuiInputLabel-root': { color: alpha(theme.palette.text.primary, 0.7) },
                                                            '& .MuiSvgIcon-root': { color: theme.palette.primary.main }
                                                        }
                                                    }
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                </Collapse>

                                <Collapse in={!!selectedCampaign} timeout="auto" unmountOnExit>
                                    <Divider sx={{ my: 2, borderColor: alpha(theme.palette.common.white, 0.1) }}>
                                        <Chip
                                            label="Detailed Report"
                                            icon={<TuneIcon sx={{ fontSize: '16px !important' }} />}
                                            sx={{
                                                background: alpha(theme.palette.background.default, 0.5),
                                                backdropFilter: 'blur(10px)',
                                                border: `1px solid ${alpha(theme.palette.common.white, 0.1)}`
                                            }}
                                        />
                                    </Divider>
                                    <FormTitleSelector
                                        key={selectorKey}
                                        titles={formTitles}
                                        onSelectionChange={setSelectedTitles}
                                        isLoading={loading.dependent}
                                    />
                                </Collapse>

                                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Button
                                        variant="contained"
                                        onClick={handleApplyFilters}
                                        disabled={!selectedSource || loading.stats}
                                        fullWidth
                                        sx={{
                                            py: 1.5,
                                            borderRadius: '12px',
                                            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                                            boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
                                            fontSize: '1rem',
                                            fontWeight: 700,
                                            textTransform: 'none',
                                            '&:hover': {
                                                transform: 'translateY(-2px)',
                                                boxShadow: `0 12px 20px ${alpha(theme.palette.primary.main, 0.4)}`,
                                            }
                                        }}
                                    >
                                        Apply Filters
                                    </Button>
                                    <Button
                                        variant="text"
                                        onClick={handleClearAllFilters}
                                        disabled={!selectedSource}
                                        fullWidth
                                        sx={{
                                            color: alpha(theme.palette.text.primary, 0.6),
                                            textTransform: 'none',
                                            '&:hover': {
                                                color: theme.palette.error.main,
                                                background: alpha(theme.palette.error.main, 0.1)
                                            }
                                        }}
                                    >
                                        Clear All Filters
                                    </Button>
                                </Box>
                            </Box>
                        </Paper>
                    </motion.div>
                </Grid>

                {/* Results Panel */}
                <Grid size={{ xs: 12, lg: 8 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {loading.stats ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                            <CircularProgress />
                        </Box>
                    ) : !stats ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.4 }}
                        >
                            <Paper
                                sx={{
                                    p: 6,
                                    height: '100%',
                                    minHeight: 500,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.4)} 0%, ${alpha(theme.palette.background.paper, 0.1)} 100%)`,
                                    backdropFilter: 'blur(10px)',
                                    border: `1px dashed ${alpha(theme.palette.text.primary, 0.1)}`,
                                    borderRadius: '24px',
                                    textAlign: 'center'
                                }}
                            >
                                <Box
                                    sx={{
                                        mb: 4,
                                        p: 3,
                                        borderRadius: '50%',
                                        background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.2)} 0%, transparent 70%)`
                                    }}
                                >
                                    <BarChartIcon sx={{ fontSize: 80, color: alpha(theme.palette.text.primary, 0.2) }} />
                                </Box>
                                <Typography variant="h4" fontWeight="700" gutterBottom sx={{ color: alpha(theme.palette.text.primary, 0.8) }}>
                                    Ready to Analyze
                                </Typography>
                                <Typography variant="body1" sx={{ color: alpha(theme.palette.text.primary, 0.5), maxWidth: 400, mb: 4 }}>
                                    Select a source from the control panel to generate detailed insights, visualize trends, and track campaign performance.
                                </Typography>

                                {/* Skeleton Preview */}
                                <Box sx={{ width: '100%', maxWidth: 500, opacity: 0.3 }}>
                                    <Box sx={{ display: 'flex', gap: 2, mb: 2, justifyContent: 'center' }}>
                                        <Box sx={{ width: 60, height: 100, bgcolor: theme.palette.primary.main, borderRadius: '8px 8px 0 0' }} />
                                        <Box sx={{ width: 60, height: 160, bgcolor: theme.palette.secondary.main, borderRadius: '8px 8px 0 0' }} />
                                        <Box sx={{ width: 60, height: 80, bgcolor: theme.palette.primary.main, borderRadius: '8px 8px 0 0' }} />
                                        <Box sx={{ width: 60, height: 120, bgcolor: theme.palette.secondary.main, borderRadius: '8px 8px 0 0' }} />
                                    </Box>
                                    <Box sx={{ height: 4, bgcolor: alpha(theme.palette.text.primary, 0.1), borderRadius: 2 }} />
                                </Box>
                            </Paper>
                        </motion.div>
                    ) : (
                        <motion.div variants={itemVariants}>
                            {/* Chart */}
                            {chartData && chartData.length > 0 && (
                                <Paper
                                    sx={{
                                        width: '100%',
                                        p: 3,
                                        borderRadius: '16px',
                                        background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                                        backdropFilter: 'blur(20px)',
                                        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                        boxShadow: theme.shadows[8]
                                    }}
                                >
                                    <Typography variant="h6" gutterBottom fontWeight="700">
                                        {selectedCampaign ? 'Revenue by Form Title' : 'Revenue by Campaign'}
                                    </Typography>
                                    <ResponsiveContainer width="100%" height={562}>
                                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 120 }}>
                                            <defs>
                                                {chartData.map((_, index) => (
                                                    <linearGradient key={index} id={`colorGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={getBarColor(index, chartData.length)} stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor={getBarColor(index, chartData.length)} stopOpacity={0.3} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.secondary, 0.1)} />
                                            <XAxis
                                                dataKey="name"
                                                angle={-45}
                                                textAnchor="end"
                                                interval={0}
                                                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                            />
                                            <YAxis
                                                tickFormatter={(tick) => `$${tick.toLocaleString()}`}
                                                tick={{ fill: theme.palette.text.secondary }}
                                            />
                                            <Tooltip
                                                formatter={(value: number) => [`$${Number(value).toFixed(2)}`, 'Amount']}
                                                contentStyle={{
                                                    backgroundColor: alpha(theme.palette.background.paper, 0.95),
                                                    border: `1px solid ${theme.palette.divider}`,
                                                    borderRadius: '8px',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                                cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }}
                                            />
                                            <Bar dataKey="total_amount" name="Amount" radius={[8, 8, 0, 0]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={`url(#colorGradient${index})`} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Paper>
                            )}
                        </motion.div>
                    )}
                </Grid>
            </Grid>

            {/* Bottom Section: Detailed Data Tables - Full Width */}
            {stats && (
                <Grid container spacing={3} sx={{ mt: 1 }}>
                    {/* Donations Table */}
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <AnimatePresence>
                            {(selectedCampaign || selectedTitles.length > 0) && !loading.stats && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <Paper
                                        sx={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '16px',
                                            background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                                            backdropFilter: 'blur(20px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                            boxShadow: theme.shadows[4],
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column'
                                        }}
                                    >
                                        <Box sx={{ p: 3, pb: 2 }}>
                                            {loading.donations && donations.length === 0 ? (
                                                <CircularProgress size={24} />
                                            ) : (
                                                <Typography variant="h6" fontWeight="700">
                                                    Donors {totalDonationsCount > 0 && `(${totalDonationsCount})`}
                                                </Typography>
                                            )}
                                        </Box>

                                        <TableContainer ref={tableContainerRef} sx={{ maxHeight: 600, flexGrow: 1 }}>
                                            <Table stickyHeader size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Donor</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Amount</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Date</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper, minWidth: 200 }}>Email</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {donations.map((d, index) => (
                                                        <TableRow
                                                            key={d.id}
                                                            hover
                                                            sx={{
                                                                '&:nth-of-type(odd)': {
                                                                    backgroundColor: alpha(theme.palette.action.hover, 0.02),
                                                                },
                                                            }}
                                                        >
                                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{d.donorName}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600, color: theme.palette.success.main, whiteSpace: 'nowrap' }}>${d.amount.toFixed(2)}</TableCell>
                                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                                                            <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.donorEmail}>{d.donorEmail}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    <TableRow
                                                        ref={loadMoreRef}
                                                        sx={{
                                                            height: '1px',
                                                            padding: 0,
                                                            border: 'none',
                                                            visibility: hasMoreDonations ? 'visible' : 'hidden'
                                                        }}
                                                    >
                                                        <TableCell colSpan={4} sx={{ padding: 0, border: 'none', textAlign: 'center' }}>
                                                            {isLoadingMore && <CircularProgress size={24} sx={{ my: 1 }} />}
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </TableContainer>

                                        {!loading.donations && donations.length === 0 && totalDonationsCount === 0 && (
                                            <Box sx={{ p: 4, textAlign: 'center' }}>
                                                <Typography color="text.secondary">
                                                    No donations found for the selected criteria.
                                                </Typography>
                                            </Box>
                                        )}
                                    </Paper>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Grid>

                    {/* Form Titles Table */}
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <AnimatePresence>
                            {chartData && chartData.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                >
                                    <Paper
                                        sx={{
                                            width: '100%',
                                            borderRadius: '16px',
                                            background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                                            backdropFilter: 'blur(20px)',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                            boxShadow: theme.shadows[4],
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <Typography variant="h6" sx={{ p: 3, fontWeight: 700 }}>Form Titles</Typography>
                                        <TableContainer sx={{ maxHeight: 600 }}>
                                            <Table stickyHeader size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Form Title</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Start Date</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Donations</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Amount Raised</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {chartData.map((item, index) => (
                                                        <TableRow
                                                            key={item.id}
                                                            hover
                                                            sx={{
                                                                '&:nth-of-type(odd)': {
                                                                    backgroundColor: alpha(theme.palette.action.hover, 0.02),
                                                                },
                                                            }}
                                                        >
                                                            <TableCell component="th" scope="row">{item.name}</TableCell>
                                                            <TableCell>
                                                                {item.start_date ? dayjs(item.start_date).format('DD/MM/YYYY') : 'N/A'}
                                                            </TableCell>
                                                            <TableCell align="right">{item.donation_count}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 'bold', color: theme.palette.success.main }}>
                                                                ${item.total_amount.toFixed(2)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Paper>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default CampaignAnalyticsPage;
