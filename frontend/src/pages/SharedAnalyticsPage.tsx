import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, useTheme, alpha, Grid
} from '@mui/material';
import { motion } from 'framer-motion';

import apiClient from '../api/axiosConfig';
import { DonationsTable } from '../components/analytics/DonationsTable';
import { useWebSocket } from '../context/WebSocketProvider';


interface SharedViewConfig {
    source: string;
    source_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    form_title_id?: string;
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
        transition: { staggerChildren: 0.1 }
    }
};

const SharedAnalyticsPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const theme = useTheme();
    const { subscribe } = useWebSocket();

    const [config, setConfig] = useState<SharedViewConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Data states
    const [stats, setStats] = useState<AnalyticsStats | null>(null);
    const [donations, setDonations] = useState<Donation[]>([]);
    const [totalDonationsCount, setTotalDonationsCount] = useState(0);
    const [currentOffset, setCurrentOffset] = useState(0);
    const [hasMoreDonations, setHasMoreDonations] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Refs
    const scrollObserver = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const inFlightStats = useRef<AbortController | null>(null);
    const inFlightDonations = useRef<AbortController | null>(null);

    // 1. Fetch Configuration
    useEffect(() => {
        if (!token) {
            setError('Invalid link.');
            setLoading(false);
            return;
        }

        apiClient.get<any>(`/analytics/share/${token}`)
            .then(res => {
                // Normalize config from backend format to frontend format
                const rawConfig = res.data;

                // Only filter by form_title if exactly ONE is specified
                // If multiple form titles in array, it means "All Form Titles" was selected
                const formTitles = Array.isArray(rawConfig.form_titles) ? rawConfig.form_titles : [];
                const singleFormTitle = formTitles.length === 1 ? formTitles[0] : undefined;

                const normalizedConfig: SharedViewConfig = {
                    source: rawConfig.source_id || rawConfig.source || '',
                    source_name: rawConfig.source_name || rawConfig.source_id || '',
                    campaign_id: rawConfig.campaign_id,
                    campaign_name: rawConfig.campaign_name || '',
                    form_title_id: singleFormTitle,
                };
                setConfig(normalizedConfig);
            })
            .catch(err => {
                console.error(err);
                setError('Shared view not found or expired.');
            })
            .finally(() => setLoading(false));
    }, [token]);

    // 2. Fetch Data based on Config
    const fetchData = useCallback(async (isSilent = false) => {
        if (!config) return;

        if (inFlightStats.current) inFlightStats.current.abort();
        if (inFlightDonations.current) inFlightDonations.current.abort();

        const statsController = new AbortController();
        const donationsController = new AbortController();
        inFlightStats.current = statsController;
        inFlightDonations.current = donationsController;

        if (!isSilent) {
            setStats(null); setDonations([]); setTotalDonationsCount(0);
            setCurrentOffset(0); setHasMoreDonations(false);
        }

        try {
            // --- Fetch Stats ---
            const statsParams = new URLSearchParams();
            if (config.form_title_id) statsParams.append('form_title_id', config.form_title_id);

            const statsUrl = config.campaign_id
                ? `/campaigns/${config.campaign_id}/stats?${statsParams.toString()}`
                : `/campaigns/source/${config.source}/stats?${statsParams.toString()}`;

            const statsRes = await apiClient.get(statsUrl, { signal: statsController.signal });

            // Normalize stats data
            const rawBreakdown = statsRes.data?.stats_by_campaign ?? statsRes.data?.stats_by_form_title ?? [];
            const breakdown = Array.isArray(rawBreakdown) ? rawBreakdown.map((item: any) => ({
                id: item?.campaign_id ?? item?.form_title_id ?? '',
                name: item?.campaign_name ?? item?.form_title_name ?? 'Unknown',
                total_amount: typeof item?.total_amount === 'number' ? item.total_amount : 0,
                donation_count: typeof item?.donation_count === 'number' ? item.donation_count : 0,
                start_date: item?.start_date ?? item?.createdTime,
            })) : [];

            setStats({
                total_amount: typeof statsRes.data?.source_total_amount === 'number' ? statsRes.data.source_total_amount :
                    typeof statsRes.data?.campaign_total_amount === 'number' ? statsRes.data.campaign_total_amount : 0,
                total_count: typeof statsRes.data?.source_total_count === 'number' ? statsRes.data.source_total_count :
                    typeof statsRes.data?.campaign_total_count === 'number' ? statsRes.data.campaign_total_count : 0,
                breakdown: breakdown
            });

            // --- Fetch Donations (First Page) ---
            let donationsRes;
            const commonParams = { page_size: DONATIONS_PAGE_SIZE, offset: 0 };

            if (config.campaign_id && config.form_title_id) {
                const payload = {
                    form_title_ids: [config.form_title_id],
                    ...commonParams
                };
                donationsRes = await apiClient.post<PaginatedDonationsResponse>(
                    '/form-titles/donations',
                    JSON.stringify(payload),
                    {
                        signal: donationsController.signal,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            } else if (config.campaign_id) {
                donationsRes = await apiClient.get<PaginatedDonationsResponse>(
                    `/campaigns/${config.campaign_id}/donations`,
                    { params: commonParams, signal: donationsController.signal }
                );
            } else {
                donationsRes = await apiClient.get<PaginatedDonationsResponse>(
                    `/campaigns/source/${config.source}/donations`,
                    { params: commonParams, signal: donationsController.signal }
                );
            }

            const { donations: newDonations, total_count } = donationsRes.data;
            setDonations(newDonations);
            setTotalDonationsCount(total_count);
            setCurrentOffset(newDonations.length);
            setHasMoreDonations(newDonations.length < total_count);

        } catch (err: any) {
            if (err?.name === 'CanceledError') return;
            console.error(err);
        }
    }, [config]);

    // Initial Fetch
    useEffect(() => {
        if (config) {
            fetchData();
        }
    }, [config, fetchData]);

    // WebSocket Updates
    useEffect(() => {
        const unsubscribe = subscribe('new_donation', () => {
            setTimeout(() => fetchData(true), 500);
        });
        return () => unsubscribe();
    }, [subscribe, fetchData]);

    // Infinite Scroll
    const fetchMoreDonations = useCallback(async () => {
        if (isLoadingMore || !hasMoreDonations || !config) return;
        setIsLoadingMore(true);

        try {
            const commonParams = { page_size: DONATIONS_PAGE_SIZE, offset: currentOffset };
            let donationsRes;

            if (config.campaign_id && config.form_title_id) {
                const payload = {
                    form_title_ids: [config.form_title_id],
                    ...commonParams
                };
                donationsRes = await apiClient.post<PaginatedDonationsResponse>(
                    '/form-titles/donations',
                    JSON.stringify(payload),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            } else if (config.campaign_id) {
                donationsRes = await apiClient.get<PaginatedDonationsResponse>(
                    `/campaigns/${config.campaign_id}/donations`,
                    { params: commonParams }
                );
            } else {
                donationsRes = await apiClient.get<PaginatedDonationsResponse>(
                    `/campaigns/source/${config.source}/donations`,
                    { params: commonParams }
                );
            }

            const { donations: newDonations, total_count } = donationsRes.data;
            setDonations(prev => [...prev, ...newDonations]);
            setCurrentOffset(prev => prev + newDonations.length);
            setHasMoreDonations(currentOffset + newDonations.length < total_count);
            setTotalDonationsCount(total_count);

        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMoreDonations, config, currentOffset]);

    useEffect(() => {
        const currentTableContainer = tableContainerRef.current;
        if (!currentTableContainer) return;

        const options = { root: currentTableContainer, threshold: 0.1 };
        const callback = (entries: IntersectionObserverEntry[]) => {
            if (entries[0].isIntersecting && !isLoadingMore && hasMoreDonations) {
                fetchMoreDonations();
            }
        };

        scrollObserver.current = new IntersectionObserver(callback, options);
        if (loadMoreRef.current) scrollObserver.current.observe(loadMoreRef.current);

        return () => scrollObserver.current?.disconnect();
    }, [fetchMoreDonations, isLoadingMore, hasMoreDonations]);


    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 4 }}>
                <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>{error}</Alert>
            </Box>
        );
    }

    return (
        <Box
            component={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            sx={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                bgcolor: 'background.default'
            }}
        >
            <Grid container sx={{ height: '100%' }}>
                {/* Left Panel: Summary & Creative Chart */}
                <Grid
                    size={{ xs: 12, md: 4, lg: 3 }}
                    sx={{
                        height: '100%',
                        bgcolor: alpha(theme.palette.background.paper, 0.5),
                        backdropFilter: 'blur(20px)',
                        borderRight: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        zIndex: 10
                    }}
                >
                    <Box sx={{ p: 4, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        {/* Header */}
                        <Box sx={{ mb: 2 }}>
                            <Typography
                                variant="overline"
                                sx={{
                                    color: theme.palette.primary.main,
                                    fontWeight: 700,
                                    letterSpacing: 2,
                                    fontSize: '0.7rem'
                                }}
                            >
                                CAMPAIGN IMPACT
                            </Typography>
                            {/* Dynamic Header based on filter level */}
                            <Typography
                                variant="h4"
                                fontWeight="800"
                                sx={{
                                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    lineHeight: 1.2
                                }}
                            >
                                {/* Show campaign name if available, otherwise source name */}
                                {config?.campaign_name || config?.source_name || config?.source || 'Analytics'}
                            </Typography>
                            {/* Subtitle showing context */}
                            <Typography
                                variant="h6"
                                sx={{
                                    mt: 0.5,
                                    color: theme.palette.text.secondary,
                                    fontWeight: 500
                                }}
                            >
                                {/* Determine what to show based on filter level */}
                                {config?.form_title_id && stats && stats.breakdown.length === 1
                                    ? stats.breakdown[0].name  // Single form title: show its name
                                    : config?.campaign_id
                                        ? 'All Form Titles'  // Campaign selected but no form title filter
                                        : 'All Campaigns'    // Source only, no campaign filter
                                }
                            </Typography>
                        </Box>

                        {stats && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {/* Hero Stat - Total Raised */}
                                <Box
                                    sx={{
                                        p: 3,
                                        borderRadius: 4,
                                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
                                        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                                    }}
                                >
                                    <Typography variant="overline" sx={{ color: theme.palette.primary.main, fontWeight: 600, letterSpacing: 1.5 }}>
                                        TOTAL RAISED
                                    </Typography>
                                    <Typography
                                        variant="h2"
                                        fontWeight="900"
                                        sx={{
                                            lineHeight: 1,
                                            background: `linear-gradient(90deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent"
                                        }}
                                    >
                                        ${stats.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Typography>
                                </Box>

                                {/* Secondary Stats Row */}
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {/* Total Donors */}
                                    <Box
                                        sx={{
                                            flex: 1,
                                            p: 2.5,
                                            borderRadius: 3,
                                            bgcolor: alpha(theme.palette.background.paper, 0.6),
                                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                            backdropFilter: 'blur(10px)'
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, letterSpacing: 0.5 }}>
                                            Total Donors
                                        </Typography>
                                        <Typography variant="h4" fontWeight="800" sx={{ color: theme.palette.success.main }}>
                                            {stats.total_count}
                                        </Typography>
                                    </Box>

                                    {/* Average Donation */}
                                    <Box
                                        sx={{
                                            flex: 1,
                                            p: 2.5,
                                            borderRadius: 3,
                                            bgcolor: alpha(theme.palette.background.paper, 0.6),
                                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                            backdropFilter: 'blur(10px)'
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, letterSpacing: 0.5 }}>
                                            Avg. Donation
                                        </Typography>
                                        <Typography variant="h4" fontWeight="800" sx={{ color: theme.palette.info.main }}>
                                            ${stats.total_count > 0 ? (stats.total_amount / stats.total_count).toFixed(2) : '0.00'}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Powered by footer */}
                                <Box sx={{ mt: 'auto', pt: 4, borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
                                    <Typography variant="caption" sx={{ color: alpha(theme.palette.text.secondary, 0.5), fontWeight: 500 }}>
                                        Powered by Animal love Rescue Center
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                </Grid>

                {/* Right Panel: Donations List */}
                <Grid size={{ xs: 12, md: 8, lg: 9 }} sx={{ height: '100%', position: 'relative' }}>
                    <DonationsTable
                        donations={donations}
                        totalCount={totalDonationsCount}
                        isLoadingMore={isLoadingMore}
                        hasMore={hasMoreDonations}
                        tableContainerRef={tableContainerRef}
                        loadMoreRef={loadMoreRef}
                        maxHeight="100%"
                        sx={{
                            height: '100%',
                            borderRadius: 0,
                            border: 'none',
                            background: 'transparent',
                            boxShadow: 'none',
                            p: 3, // Add padding to the container instead
                            '& .MuiTableContainer-root': {
                                p: 0 // Remove padding from scroll container
                            }
                        }}
                    />
                </Grid>
            </Grid>
        </Box>
    );
};

export default SharedAnalyticsPage;
