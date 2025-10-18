// frontend/src/pages/CampaignComparisonPage.tsx

import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import apiClient from '../api/axiosConfig';
import { CombinedStatCard } from '../components/CombinedStatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import dayjs from 'dayjs';
import { CampaignSelectorSlot, VIEW_ALL_CAMPAIGNS, type ApiListItem, type CampaignSelection } from '../components/CampaignSelectorSlot';

// --- Interfaces ---
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

interface DonationDetail { id: string; donorName: string; donorEmail: string; amount: number; date: string; }

interface SlotSelection {
  source: string | null;
  campaign: CampaignSelection;
}


// --- Formatting and Child Component ---
const formatCurrency = (amt: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt);
const formatCompactNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
};

const CampaignResultCard: React.FC<{ stats: ComparisonStatsData; onFormTitleClick: (formTitleId: string, formTitleName: string) => void; }> = ({ stats, onFormTitleClick }) => (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" gutterBottom noWrap title={stats.displayName} sx={{textAlign: 'center', mb: 1}}>{stats.displayName}</Typography>
        <Box sx={{ mb: 2 }}>
            <CombinedStatCard title="" metrics={[
                { value: formatCompactNumber(stats.totalAmount), label: 'Total Amount', icon: <MonetizationOnIcon sx={{ fontSize: 32 }} /> },
                { value: stats.totalCount.toString(), label: 'Donations', icon: <ReceiptLongIcon sx={{ fontSize: 32 }} /> }
            ]}/>
        </Box>
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
            {stats.viewType === 'form-title' ? 'Form Title Breakdown' : 'Campaign Breakdown'}
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1, maxHeight: 450 }}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{stats.viewType === 'form-title' ? 'Form Title' : 'Campaign'}</TableCell>
                        <TableCell>Start Date</TableCell>
                        <TableCell align="right">#</TableCell>
                        <TableCell align="right">Amount</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(stats.breakdown || []).map((row) => (
                        <TableRow 
                            key={row.id} 
                            hover 
                            sx={{ cursor: stats.viewType === 'form-title' ? 'pointer' : 'default' }} 
                            onClick={() => stats.viewType === 'form-title' && onFormTitleClick(row.id, row.name)}
                        >
                            <TableCell component="th" scope="row">{row.name}</TableCell>
                            <TableCell>{row.start_date ? dayjs(row.start_date).format('DD/MM/YY') : 'N/A'}</TableCell>
                            <TableCell align="right">{row.donation_count}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(row.total_amount)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    </Paper>
);

// --- Main Page Component ---
export const CampaignComparisonPage: React.FC = () => {
    const [sources, setSources] = useState<ApiListItem[]>([]);
    const [selectedSlots, setSelectedSlots] = useState<SlotSelection[]>(Array(4).fill({ source: null, campaign: null }));
    const [comparisonData, setComparisonData] = useState<Record<number, ComparisonStatsData | null>>({});
    const [loading, setLoading] = useState({ sources: true, stats: false });
    const [error, setError] = useState('');
    
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [donationDetails, setDonationDetails] = useState<DonationDetail[]>([]);
    const [loadingDonations, setLoadingDonations] = useState(false);

    useEffect(() => {
        apiClient.get<string[]>('/campaigns/sources')
            .then(res => setSources(res.data.map(s => ({ id: s, name: s }))))
            .catch(() => setError('Failed to load sources.'))
            .finally(() => setLoading(v => ({ ...v, sources: false })));
    }, []);

    const handleSelectionChange = (slotId: number, source: string | null, campaign: CampaignSelection) => {
        setSelectedSlots(prev => {
            const newSelection = [...prev];
            newSelection[slotId - 1] = { source, campaign };
            return newSelection;
        });
    };

    useEffect(() => {
        const slotsToFetch = selectedSlots
            .map((slot, index) => ({ ...slot, slotId: index }))
            .filter(slot => slot.source && slot.campaign);

        if (slotsToFetch.length === 0) {
            setComparisonData({});
            return;
        }

        const fetchStats = async () => {
            setLoading(v => ({ ...v, stats: true }));
            setError('');

            const statsPromises = slotsToFetch.map(async (slot) => {
                const { source, campaign, slotId } = slot;
                if (!source || !campaign) return { slotId, data: null };

                try {
                    let url = '';
                    let displayName = 'Data';
                    const isAllCampaignsView = campaign === VIEW_ALL_CAMPAIGNS;
                    
                    if (isAllCampaignsView) {
                        url = `/campaigns/source/${source}/stats`;
                        displayName = `${source} (All Campaigns)`;
                    } else if (typeof campaign === 'object' && campaign.id) {
                        url = `/campaigns/${campaign.id}/stats`;
                        displayName = campaign.name;
                    } else {
                        return { slotId, data: null };
                    }

                    const res = await apiClient.get(url);
                    
                    const rawBreakdown = res.data.stats_by_campaign ?? res.data.stats_by_form_title;
                    
                    const transformedBreakdown = rawBreakdown.map((item: any) => ({
                        id: item.campaign_id ?? item.form_title_id,
                        name: item.campaign_name ?? item.form_title_name,
                        total_amount: item.total_amount,
                        donation_count: item.donation_count,
                        start_date: item.start_date ?? item.createdTime,
                    }));

                    const transformedData: ComparisonStatsData = {
                        totalAmount: res.data.source_total_amount ?? res.data.campaign_total_amount,
                        totalCount: res.data.source_total_count ?? res.data.campaign_total_count,
                        breakdown: transformedBreakdown,
                        viewType: isAllCampaignsView ? 'campaign' : 'form-title',
                        displayName: displayName,
                    };
                    return { slotId, data: transformedData };
                } catch {
                    return { slotId, data: null };
                }
            });
            
            try {
                const results = await Promise.all(statsPromises);
                const newData: Record<number, ComparisonStatsData | null> = {};
                results.forEach(result => {
                    newData[result.slotId] = result.data;
                });
                setComparisonData(newData);
            } catch {
                setError('An unexpected error occurred while fetching statistics.');
            } finally {
                setLoading(v => ({ ...v, stats: false }));
            }
        };

        fetchStats();
    }, [selectedSlots]);
    
    const handleOpenDonationModal = async (formTitleId: string, formTitleName: string) => {
        setModalTitle(`Donors for "${formTitleName}"`);
        setModalOpen(true);
        setLoadingDonations(true);
        apiClient.get<DonationDetail[]>(`/campaigns/form-titles/${formTitleId}/donations`)
            .then(res => setDonationDetails(res.data))
            .catch(() => console.error("Failed to load donation details"))
            .finally(() => setLoadingDonations(false));
    };
    const handleCloseDonationModal = () => setModalOpen(false);
    
    const activeSlots = Object.values(comparisonData).filter(Boolean);

    return (
        <Box sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
            <Typography variant="h4" component="h1" gutterBottom>Campaign Comparison</Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
                {[1, 2, 3, 4].map(slotId => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={slotId}>
                        <CampaignSelectorSlot
                            slotId={slotId}
                            sources={sources}
                            onSelectionChange={handleSelectionChange}
                            selectedSource={selectedSlots[slotId - 1]?.source}
                            selectedCampaign={selectedSlots[slotId - 1]?.campaign}
                        />
                    </Grid>
                ))}
            </Grid>

            {loading.stats && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}
            {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
            {!loading.stats && activeSlots.length === 0 && (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">Select a source and a view in one or more slots to compare statistics.</Typography>
                </Paper>
            )}

            <Grid container spacing={3} alignItems="stretch">
                {Object.entries(comparisonData).map(([slotId, data]) => (
                    data && (
                        <Grid size={{ xs: 12, md: 6 }} key={slotId}>
                            <CampaignResultCard stats={data} onFormTitleClick={handleOpenDonationModal} />
                        </Grid>
                    )
                ))}
            </Grid>
            
            <Dialog open={modalOpen} onClose={handleCloseDonationModal} maxWidth="md" fullWidth>
                <DialogTitle>
                    {modalTitle}
                    <IconButton aria-label="close" onClick={handleCloseDonationModal} sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                     {loadingDonations ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead><TableRow><TableCell>Donor Name</TableCell><TableCell>Email</TableCell><TableCell>Date</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                                <TableBody>
                                    {donationDetails.length > 0 ? donationDetails.map(d => (
                                        <TableRow key={d.id}><TableCell>{d.donorName}</TableCell><TableCell>{d.donorEmail}</TableCell><TableCell>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell><TableCell align="right">{formatCurrency(d.amount)}</TableCell></TableRow>
                                    )) : <TableRow><TableCell colSpan={4} align="center">No donations found for this item.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={handleCloseDonationModal}>Close</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default CampaignComparisonPage;