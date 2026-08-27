// frontend/src/pages/CampaignAnalyticsPage.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, Paper, Button, CircularProgress, Alert,
    FormControl, Select, MenuItem,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, alpha, Grid, Card, CardContent,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, InputAdornment, Tabs, Tab,
    ToggleButton, ToggleButtonGroup, Stack
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import BarChartIcon from '@mui/icons-material/BarChart';
import ShareIcon from '@mui/icons-material/Share';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import apiClient from '../api/axiosConfig';
import { useWebSocket } from '../context/webSocketContext';
import { FormTitleSelector } from '../components/FormTitleSelector';
import {
    getErrorMessage,
    getResponseStatus,
    isCanceledRequest,
    normalizeAnalyticsStats,
    normalizeFormTitles,
} from '../features/analytics/normalizers';
import type {
    AnalyticsBreakdownItem,
    AnalyticsListItem as ApiListItem,
    AnalyticsStats,
    AnalyticsStatsResponse,
    Donation,
    PaginatedDonationsResponse,
    ShareLinkPayload,
    ShareLinkResponse,
} from '../types/analytics.types';

const DONATIONS_PAGE_SIZE = 50;
type RevenueChartView = 'top10' | 'all';
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const DNR_SUFFIX_PATTERN = /\s+DNR\s*$/i;
const isDnrTitle = (name: string) => DNR_SUFFIX_PATTERN.test(name);
const getBaseTitle = (name: string) => name.replace(DNR_SUFFIX_PATTERN, '').trim();
const sortNewestFirst = <T extends { createdTime?: string; name: string },>(items: T[]) => (
    [...items].sort((a, b) => {
        const firstTime = a.createdTime ? Date.parse(a.createdTime) : Number.NEGATIVE_INFINITY;
        const secondTime = b.createdTime ? Date.parse(b.createdTime) : Number.NEGATIVE_INFINITY;
        const safeFirstTime = Number.isFinite(firstTime) ? firstTime : Number.NEGATIVE_INFINITY;
        const safeSecondTime = Number.isFinite(secondTime) ? secondTime : Number.NEGATIVE_INFINITY;

        if (safeFirstTime !== safeSecondTime) return safeSecondTime - safeFirstTime;
        return a.name.localeCompare(b.name);
    })
);

const VariantMetricsPanel: React.FC<{
    variant: 'original' | 'dnr';
    item?: AnalyticsBreakdownItem;
}> = ({ variant, item }) => {
    const dnr = variant === 'dnr';

    if (!item) {
        return (
            <Box
                sx={(theme) => ({
                    minHeight: 76,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '12px',
                    border: `1px dashed ${alpha(theme.palette.text.secondary, 0.2)}`,
                    bgcolor: alpha(theme.palette.background.default, 0.12),
                })}
            >
                <Typography variant="caption" color="text.secondary">
                    No DNR variant
                </Typography>
            </Box>
        );
    }

    return (
    <Box
        sx={(theme) => ({
            minHeight: 76,
            display: 'grid',
            gridTemplateColumns: 'minmax(92px, 1fr) minmax(72px, 0.75fr) minmax(104px, 1fr)',
            alignItems: 'center',
            gap: 1.5,
            px: 1.75,
            py: 1.25,
            borderRadius: '12px',
            border: `1px solid ${dnr
                ? alpha(theme.palette.primary.main, 0.24)
                : alpha(theme.palette.divider, 0.92)}`,
            bgcolor: dnr
                ? alpha(theme.palette.primary.main, 0.055)
                : alpha(theme.palette.background.default, 0.18),
        })}
    >
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.35 }}>
                Date
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
                {item.start_date ? dayjs(item.start_date).format('DD/MM/YYYY') : 'N/A'}
            </Typography>
        </Box>
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.35 }}>
                Donations
            </Typography>
            <Typography variant="body2" fontWeight={600}>
                {item.donation_count.toLocaleString('en-US')}
            </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.35 }}>
                Raised
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>
                {currencyFormatter.format(item.total_amount)}
            </Typography>
        </Box>
    </Box>
    );
};

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

const FilterFieldLabel: React.FC<{ label: string; optional?: boolean }> = ({ label, optional }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.9, minWidth: 0 }}>
        <Typography
            component="span"
            variant="body2"
            sx={{ fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
            {label}
        </Typography>
        {optional && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
                Optional
            </Typography>
        )}
    </Box>
);

export const CampaignAnalyticsPage: React.FC = () => {
    const theme = useTheme();
    const reduceMotion = Boolean(useReducedMotion());
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
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [generatedShareUrl, setGeneratedShareUrl] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [detailTab, setDetailTab] = useState(0);
    const [revenueChartView, setRevenueChartView] = useState<RevenueChartView>('top10');

    const handleShareClick = async () => {
        if (!selectedSource) return;
        setIsGeneratingLink(true);
        setError('');
        try {
            // Find source and campaign names for display in shared view
            const sourceName = sources.find(s => s.id === selectedSource)?.name || selectedSource;
            const campaignName = campaigns.find(c => c.id === selectedCampaign)?.name || '';

            const payload: ShareLinkPayload = {
                source_id: selectedSource,
                source_name: sourceName
            };
            if (selectedCampaign) {
                payload.campaign_id = selectedCampaign;
                payload.campaign_name = campaignName;
            }
            if (startDate) payload.start_date = startDate.toISOString();
            if (endDate) payload.end_date = endDate.toISOString();
            if (selectedTitles.length > 0) payload.form_titles = selectedTitles.join(',');

            const response = await apiClient.post<ShareLinkResponse>('/analytics/share-link', payload);
            console.log('Share API Response:', response.data);

            const { share_id } = response.data;
            if (!share_id) {
                throw new Error('Server returned success but no share ID');
            }

            const shareUrl = `${window.location.origin}/shared/${share_id}`;
            setGeneratedShareUrl(shareUrl);
            setShareDialogOpen(true);

            // Try to copy automatically, but don't fail if it doesn't work
            try {
                await navigator.clipboard.writeText(shareUrl);
                setCopySuccess(true);
            } catch {
                console.warn('Auto-copy failed, user can copy manually from dialog');
            }
        } catch (err: unknown) {
            console.error('Failed to generate share link:', err);
            setError(getErrorMessage(err, 'Failed to generate share link'));
        } finally {
            setIsGeneratingLink(false);
        }
    };

    const handleCloseShareDialog = () => {
        setShareDialogOpen(false);
        setCopySuccess(false);
    };

    const urlInputRef = useRef<HTMLInputElement>(null);

    const handleCopyLink = async () => {
        try {
            // Priority 1: Modern Clipboard API (if secure context)
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(generatedShareUrl);
                setCopySuccess(true);
                return;
            }

            // Priority 2: Fallback using the existing input field
            // This avoids issues with focus traps in Dialogs
            if (urlInputRef.current) {
                urlInputRef.current.select();
                urlInputRef.current.setSelectionRange(0, 99999); // For mobile

                const successful = document.execCommand('copy');
                if (successful) {
                    setCopySuccess(true);
                } else {
                    throw new Error('execCommand returned false');
                }
            } else {
                throw new Error('Input ref not available');
            }
        } catch (err) {
            console.error('Copy failed:', err);
            alert('Copy failed. Please select the text and copy manually.');
        }
    };

    const inFlightStats = useRef<AbortController | null>(null);
    const inFlightDonations = useRef<AbortController | null>(null);
    const wsDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        apiClient.get<string[]>('/campaigns/sources')
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
                setCampaigns(sortNewestFirst(res.data));
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

        apiClient.get<unknown>(`/form-titles?campaign_id=${selectedCampaign}`)
            .then(res => {
                const normalized = normalizeFormTitles(res.data);
                normalized.sort((a, b) => {
                    if (!a.createdTime || !b.createdTime) return 0;
                    return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
                });
                setFormTitles(normalized);
            })
            .catch(async (err: unknown) => {
                const status = getResponseStatus(err);
                if (status === 404) {
                    try {
                        const statsRes = await apiClient.get<AnalyticsStatsResponse>(`/campaigns/${selectedCampaign}/stats`);
                        const titlesFromStats = normalizeFormTitles(statsRes.data.stats_by_form_title ?? []);
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

        } catch (err: unknown) {
            if (isCanceledRequest(err)) return;
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

            const statsRes = await apiClient.get<AnalyticsStatsResponse>(statsUrl, { signal: statsController.signal });
            const newStats = normalizeAnalyticsStats(statsRes.data);
            setAnalyticsStats(newStats);

        } catch (err: unknown) {
            if (isCanceledRequest(err)) return;
            setError(prev => prev || 'Failed to load analytics stats.');
            setAnalyticsStats(null);
        } finally {
            if (inFlightStats.current === statsController) {
                if (!isSilent) setLoading(prev => ({ ...prev, stats: false }));
                inFlightStats.current = null;
            }
        }

        // Fetch First Page of Donations
        // ✅ Modified: Fetch donors when either source OR campaign is selected
        const shouldFetchDonations = !!selectedSource;


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
                } else if (selectedSource) {
                    // ✅ NEW: Fetch donations for the entire source when no campaign is selected
                    const sourceReportUrl = `/campaigns/source/${selectedSource}/donations`;
                    donationsRes = await apiClient.get<PaginatedDonationsResponse>(sourceReportUrl, {
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

            } catch (err: unknown) {
                if (isCanceledRequest(err)) return;
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
        const options = {
            root: tableContainerRef.current,
            rootMargin: '240px 0px',
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
    }, [detailTab, fetchMoreDonations, isLoadingMore, hasMoreDonations]);

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


    const stats = analyticsStats;
    const totalAmount = stats?.total_amount ?? 0;
    const totalCount = stats?.total_count ?? 0;
    const chartData = stats?.breakdown;
    const rankedChartData = useMemo(
        () => [...(chartData ?? [])].sort((a, b) => b.total_amount - a.total_amount),
        [chartData]
    );
    const chronologicalTitleGroups = useMemo(() => {
        const sourceItems = chartData ?? [];
        const titleGroups = new Map<string, typeof sourceItems>();

        sourceItems.forEach(item => {
            const pairKey = getBaseTitle(item.name).toLocaleLowerCase();
            const existingItems = titleGroups.get(pairKey) ?? [];
            titleGroups.set(pairKey, [...existingItems, item]);
        });

        return Array.from(titleGroups.entries())
            .map(([pairKey, items]) => {
                const orderedItems = [...items].sort((a, b) => {
                    const dnrOrder = Number(isDnrTitle(a.name)) - Number(isDnrTitle(b.name));
                    if (dnrOrder !== 0) return dnrOrder;

                    const firstDate = a.start_date ? dayjs(a.start_date) : null;
                    const secondDate = b.start_date ? dayjs(b.start_date) : null;
                    const firstTime = firstDate?.isValid() ? firstDate.valueOf() : Number.MAX_SAFE_INTEGER;
                    const secondTime = secondDate?.isValid() ? secondDate.valueOf() : Number.MAX_SAFE_INTEGER;

                    if (firstTime !== secondTime) return firstTime - secondTime;
                    return a.name.localeCompare(b.name);
                });
                const originalItem = orderedItems.find(item => !isDnrTitle(item.name));
                const anchorItem = originalItem ?? orderedItems[0];
                const anchorDate = anchorItem?.start_date ? dayjs(anchorItem.start_date) : null;

                return {
                    pairKey,
                    baseTitle: getBaseTitle(anchorItem?.name ?? pairKey),
                    anchorTime: anchorDate?.isValid() ? anchorDate.valueOf() : Number.MAX_SAFE_INTEGER,
                    dateKey: anchorDate?.isValid() ? anchorDate.format('YYYY-MM-DD') : 'date-unavailable',
                    items: orderedItems,
                };
            })
            .sort((a, b) => {
                if (a.anchorTime !== b.anchorTime) return a.anchorTime - b.anchorTime;
                return a.baseTitle.localeCompare(b.baseTitle);
            });
    }, [chartData]);
    const pairedChartData = useMemo(
        () => chronologicalTitleGroups.flatMap(group => group.items),
        [chronologicalTitleGroups]
    );
    const topRevenueData = useMemo(() => {
        const topItems = rankedChartData.slice(0, 10);
        const groupedItems = new Map<string, typeof topItems>();

        topItems.forEach(item => {
            const pairKey = getBaseTitle(item.name).toLocaleLowerCase();
            const existingItems = groupedItems.get(pairKey) ?? [];
            groupedItems.set(pairKey, [...existingItems, item]);
        });

        return Array.from(groupedItems.values()).flatMap(items => (
            [...items].sort((a, b) => Number(isDnrTitle(a.name)) - Number(isDnrTitle(b.name)))
        ));
    }, [rankedChartData]);
    const displayedChartData = revenueChartView === 'top10' ? topRevenueData : pairedChartData;
    const chartHeight = revenueChartView === 'top10'
        ? Math.max(400, topRevenueData.length * 42)
        : selectedCampaign ? 560 : 420;
    const chartMinWidth = selectedCampaign
        ? Math.max(760, displayedChartData.length * 30)
        : 720;
    const viewTransition = {
        duration: reduceMotion ? 0 : 0.22,
        ease: [0.22, 1, 0.36, 1] as const,
    };
    const filterSelectSx = {
        height: 48,
        borderRadius: '12px',
        bgcolor: alpha(theme.palette.background.default, 0.28),
        transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
        '& .MuiSelect-select': {
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            fontSize: '0.9rem',
            fontWeight: 500,
        },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(theme.palette.divider, 0.95) },
        '&:hover': { bgcolor: alpha(theme.palette.background.default, 0.42) },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(theme.palette.primary.main, 0.45) },
        '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}` },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main, borderWidth: 1 },
        '& .MuiSelect-icon': { color: theme.palette.text.secondary },
    };
    const filterTextFieldSx = {
        '& .MuiOutlinedInput-root': {
            minHeight: 48,
            borderRadius: '12px',
            bgcolor: alpha(theme.palette.background.default, 0.28),
            transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
            '& fieldset': { borderColor: alpha(theme.palette.divider, 0.95) },
            '&:hover': { bgcolor: alpha(theme.palette.background.default, 0.42) },
            '&:hover fieldset': { borderColor: alpha(theme.palette.primary.main, 0.45) },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}` },
            '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main, borderWidth: 1 },
        },
        '& .MuiInputBase-input': { fontSize: '0.9rem', fontWeight: 500 },
        '& .MuiSvgIcon-root': { color: theme.palette.text.secondary },
    };

    return (
        <Box
            component={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            sx={{ width: '100%', maxWidth: '1600px', mx: 'auto', p: { xs: 2, md: 4 } }}
        >
            {/* Combined Header & Stats Container */}
            <Box
                sx={{
                    mb: 3,
                    p: { xs: 2.5, md: 3 },
                    borderRadius: '20px',
                    bgcolor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    boxShadow: 'none',
                }}
            >
                {/* Header Title & Description */}
                <Box sx={{ mb: stats ? 3 : 0, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                    <Box>
                        <Typography
                            variant="h4"
                            component={motion.h1}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            sx={{
                                fontWeight: 700,
                                color: theme.palette.text.primary,
                                mb: 0.75,
                            }}
                        >
                            Campaign Analytics
                        </Typography>
                        <Typography
                            variant="body1"
                            component={motion.p}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            sx={{
                                color: theme.palette.text.secondary,
                                fontWeight: 400,
                                maxWidth: '600px',
                            }}
                        >
                            Deep insights into your fundraising campaigns
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        startIcon={isGeneratingLink ? <CircularProgress size={20} color="inherit" /> : <ShareIcon />}
                        onClick={handleShareClick}
                        disabled={isGeneratingLink || !selectedSource}
                        sx={{
                            borderRadius: '12px',
                            textTransform: 'none',
                            fontWeight: 600,
                            boxShadow: 'none',
                            alignSelf: { xs: 'stretch', sm: 'flex-start' },
                        }}
                    >
                        Share View
                    </Button>
                </Box>

                {/* Main Stats Grid */}
                {stats && (
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <motion.div variants={itemVariants}>
                                <Card
                                    sx={{
                                        background: alpha(theme.palette.background.default, 0.38),
                                        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
                                        boxShadow: 'none',
                                        borderRadius: '16px',
                                        transition: 'border-color 180ms ease',
                                        '&:hover': {
                                            borderColor: alpha(theme.palette.primary.main, 0.2)
                                        }
                                    }}
                                >
                                    <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                                            Total raised
                                        </Typography>
                                        <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700, mt: 0.75 }}>
                                            {currencyFormatter.format(totalAmount)}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <motion.div variants={itemVariants}>
                                <Card
                                    sx={{
                                        background: alpha(theme.palette.background.default, 0.38),
                                        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
                                        boxShadow: 'none',
                                        borderRadius: '16px',
                                        transition: 'border-color 180ms ease',
                                        '&:hover': {
                                            borderColor: alpha(theme.palette.primary.main, 0.2)
                                        }
                                    }}
                                >
                                    <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                                            Donations
                                        </Typography>
                                        <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700, mt: 0.75 }}>
                                            {totalCount.toLocaleString('en-US')}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <motion.div variants={itemVariants}>
                                <Card
                                    sx={{
                                        background: alpha(theme.palette.background.default, 0.38),
                                        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
                                        boxShadow: 'none',
                                        borderRadius: '16px',
                                        transition: 'border-color 180ms ease',
                                        '&:hover': {
                                            borderColor: alpha(theme.palette.primary.main, 0.2)
                                        }
                                    }}
                                >
                                    <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                                            Average donation
                                        </Typography>
                                        <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700, mt: 0.75 }}>
                                            {currencyFormatter.format(totalCount > 0 ? totalAmount / totalCount : 0)}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <motion.div variants={itemVariants}>
                                <Card
                                    sx={{
                                        background: alpha(theme.palette.background.default, 0.38),
                                        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
                                        boxShadow: 'none',
                                        borderRadius: '16px',
                                        transition: 'border-color 180ms ease',
                                        '&:hover': {
                                            borderColor: alpha(theme.palette.primary.main, 0.2)
                                        }
                                    }}
                                >
                                    <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                                            {selectedCampaign ? 'Form titles' : 'Campaigns'}
                                        </Typography>
                                        <Typography variant="h5" sx={{ color: theme.palette.text.primary, fontWeight: 700, mt: 0.75 }}>
                                            {chartData?.length ?? 0}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </Grid>
                    </Grid>
                )}
            </Box>

            <Grid container spacing={3}>
                {/* Control Panel */}
                <Grid size={{ xs: 12 }}>
                    <motion.div variants={itemVariants}>
                        <Paper
                            sx={{
                                p: { xs: 2.5, md: 3 },
                                background: `linear-gradient(180deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.92)} 100%)`,
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '20px',
                                boxShadow: `inset 0 1px 0 ${alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.04 : 0.7)}`,
                                overflow: 'hidden'
                            }}
                        >
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                    justifyContent: 'space-between',
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    gap: 2,
                                    mb: 3,
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                    <Box
                                        sx={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '12px',
                                            background: alpha(theme.palette.primary.main, 0.1),
                                            border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                                            display: 'grid',
                                            placeItems: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <FilterListIcon sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                                            Build your analytics view
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, lineHeight: 1.45 }}>
                                            Refine the dataset, then update the chart and detailed results.
                                        </Typography>
                                    </Box>
                                </Box>
                                <Button
                                    variant="text"
                                    size="small"
                                    startIcon={<RestartAltRoundedIcon />}
                                    onClick={handleClearAllFilters}
                                    disabled={!selectedSource}
                                    sx={{
                                        color: 'text.secondary',
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        borderRadius: '10px',
                                        px: 1.25,
                                        flexShrink: 0,
                                    }}
                                >
                                    Reset view
                                </Button>
                            </Box>

                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    alignItems: 'flex-end',
                                }}
                            >
                                <Box sx={{ flex: '1 1 170px', minWidth: 0 }}>
                                    <FilterFieldLabel label="Source" />
                                    <FormControl fullWidth variant="outlined" size="small">
                                        <Select
                                            value={selectedSource}
                                            onChange={e => setSelectedSource(e.target.value)}
                                            disabled={loading.initial}
                                            displayEmpty
                                            inputProps={{ 'aria-label': 'Source' }}
                                            renderValue={(value) => sources.find(source => source.id === value)?.name || <Typography color="text.secondary">Choose source</Typography>}
                                            sx={filterSelectSx}
                                        >
                                            {sources.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Box>

                                <Box sx={{ flex: '3 1 520px', minWidth: 0 }}>
                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: { xs: '1fr', sm: 'minmax(190px, 1.15fr) minmax(310px, 1.7fr)' },
                                            gap: 2,
                                            alignItems: 'end',
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <FilterFieldLabel label="Campaign" optional />
                                            <FormControl fullWidth disabled={!selectedSource || loading.dependent} variant="outlined" size="small">
                                                <Select
                                                    value={selectedCampaign}
                                                    onChange={e => setSelectedCampaign(e.target.value)}
                                                    displayEmpty
                                                    inputProps={{ 'aria-label': 'Campaign' }}
                                                    renderValue={(value) => campaigns.find(campaign => campaign.id === value)?.name || (
                                                        <Typography color="text.secondary">
                                                            {selectedSource ? 'All campaigns' : 'Select source first'}
                                                        </Typography>
                                                    )}
                                                    sx={filterSelectSx}
                                                >
                                                    <MenuItem value=""><em>All campaigns</em></MenuItem>
                                                    {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                                </Select>
                                            </FormControl>
                                        </Box>

                                        <Box sx={{ minWidth: 0 }}>
                                            <FilterFieldLabel label="Date range" optional />
                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto minmax(0, 1fr)' },
                                                    gap: { xs: 1.25, sm: 0.75 },
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <DatePicker
                                                    label="From"
                                                    value={startDate}
                                                    onChange={setStartDate}
                                                    disabled={!selectedSource}
                                                    slotProps={{
                                                        textField: {
                                                            fullWidth: true,
                                                            size: 'small',
                                                            inputProps: { 'aria-label': 'Start date' },
                                                            sx: filterTextFieldSx,
                                                        }
                                                    }}
                                                />
                                                <ArrowForwardRoundedIcon
                                                    aria-hidden="true"
                                                    sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.disabled', fontSize: 18 }}
                                                />
                                                <DatePicker
                                                    label="To"
                                                    value={endDate}
                                                    onChange={setEndDate}
                                                    disabled={!selectedSource}
                                                    slotProps={{
                                                        textField: {
                                                            fullWidth: true,
                                                            size: 'small',
                                                            inputProps: { 'aria-label': 'End date' },
                                                            sx: filterTextFieldSx,
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>

                                <Box sx={{ flex: '1.45 1 230px', minWidth: 0 }}>
                                    <FilterFieldLabel label="Form titles" optional />
                                    <FormTitleSelector
                                        key={selectorKey}
                                        titles={formTitles}
                                        onSelectionChange={setSelectedTitles}
                                        isLoading={!!selectedCampaign && loading.dependent}
                                        disabled={!selectedCampaign || loading.dependent}
                                        hideInputLabel
                                        label="Form titles"
                                        placeholder={selectedCampaign ? 'All form titles' : 'Select campaign first'}
                                        size="small"
                                        compactSelection
                                        showLeadingIcon={false}
                                        sx={{
                                            ...filterTextFieldSx,
                                            '& .MuiAutocomplete-inputRoot': {
                                                height: 48,
                                                minHeight: 48,
                                                maxHeight: 48,
                                                py: '3px !important',
                                                pr: '38px !important',
                                                flexWrap: 'nowrap',
                                                overflow: 'hidden',
                                                alignContent: 'center',
                                            },
                                            '& .MuiAutocomplete-input': { minWidth: '24px !important' },
                                            '& .MuiChip-root': { minWidth: 0, maxWidth: 'calc(100% - 32px)' },
                                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                        }}
                                    />
                                </Box>

                                <Box
                                    sx={{
                                        display: 'flex',
                                        flex: { xs: '1 1 100%', sm: '0 0 160px' },
                                        minWidth: { xs: '100%', sm: 160 },
                                        alignSelf: 'flex-end',
                                        justifyContent: 'flex-end',
                                    }}
                                >
                                    <Button
                                        variant="contained"
                                        onClick={handleApplyFilters}
                                        disabled={!selectedSource || loading.stats}
                                        fullWidth
                                        sx={{
                                            minHeight: 48,
                                            borderRadius: '12px',
                                            background: theme.palette.primary.main,
                                            boxShadow: `0 8px 20px ${alpha(theme.palette.primary.main, 0.16)}`,
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            textTransform: 'none',
                                            transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
                                            '&:hover': {
                                                background: theme.palette.primary.dark,
                                                boxShadow: `0 10px 24px ${alpha(theme.palette.primary.main, 0.22)}`,
                                                transform: 'translateY(-1px)',
                                            },
                                            '&:active': {
                                                transform: 'translateY(0)',
                                            }
                                        }}
                                        endIcon={<ArrowForwardRoundedIcon />}
                                    >
                                        Update view
                                    </Button>
                                </Box>
                            </Box>
                        </Paper>
                    </motion.div>
                </Grid>

                {/* Results Panel */}
                <Grid size={{ xs: 12 }}>
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
                                        borderRadius: '20px',
                                        bgcolor: theme.palette.background.paper,
                                        border: `1px solid ${theme.palette.divider}`,
                                        boxShadow: 'none'
                                    }}
                                >
                                    <Box
                                        sx={{
                                            mb: 1,
                                            display: 'flex',
                                            alignItems: { xs: 'flex-start', sm: 'center' },
                                            justifyContent: 'space-between',
                                            flexDirection: { xs: 'column', sm: 'row' },
                                            gap: 1.5,
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight="700">
                                            {selectedCampaign ? 'Revenue by Form Title' : 'Revenue by Campaign'}
                                        </Typography>
                                        {chartData.length > 10 && (
                                            <ToggleButtonGroup
                                                value={revenueChartView}
                                                exclusive
                                                size="small"
                                                aria-label="Revenue chart range"
                                                onChange={(_event, nextView: RevenueChartView | null) => {
                                                    if (nextView) setRevenueChartView(nextView);
                                                }}
                                                sx={{
                                                    '& .MuiToggleButton-root': {
                                                        minHeight: 36,
                                                        px: 1.5,
                                                        borderColor: theme.palette.divider,
                                                        color: theme.palette.text.secondary,
                                                        textTransform: 'none',
                                                        fontWeight: 650,
                                                        '&.Mui-selected': {
                                                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                                                            color: theme.palette.primary.main,
                                                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                                                        },
                                                    },
                                                }}
                                            >
                                                <ToggleButton value="top10">Top 10</ToggleButton>
                                                <ToggleButton value="all">All forms</ToggleButton>
                                            </ToggleButtonGroup>
                                        )}
                                    </Box>
                                    {selectedCampaign && (
                                        <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} aria-label="Chart color legend">
                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'primary.main' }} />
                                                <Typography variant="caption" color="text.secondary">Original</Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'secondary.main' }} />
                                                <Typography variant="caption" color="text.secondary">DNR</Typography>
                                            </Stack>
                                        </Stack>
                                    )}
                                    <Box
                                        role="img"
                                        aria-label={`${selectedCampaign ? 'Revenue by form title' : 'Revenue by campaign'}: ${revenueChartView === 'top10' ? 'top 10' : 'all results'}`}
                                        sx={{
                                            width: '100%',
                                            overflowY: 'hidden',
                                        }}
                                    >
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div
                                                key={revenueChartView}
                                                initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.995 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8, scale: 0.995 }}
                                                transition={viewTransition}
                                                style={{ width: '100%' }}
                                            >
                                                {revenueChartView === 'top10' ? (
                                            <ResponsiveContainer width="100%" height={chartHeight}>
                                                <BarChart
                                                    data={topRevenueData}
                                                    layout="vertical"
                                                    margin={{ top: 8, right: 44, left: 12, bottom: 4 }}
                                                >
                                                    <defs>
                                                        <linearGradient id="topRevenueOriginal" x1="0" y1="0" x2="1" y2="0">
                                                            <stop offset="0%" stopColor={theme.palette.primary.dark} />
                                                            <stop offset="100%" stopColor={theme.palette.primary.light} />
                                                        </linearGradient>
                                                        <linearGradient id="topRevenueDnr" x1="0" y1="0" x2="1" y2="0">
                                                            <stop offset="0%" stopColor={theme.palette.secondary.dark} />
                                                            <stop offset="100%" stopColor={theme.palette.secondary.light} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid
                                                        strokeDasharray="3 3"
                                                        stroke={alpha(theme.palette.text.secondary, 0.12)}
                                                        horizontal={false}
                                                    />
                                                    <XAxis
                                                        type="number"
                                                        tickFormatter={(tick) => `$${Number(tick).toLocaleString('en-US')}`}
                                                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        type="category"
                                                        dataKey="name"
                                                        width={250}
                                                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <Tooltip
                                                        formatter={(value: number) => [currencyFormatter.format(Number(value)), 'Amount raised']}
                                                        contentStyle={{
                                                            backgroundColor: theme.palette.background.paper,
                                                            border: `1px solid ${theme.palette.divider}`,
                                                            borderRadius: '12px',
                                                            boxShadow: theme.shadows[4]
                                                        }}
                                                        cursor={{ fill: alpha(theme.palette.primary.main, 0.08) }}
                                                    />
                                                    <Bar dataKey="total_amount" name="Amount raised" radius={[0, 7, 7, 0]} maxBarSize={24}>
                                                        {topRevenueData.map((entry, index) => (
                                                            <Cell
                                                                key={`top-revenue-cell-${index}`}
                                                                fill={isDnrTitle(entry.name) ? 'url(#topRevenueDnr)' : 'url(#topRevenueOriginal)'}
                                                            />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <Box
                                                sx={{
                                                    overflowX: 'auto',
                                                    overflowY: 'hidden',
                                                    scrollbarWidth: 'thin',
                                                    scrollbarColor: `${alpha(theme.palette.primary.main, 0.3)} transparent`,
                                                }}
                                            >
                                                <Box sx={{ minWidth: chartMinWidth }}>
                                                    <ResponsiveContainer width="100%" height={chartHeight}>
                                                        <BarChart
                                                            data={displayedChartData}
                                                            margin={{ top: 20, right: 24, left: 12, bottom: selectedCampaign ? 132 : 72 }}
                                                        >
                                                            <defs>
                                                                <linearGradient id="allRevenueOriginal" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor={theme.palette.primary.light} stopOpacity={0.95} />
                                                                    <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.55} />
                                                                </linearGradient>
                                                                <linearGradient id="allRevenueDnr" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor={theme.palette.secondary.light} stopOpacity={0.95} />
                                                                    <stop offset="100%" stopColor={theme.palette.secondary.main} stopOpacity={0.55} />
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid
                                                                strokeDasharray="3 3"
                                                                stroke={alpha(theme.palette.text.secondary, 0.12)}
                                                                vertical={Boolean(selectedCampaign)}
                                                            />
                                                            <XAxis
                                                                dataKey="name"
                                                                angle={selectedCampaign ? -45 : 0}
                                                                textAnchor={selectedCampaign ? 'end' : 'middle'}
                                                                interval={0}
                                                                height={selectedCampaign ? 128 : 54}
                                                                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                                                axisLine={{ stroke: alpha(theme.palette.text.secondary, 0.3) }}
                                                                tickLine={false}
                                                            />
                                                            <YAxis
                                                                tickFormatter={(tick) => `$${Number(tick).toLocaleString('en-US')}`}
                                                                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                                                axisLine={{ stroke: alpha(theme.palette.text.secondary, 0.3) }}
                                                                tickLine={false}
                                                                width={74}
                                                            />
                                                            <Tooltip
                                                                formatter={(value: number) => [currencyFormatter.format(Number(value)), 'Amount raised']}
                                                                contentStyle={{
                                                                    backgroundColor: theme.palette.background.paper,
                                                                    border: `1px solid ${theme.palette.divider}`,
                                                                    borderRadius: '12px',
                                                                    boxShadow: theme.shadows[4]
                                                                }}
                                                                cursor={{ fill: alpha(theme.palette.primary.main, 0.08) }}
                                                            />
                                                            <Bar dataKey="total_amount" name="Amount raised" radius={[7, 7, 0, 0]} maxBarSize={28}>
                                                                {displayedChartData.map((entry, index) => (
                                                                    <Cell
                                                                        key={`all-revenue-cell-${index}`}
                                                                        fill={isDnrTitle(entry.name) ? 'url(#allRevenueDnr)' : 'url(#allRevenueOriginal)'}
                                                                    />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </Box>
                                            </Box>
                                                )}
                                            </motion.div>
                                        </AnimatePresence>
                                    </Box>
                                </Paper>
                            )}
                        </motion.div>
                    )}
                </Grid>
            </Grid>

            {/* Bottom Section: Detailed Data Tables - Full Width */}
            {
                stats && (
                    <>
                    <Paper
                        sx={{
                            mt: 3,
                            borderRadius: '16px',
                            border: `1px solid ${theme.palette.divider}`,
                            boxShadow: 'none',
                            overflow: 'hidden',
                        }}
                    >
                        <Tabs
                            value={detailTab}
                            onChange={(_event, value: number) => setDetailTab(value)}
                            variant="scrollable"
                            scrollButtons="auto"
                            aria-label="Analytics detail tables"
                            sx={{
                                px: { xs: 1, sm: 2 },
                                minHeight: 56,
                                '& .MuiTab-root': { minHeight: 56, textTransform: 'none', fontWeight: 600 },
                            }}
                        >
                            <Tab label={`Form titles (${(chartData?.length ?? 0).toLocaleString('en-US')})`} />
                            <Tab label={`Donations (${totalDonationsCount.toLocaleString('en-US')})`} />
                        </Tabs>
                    </Paper>
                    <Box sx={{ mt: 1.5 }}>
                        <AnimatePresence mode="wait" initial={false}>
                            {detailTab === 1 ? (
                                <motion.div
                                    key="donations"
                                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                                    transition={viewTransition}
                                    style={{ width: '100%' }}
                                >
                                {(selectedSource || selectedCampaign || selectedTitles.length > 0) && !loading.stats && (
                                        <Paper
                                            sx={{
                                                width: '100%',
                                                height: '100%',
                                                borderRadius: '20px',
                                                background: theme.palette.background.paper,
                                                border: `1px solid ${theme.palette.divider}`,
                                                boxShadow: 'none',
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
                                                        Donations
                                                    </Typography>
                                                )}
                                            </Box>

                                            <TableContainer
                                                ref={tableContainerRef}
                                                sx={{
                                                    flexGrow: 1,
                                                    maxHeight: { xs: '62vh', md: 'min(68vh, 720px)' },
                                                    overflow: 'auto',
                                                    overscrollBehavior: 'contain',
                                                    scrollbarGutter: 'stable',
                                                    scrollbarWidth: 'thin',
                                                    scrollbarColor: `${alpha(theme.palette.primary.main, 0.34)} transparent`,
                                                    '&::-webkit-scrollbar': { width: 9, height: 9 },
                                                    '&::-webkit-scrollbar-thumb': {
                                                        borderRadius: 10,
                                                        bgcolor: alpha(theme.palette.primary.main, 0.34),
                                                    },
                                                    '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                                                }}
                                            >
                                                <Table stickyHeader size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Donor</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Amount</TableCell>
                                                            <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper }}>Date</TableCell>
                                                            <TableCell sx={{ fontWeight: 700, backgroundColor: theme.palette.background.paper, minWidth: 200, display: { xs: 'none', md: 'table-cell' } }}>Email</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {donations.map((d) => (
                                                            <TableRow
                                                                key={d.id}
                                                                hover
                                                                sx={{
                                                                    '&:nth-of-type(odd)': {
                                                                        backgroundColor: alpha(theme.palette.action.hover, 0.02),
                                                                    },
                                                                }}
                                                            >
                                                                <TableCell sx={{ minWidth: 170 }}>
                                                                    <Typography variant="body2" fontWeight={600}>{d.donorName}</Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {d.donorEmail}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{currencyFormatter.format(d.amount)}</TableCell>
                                                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                                                                <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', md: 'table-cell' } }} title={d.donorEmail}>{d.donorEmail}</TableCell>
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
                                )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="form-titles"
                                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                                    transition={viewTransition}
                                    style={{ width: '100%' }}
                                >
                                {chartData && chartData.length > 0 && (
                                        <Paper
                                            sx={{
                                                width: '100%',
                                                borderRadius: '20px',
                                                background: theme.palette.background.paper,
                                                border: `1px solid ${theme.palette.divider}`,
                                                boxShadow: 'none',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5, pb: 2 }}>
                                                <Typography variant="h6" fontWeight={700}>Form Titles</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                                                    Compare original and DNR performance for each form title.
                                                </Typography>
                                            </Box>
                                            <Box
                                                role="table"
                                                aria-label="Form title variant comparison"
                                                sx={{
                                                    maxHeight: { xs: '62vh', md: 'min(68vh, 720px)' },
                                                    overflowY: 'auto',
                                                    overscrollBehavior: 'contain',
                                                    scrollbarGutter: 'stable',
                                                    scrollbarWidth: 'thin',
                                                    scrollbarColor: `${alpha(theme.palette.primary.main, 0.34)} transparent`,
                                                    '&::-webkit-scrollbar': { width: 9, height: 9 },
                                                    '&::-webkit-scrollbar-thumb': {
                                                        borderRadius: 10,
                                                        bgcolor: alpha(theme.palette.primary.main, 0.34),
                                                    },
                                                    '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                                                }}
                                            >
                                                <Box
                                                    role="row"
                                                    sx={{
                                                        display: { xs: 'none', lg: 'grid' },
                                                        gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(300px, 1fr) minmax(300px, 1fr)',
                                                        gap: 2,
                                                        px: 3,
                                                        py: 1.25,
                                                        position: 'sticky',
                                                        top: 0,
                                                        zIndex: 2,
                                                        borderTop: `1px solid ${theme.palette.divider}`,
                                                        borderBottom: `1px solid ${theme.palette.divider}`,
                                                        bgcolor: theme.palette.background.paper,
                                                    }}
                                                >
                                                    <Typography role="columnheader" variant="caption" color="text.secondary" fontWeight={700}>
                                                        Form title
                                                    </Typography>
                                                    <Typography role="columnheader" variant="caption" color="text.secondary" fontWeight={700}>
                                                        Original
                                                    </Typography>
                                                    <Typography role="columnheader" variant="caption" sx={{ color: theme.palette.primary.main }} fontWeight={700}>
                                                        DNR
                                                    </Typography>
                                                </Box>
                                                {chronologicalTitleGroups.map((group, groupIndex) => {
                                                    const originalItem = group.items.find(item => !isDnrTitle(item.name));
                                                    const dnrItem = group.items.find(item => isDnrTitle(item.name));

                                                    return (
                                                        <Box
                                                            role="row"
                                                            key={group.pairKey}
                                                            sx={{
                                                                display: 'grid',
                                                                gridTemplateColumns: {
                                                                    xs: 'minmax(0, 1fr)',
                                                                    lg: 'minmax(220px, 0.8fr) minmax(300px, 1fr) minmax(300px, 1fr)',
                                                                },
                                                                gap: { xs: 1.5, lg: 2 },
                                                                alignItems: 'center',
                                                                px: { xs: 2, md: 3 },
                                                                py: 2,
                                                                borderTop: groupIndex === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                                                                bgcolor: groupIndex % 2 === 1
                                                                    ? alpha(theme.palette.background.default, 0.1)
                                                                    : 'transparent',
                                                                transition: 'background-color 160ms ease',
                                                                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.025) },
                                                            }}
                                                        >
                                                            <Box role="cell" sx={{ alignSelf: 'start', pt: { xs: 0, lg: 0.75 } }}>
                                                                <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.45 }}>
                                                                    {group.baseTitle}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
                                                                    {dnrItem ? 'Original + DNR' : originalItem ? 'Original only' : 'DNR only'}
                                                                </Typography>
                                                            </Box>
                                                            <Box role="cell">
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                    fontWeight={700}
                                                                    sx={{ display: { xs: 'block', lg: 'none' }, mb: 0.75 }}
                                                                >
                                                                    Original
                                                                </Typography>
                                                                <VariantMetricsPanel variant="original" item={originalItem} />
                                                            </Box>
                                                            <Box role="cell">
                                                                <Typography
                                                                    variant="caption"
                                                                    fontWeight={700}
                                                                    sx={{ display: { xs: 'block', lg: 'none' }, mb: 0.75, color: theme.palette.primary.main }}
                                                                >
                                                                    DNR
                                                                </Typography>
                                                                <VariantMetricsPanel variant="dnr" item={dnrItem} />
                                                            </Box>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Paper>
                                )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Box>
                    </>
                )
            }

            {/* Share Dialog */}
            <Dialog
                open={shareDialogOpen}
                onClose={handleCloseShareDialog}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '16px',
                        background: theme.palette.background.paper,
                        backgroundImage: 'none',
                        boxShadow: theme.shadows[10]
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" fontWeight="700">Share Analytics View</Typography>
                    <IconButton onClick={handleCloseShareDialog} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Anyone with this link can view the analytics for the selected filters.
                    </Typography>

                    <TextField
                        fullWidth
                        inputRef={urlInputRef}
                        value={generatedShareUrl}
                        variant="outlined"
                        InputProps={{
                            readOnly: true,
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton onClick={handleCopyLink} edge="end" color="primary">
                                        <ContentCopyIcon />
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px',
                                bgcolor: alpha(theme.palette.primary.main, 0.05)
                            }
                        }}
                    />

                    {copySuccess && (
                        <Alert severity="success" sx={{ mt: 2, borderRadius: '8px' }}>
                            Link copied to clipboard!
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 0 }}>
                    <Button
                        onClick={handleCloseShareDialog}
                        variant="contained"
                        sx={{
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 4
                        }}
                    >
                        Done
                    </Button>
                </DialogActions>
            </Dialog>
        </Box >
    );
};

export default CampaignAnalyticsPage;
