import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    LinearProgress,
    Paper,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import dayjs from 'dayjs';
import apiClient from '../api/axiosConfig';
import {
    CampaignSelectorSlot,
    VIEW_ALL_CAMPAIGNS,
    type ApiListItem,
    type CampaignSelection,
} from '../components/CampaignSelectorSlot';

interface ComparisonStatsData {
    totalAmount: number;
    totalCount: number;
    breakdown: {
        id: string;
        name: string;
        total_amount: number;
        donation_count: number;
        start_date?: string;
    }[];
    viewType: 'form-title' | 'campaign';
    displayName: string;
}

interface DonationDetail {
    id: string;
    donorName: string;
    donorEmail: string;
    amount: number;
    date: string;
}

interface SlotSelection {
    source: string | null;
    campaign: CampaignSelection;
}

interface ResultCardProps {
    stats: ComparisonStatsData;
    roleLabel: string;
    accentColor: string;
    isLeader: boolean;
    baselineAmount?: number;
    isBaseline: boolean;
    reduceMotion: boolean | null;
    onFormTitleClick: (formTitleId: string, formTitleName: string) => void;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
}).format(amount);

const formatPercent = (value: number) => `${Math.abs(value).toFixed(1)}%`;

const CampaignResultCard: React.FC<ResultCardProps> = ({
    stats,
    roleLabel,
    accentColor,
    isLeader,
    baselineAmount,
    isBaseline,
    reduceMotion,
    onFormTitleClick,
}) => {
    const theme = useTheme();
    const averageGift = stats.totalCount > 0 ? stats.totalAmount / stats.totalCount : 0;
    const deltaFromBaseline = baselineAmount && baselineAmount > 0
        ? ((stats.totalAmount - baselineAmount) / baselineAmount) * 100
        : null;

    return (
        <motion.div
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
            style={{ height: '100%' }}
        >
            <Paper
                variant="outlined"
                sx={{
                    height: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                    borderRadius: 3,
                    borderColor: isLeader ? alpha(accentColor, 0.6) : alpha(theme.palette.divider, 0.76),
                    bgcolor: alpha(theme.palette.background.paper, 0.72),
                }}
            >
                <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="overline"
                                sx={{ color: accentColor, fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.4 }}
                            >
                                {roleLabel}
                            </Typography>
                            <Typography
                                variant="h6"
                                component="h2"
                                title={stats.displayName}
                                sx={{ mt: 0.35, fontWeight: 760, lineHeight: 1.25 }}
                            >
                                {stats.displayName}
                            </Typography>
                        </Box>
                        {isLeader && (
                            <Chip
                                size="small"
                                icon={<EmojiEventsRoundedIcon />}
                                label="Leader"
                                sx={{
                                    flex: '0 0 auto',
                                    color: accentColor,
                                    bgcolor: alpha(accentColor, 0.12),
                                    '& .MuiChip-icon': { color: 'inherit' },
                                }}
                            />
                        )}
                    </Box>

                    <Grid container spacing={1.25} sx={{ mt: 1.5 }}>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(accentColor, 0.075), minHeight: 78 }}>
                                <Typography variant="caption" color="text.secondary">Raised</Typography>
                                <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 760, fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(stats.totalAmount)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.035), minHeight: 78 }}>
                                <Typography variant="caption" color="text.secondary">Donations</Typography>
                                <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 720, fontVariantNumeric: 'tabular-nums' }}>
                                    {stats.totalCount.toLocaleString('en-US')}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.035), minHeight: 78 }}>
                                <Typography variant="caption" color="text.secondary">Avg. gift</Typography>
                                <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 720, fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(averageGift)}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    {!isBaseline && deltaFromBaseline !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5 }}>
                            <ArrowOutwardRoundedIcon
                                sx={{
                                    fontSize: 17,
                                    color: deltaFromBaseline >= 0 ? theme.palette.primary.main : theme.palette.secondary.main,
                                    transform: deltaFromBaseline < 0 ? 'rotate(90deg)' : 'none',
                                }}
                            />
                            <Typography variant="caption" color="text.secondary">
                                <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
                                    {formatPercent(deltaFromBaseline)} {deltaFromBaseline >= 0 ? 'above' : 'below'}
                                </Box>{' '}
                                the baseline in revenue
                            </Typography>
                        </Box>
                    )}
                </Box>

                <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: 1.25 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {stats.viewType === 'form-title' ? 'Form title breakdown' : 'Campaign breakdown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {stats.viewType === 'form-title'
                            ? 'Select a row to inspect its donations.'
                            : 'Campaigns included in this source total.'}
                    </Typography>
                </Box>

                <TableContainer sx={{ maxHeight: 390, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Table stickyHeader size="small" aria-label={`${stats.displayName} breakdown`}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ minWidth: 190 }}>
                                    {stats.viewType === 'form-title' ? 'Form title' : 'Campaign'}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>Start date</TableCell>
                                <TableCell align="right">Gifts</TableCell>
                                <TableCell align="right">Raised</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stats.breakdown.map(row => (
                                <TableRow
                                    key={row.id}
                                    hover={stats.viewType === 'form-title'}
                                    tabIndex={stats.viewType === 'form-title' ? 0 : undefined}
                                    role={stats.viewType === 'form-title' ? 'button' : undefined}
                                    onClick={() => stats.viewType === 'form-title' && onFormTitleClick(row.id, row.name)}
                                    onKeyDown={(event) => {
                                        if (stats.viewType === 'form-title' && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            onFormTitleClick(row.id, row.name);
                                        }
                                    }}
                                    sx={{
                                        cursor: stats.viewType === 'form-title' ? 'pointer' : 'default',
                                        '&:focus-visible': {
                                            outline: `2px solid ${theme.palette.primary.main}`,
                                            outlineOffset: -2,
                                        },
                                    }}
                                >
                                    <TableCell component="th" scope="row" sx={{ fontWeight: 620 }}>{row.name}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                        {row.start_date ? dayjs(row.start_date).format('MMM D, YYYY') : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {row.donation_count.toLocaleString('en-US')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {formatCurrency(row.total_amount)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </motion.div>
    );
};

export const CampaignComparisonPage: React.FC = () => {
    const theme = useTheme();
    const reduceMotion = useReducedMotion();
    const [sources, setSources] = useState<ApiListItem[]>([]);
    const [selectedSlots, setSelectedSlots] = useState<SlotSelection[]>(() =>
        Array.from({ length: 4 }, () => ({ source: null, campaign: null })),
    );
    const [comparisonData, setComparisonData] = useState<Record<number, ComparisonStatsData | null>>({});
    const [loading, setLoading] = useState({ sources: true, stats: false });
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [donationDetails, setDonationDetails] = useState<DonationDetail[]>([]);
    const [loadingDonations, setLoadingDonations] = useState(false);

    const slotDefinitions = useMemo(() => [
        { label: 'Baseline', description: 'Your reference campaign', color: theme.palette.primary.main },
        { label: 'Challenger', description: 'The main alternative', color: theme.palette.secondary.main },
        { label: 'Option 3', description: 'Optional comparison', color: theme.palette.info.main },
        { label: 'Option 4', description: 'Optional comparison', color: theme.palette.warning.main },
    ], [theme]);

    useEffect(() => {
        apiClient.get<string[]>('/campaigns/sources')
            .then(response => setSources(response.data.map(source => ({ id: source, name: source }))))
            .catch(() => setError('We could not load campaign sources. Try refreshing the page.'))
            .finally(() => setLoading(value => ({ ...value, sources: false })));
    }, []);

    const handleSelectionChange = (slotId: number, source: string | null, campaign: CampaignSelection) => {
        setSelectedSlots(previous => previous.map((slot, index) =>
            index === slotId - 1 ? { source, campaign } : slot,
        ));
    };

    useEffect(() => {
        const slotsToFetch = selectedSlots
            .map((slot, index) => ({ ...slot, slotId: index }))
            .filter(slot => slot.source && slot.campaign);

        if (slotsToFetch.length === 0) {
            setComparisonData({});
            setLoading(value => ({ ...value, stats: false }));
            return;
        }

        let cancelled = false;

        const fetchStats = async () => {
            setLoading(value => ({ ...value, stats: true }));
            setError('');

            const results = await Promise.all(slotsToFetch.map(async slot => {
                const { source, campaign, slotId } = slot;
                if (!source || !campaign) return { slotId, data: null };

                try {
                    const isAllCampaignsView = campaign === VIEW_ALL_CAMPAIGNS;
                    const url = isAllCampaignsView
                        ? `/campaigns/source/${source}/stats`
                        : `/campaigns/${typeof campaign === 'object' ? campaign.id : ''}/stats`;
                    const displayName = isAllCampaignsView
                        ? `${source} · All campaigns`
                        : typeof campaign === 'object' ? campaign.name : 'Campaign';
                    const response = await apiClient.get(url);
                    const rawBreakdown = response.data.stats_by_campaign ?? response.data.stats_by_form_title ?? [];
                    const breakdown = rawBreakdown.map((item: {
                        campaign_id?: string;
                        form_title_id?: string;
                        campaign_name?: string;
                        form_title_name?: string;
                        total_amount: number;
                        donation_count: number;
                        start_date?: string;
                        createdTime?: string;
                    }) => ({
                        id: item.campaign_id ?? item.form_title_id ?? item.campaign_name ?? item.form_title_name ?? 'unknown',
                        name: item.campaign_name ?? item.form_title_name ?? 'Untitled',
                        total_amount: item.total_amount,
                        donation_count: item.donation_count,
                        start_date: item.start_date ?? item.createdTime,
                    }));

                    return {
                        slotId,
                        data: {
                            totalAmount: response.data.source_total_amount ?? response.data.campaign_total_amount ?? 0,
                            totalCount: response.data.source_total_count ?? response.data.campaign_total_count ?? 0,
                            breakdown,
                            viewType: isAllCampaignsView ? 'campaign' as const : 'form-title' as const,
                            displayName,
                        },
                    };
                } catch {
                    return { slotId, data: null };
                }
            }));

            if (cancelled) return;

            const nextData: Record<number, ComparisonStatsData | null> = {};
            results.forEach(result => { nextData[result.slotId] = result.data; });
            setComparisonData(nextData);
            if (results.some(result => !result.data)) {
                setError('Some campaign results could not be loaded. The available comparisons are shown below.');
            }
            setLoading(value => ({ ...value, stats: false }));
        };

        fetchStats().catch(() => {
            if (!cancelled) {
                setError('An unexpected error occurred while loading the comparison.');
                setLoading(value => ({ ...value, stats: false }));
            }
        });

        return () => { cancelled = true; };
    }, [selectedSlots]);

    const activeEntries = Object.entries(comparisonData)
        .filter((entry): entry is [string, ComparisonStatsData] => Boolean(entry[1]))
        .sort(([slotA], [slotB]) => Number(slotA) - Number(slotB));
    const selectedCount = selectedSlots.filter(slot => slot.source && slot.campaign).length;
    const rankedEntries = [...activeEntries].sort(([, a], [, b]) => b.totalAmount - a.totalAmount);
    const leaderEntry = rankedEntries[0];
    const runnerUpEntry = rankedEntries[1];
    const baselineAmount = comparisonData[0]?.totalAmount;
    const leaderAdvantage = leaderEntry && runnerUpEntry
        ? leaderEntry[1].totalAmount - runnerUpEntry[1].totalAmount
        : 0;
    const leaderAdvantagePercent = runnerUpEntry && runnerUpEntry[1].totalAmount > 0
        ? (leaderAdvantage / runnerUpEntry[1].totalAmount) * 100
        : 0;
    const maxAmount = leaderEntry?.[1].totalAmount || 1;

    const handleOpenDonationModal = async (formTitleId: string, formTitleName: string) => {
        setModalTitle(`Donors for “${formTitleName}”`);
        setModalOpen(true);
        setLoadingDonations(true);
        setDonationDetails([]);
        apiClient.get<DonationDetail[]>(`/campaigns/form-titles/${formTitleId}/donations`)
            .then(response => setDonationDetails(response.data))
            .catch(() => setDonationDetails([]))
            .finally(() => setLoadingDonations(false));
    };

    return (
        <Box sx={{ width: '100%', maxWidth: 1680, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3.5 } }}>
            <Box
                component="header"
                sx={{
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 2,
                    mb: 3,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
                    <Box
                        sx={{
                            width: 38,
                            height: 38,
                            flex: '0 0 auto',
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: 2,
                            color: 'primary.main',
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                        }}
                    >
                        <CompareArrowsIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" component="h1" sx={{ fontWeight: 780, letterSpacing: '-0.025em' }}>
                            Campaign comparison
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                            Select a baseline, add challengers, and see what is driving the difference.
                        </Typography>
                    </Box>
                </Box>
                <Chip
                    size="small"
                    label={`${selectedCount} of 4 selected`}
                    sx={{
                        color: selectedCount >= 2 ? 'primary.main' : 'text.secondary',
                        bgcolor: selectedCount >= 2 ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.text.primary, 0.05),
                        border: `1px solid ${selectedCount >= 2 ? alpha(theme.palette.primary.main, 0.28) : theme.palette.divider}`,
                    }}
                />
            </Box>

            <Paper
                component="section"
                aria-labelledby="comparison-setup-title"
                variant="outlined"
                sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, 0.48) }}
            >
                <Box sx={{ mb: 2 }}>
                    <Typography id="comparison-setup-title" variant="subtitle1" sx={{ fontWeight: 720 }}>
                        Build your comparison
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Start with two campaigns. Add the optional slots only when they help answer the question.
                    </Typography>
                </Box>

                {loading.sources ? (
                    <Grid container spacing={1.5}>
                        {[1, 2, 3, 4].map(item => (
                            <Grid size={{ xs: 12, md: 6, xl: 3 }} key={item}>
                                <Skeleton variant="rounded" height={194} sx={{ borderRadius: 3 }} />
                            </Grid>
                        ))}
                    </Grid>
                ) : (
                    <Grid container spacing={1.5}>
                        {slotDefinitions.map((definition, index) => (
                            <Grid size={{ xs: 12, md: 6, xl: 3 }} key={definition.label}>
                                <CampaignSelectorSlot
                                    slotId={index + 1}
                                    sources={sources}
                                    onSelectionChange={handleSelectionChange}
                                    selectedSource={selectedSlots[index]?.source}
                                    selectedCampaign={selectedSlots[index]?.campaign}
                                    roleLabel={definition.label}
                                    roleDescription={definition.description}
                                    accentColor={definition.color}
                                />
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Paper>

            {loading.stats && <LinearProgress aria-label="Loading comparison" sx={{ mt: 2, borderRadius: 999 }} />}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            <AnimatePresence mode="popLayout">
                {!loading.stats && activeEntries.length === 0 && (
                    <motion.div
                        key="empty-state"
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.22 }}
                    >
                        <Paper
                            component="section"
                            variant="outlined"
                            sx={{ mt: 2, p: { xs: 2.5, md: 3 }, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, 0.42) }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                                <InsightsRoundedIcon sx={{ color: 'primary.main' }} />
                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 720 }}>Your comparison starts here</Typography>
                                    <Typography variant="body2" color="text.secondary">Two selections are enough to reveal the leader and the performance gap.</Typography>
                                </Box>
                            </Box>
                            <Grid container spacing={1.25}>
                                {[
                                    ['1', 'Choose a baseline', 'Select the campaign you want to use as your reference.'],
                                    ['2', 'Add a challenger', 'Pick the campaign or source total you want to test against it.'],
                                    ['3', 'Read the difference', 'See the leader, revenue gap, average gift, and exact breakdown.'],
                                ].map(([number, title, description]) => (
                                    <Grid size={{ xs: 12, md: 4 }} key={number}>
                                        <Box sx={{ display: 'flex', gap: 1.25, p: 1.5, height: '100%', borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.028) }}>
                                            <Typography sx={{ color: 'primary.main', fontWeight: 800 }}>{number}</Typography>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>
                                                <Typography variant="caption" color="text.secondary">{description}</Typography>
                                            </Box>
                                        </Box>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </motion.div>
                )}

                {activeEntries.length >= 2 && leaderEntry && (
                    <motion.div
                        key="executive-summary"
                        layout={!reduceMotion}
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.24 }}
                    >
                        <Paper
                            component="section"
                            aria-labelledby="comparison-summary-title"
                            variant="outlined"
                            sx={{
                                mt: 2,
                                p: { xs: 2, md: 2.5 },
                                borderRadius: 3,
                                borderColor: alpha(theme.palette.primary.main, 0.35),
                                bgcolor: alpha(theme.palette.primary.main, 0.055),
                            }}
                        >
                            <Grid container spacing={2.5} alignItems="stretch">
                                <Grid size={{ xs: 12, lg: 5 }}>
                                    <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: '0.08em' }}>
                                        Comparison snapshot
                                    </Typography>
                                    <Typography id="comparison-summary-title" variant="h5" sx={{ mt: 0.5, fontWeight: 780, letterSpacing: '-0.025em' }}>
                                        {leaderEntry[1].displayName} leads
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 560 }}>
                                        {runnerUpEntry
                                            ? `${formatCurrency(leaderAdvantage)} ahead of ${runnerUpEntry[1].displayName}, a ${formatPercent(leaderAdvantagePercent)} revenue advantage.`
                                            : 'This campaign currently has the highest revenue in the comparison.'}
                                    </Typography>

                                    <Grid container spacing={1.25} sx={{ mt: 1.25 }}>
                                        <Grid size={{ xs: 6 }}>
                                            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.background.paper, 0.55) }}>
                                                <Typography variant="caption" color="text.secondary">Leader revenue</Typography>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 760 }}>{formatCurrency(leaderEntry[1].totalAmount)}</Typography>
                                            </Box>
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.background.paper, 0.55) }}>
                                                <Typography variant="caption" color="text.secondary">Leader avg. gift</Typography>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 760 }}>
                                                    {formatCurrency(leaderEntry[1].totalCount > 0 ? leaderEntry[1].totalAmount / leaderEntry[1].totalCount : 0)}
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Grid>

                                <Grid size={{ xs: 12, lg: 7 }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%', justifyContent: 'center' }}>
                                        {rankedEntries.map(([slotId, stats]) => {
                                            const definition = slotDefinitions[Number(slotId)];
                                            const width = Math.max((stats.totalAmount / maxAmount) * 100, stats.totalAmount > 0 ? 3 : 0);
                                            return (
                                                <Box key={slotId}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.55 }}>
                                                        <Typography variant="caption" sx={{ fontWeight: 680 }} noWrap>
                                                            {definition.label} · {stats.displayName}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ fontWeight: 760, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                            {formatCurrency(stats.totalAmount)}
                                                        </Typography>
                                                    </Box>
                                                    <Box sx={{ height: 7, borderRadius: 999, overflow: 'hidden', bgcolor: alpha(theme.palette.text.primary, 0.075) }}>
                                                        <Box
                                                            sx={{
                                                                width: '100%',
                                                                height: '100%',
                                                                borderRadius: 'inherit',
                                                                bgcolor: definition.color,
                                                                transform: `scaleX(${width / 100})`,
                                                                transformOrigin: 'left center',
                                                                transition: reduceMotion ? 'none' : theme.transitions.create('transform', { duration: 420 }),
                                                            }}
                                                        />
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>
                    </motion.div>
                )}
            </AnimatePresence>

            {activeEntries.length > 0 && (
                <Box component="section" aria-labelledby="comparison-results-title" sx={{ mt: 3 }}>
                    <Box sx={{ mb: 1.5 }}>
                        <Typography id="comparison-results-title" variant="h6" sx={{ fontWeight: 740 }}>Detailed results</Typography>
                        <Typography variant="body2" color="text.secondary">Review exact totals and open any form title to inspect its donors.</Typography>
                    </Box>
                    <Grid container spacing={2} alignItems="stretch" sx={{ opacity: loading.stats ? 0.58 : 1, transition: theme.transitions.create('opacity') }}>
                        <AnimatePresence mode="popLayout">
                            {activeEntries.map(([slotId, data]) => {
                                const numericSlotId = Number(slotId);
                                const definition = slotDefinitions[numericSlotId];
                                return (
                                    <Grid size={{ xs: 12, xl: 6 }} key={slotId}>
                                        <CampaignResultCard
                                            stats={data}
                                            roleLabel={definition.label}
                                            accentColor={definition.color}
                                            isLeader={leaderEntry?.[0] === slotId && activeEntries.length > 1}
                                            baselineAmount={baselineAmount}
                                            isBaseline={numericSlotId === 0}
                                            reduceMotion={reduceMotion}
                                            onFormTitleClick={handleOpenDonationModal}
                                        />
                                    </Grid>
                                );
                            })}
                        </AnimatePresence>
                    </Grid>
                </Box>
            )}

            <Dialog
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3, maxHeight: 'min(760px, calc(100vh - 48px))' } }}
            >
                <DialogTitle sx={{ pr: 7, fontWeight: 740 }}>
                    {modalTitle}
                    <IconButton
                        aria-label="Close donor details"
                        onClick={() => setModalOpen(false)}
                        sx={{ position: 'absolute', right: 12, top: 10 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    {loadingDonations ? (
                        <Box sx={{ p: 2.5 }}>
                            {[1, 2, 3, 4].map(row => <Skeleton key={row} height={48} />)}
                        </Box>
                    ) : (
                        <TableContainer sx={{ maxHeight: 560 }}>
                            <Table stickyHeader size="small" aria-label="Donation details">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Donor</TableCell>
                                        <TableCell>Email</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {donationDetails.length > 0 ? donationDetails.map(donation => (
                                        <TableRow key={donation.id}>
                                            <TableCell sx={{ fontWeight: 620 }}>{donation.donorName}</TableCell>
                                            <TableCell>{donation.donorEmail}</TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(donation.date).format('MMM D, YYYY · HH:mm')}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(donation.amount)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                                                No donations were found for this form title.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 1.5 }}>
                    <Button onClick={() => setModalOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default CampaignComparisonPage;
