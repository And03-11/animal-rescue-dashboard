// frontend/src/pages/CampaignComparisonPage.tsx (Con Scroll en la Tabla)
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
import { CampaignSelectorSlot } from '../components/CampaignSelectorSlot';

// --- Interfaces ---
interface ApiListItem {
  id: string;
  name: string;
}
interface FormTitleStat {
  form_title_id: string;
  form_title_name: string;
  total_amount: number;
  donation_count: number;
  date_sent: string;
}
interface CampaignStatsData {
  campaign_total_amount: number;
  campaign_total_count: number;
  stats_by_form_title: FormTitleStat[];
}
interface DonationDetail {
  id: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  date: string;
}

// --- Funciones de Formateo ---
const formatCurrency = (amt: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt);
const formatCompactNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
};

// --- Componente de la Tarjeta de Campaña (con la corrección de robustez) ---
const CampaignResultCard: React.FC<{ name: string; stats: CampaignStatsData; onFormTitleClick: (formTitleId: string, formTitleName: string) => void; }> = ({ name, stats, onFormTitleClick }) => (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" gutterBottom noWrap title={name} sx={{textAlign: 'center', mb: 1}}>{name}</Typography>
        <Box sx={{ mb: 2 }}>
            <CombinedStatCard title="" metrics={[
                { value: formatCompactNumber(stats.campaign_total_amount), label: 'Total Amount', icon: <MonetizationOnIcon sx={{ fontSize: 32 }} /> },
                { value: stats.campaign_total_count.toString(), label: 'Donations', icon: <ReceiptLongIcon sx={{ fontSize: 32 }} /> }
            ]}/>
        </Box>
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Form Title Breakdown</Typography>
        {/* ✅ CAMBIO CLAVE: Se añade 'maxHeight' para habilitar el scroll interno */}
        <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1, maxHeight: 450 }}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Form Title</TableCell>
                        <TableCell>First Donation</TableCell>
                        <TableCell align="right">#</TableCell>
                        <TableCell align="right">Amount</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(stats.stats_by_form_title || []).map((row) => (
                        <TableRow key={row.form_title_id} hover sx={{ cursor: 'pointer' }} onClick={() => onFormTitleClick(row.form_title_id, row.form_title_name)}>
                            <TableCell component="th" scope="row">{row.form_title_name}</TableCell>
                            <TableCell>{row.date_sent ? dayjs(row.date_sent).format('DD/MM/YY') : 'N/A'}</TableCell>
                            <TableCell align="right">{row.donation_count}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(row.total_amount)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    </Paper>
);

// --- Componente Principal de la Página (MODIFICADO) ---
export const CampaignComparisonPage: React.FC = () => {
    const [sources, setSources] = useState<ApiListItem[]>([]);
    const [selectedCampaigns, setSelectedCampaigns] = useState<(ApiListItem | null)[]>(Array(4).fill(null));
    const [comparisonData, setComparisonData] = useState<Record<string, CampaignStatsData>>({});
    const [loading, setLoading] = useState({ sources: true, stats: false });
    const [error, setError] = useState('');
    
    // Estados para el modal (sin cambios)
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [donationDetails, setDonationDetails] = useState<DonationDetail[]>([]);
    const [loadingDonations, setLoadingDonations] = useState(false);

    // Cargar todas las "Sources" una sola vez al montar el componente
    useEffect(() => {
        const fetchSources = async () => {
            setLoading(v => ({ ...v, sources: true }));
            try {
                const response = await apiClient.get<string[]>('/campaigns/sources');
                setSources(response.data.map(s => ({ id: s, name: s })));
            } catch {
                setError('Failed to load the list of sources.');
            } finally {
                setLoading(v => ({ ...v, sources: false }));
            }
        };
        fetchSources();
    }, []);

    // Callback para manejar la selección de una campaña desde un slot
    const handleCampaignChange = (slotId: number, campaign: ApiListItem | null) => {
        setSelectedCampaigns(prev => {
            const newSelection = [...prev];
            newSelection[slotId - 1] = campaign;
            return newSelection;
        });
    };

    // Efecto para cargar las estadísticas de las campañas seleccionadas
    useEffect(() => {
        const campaignsToFetch = selectedCampaigns.filter((c): c is ApiListItem => c !== null);

        if (campaignsToFetch.length === 0) {
            setComparisonData({});
            return;
        }

        const fetchStats = async () => {
            setLoading(v => ({ ...v, stats: true }));
            setError('');

            const statsPromises = campaignsToFetch.map(campaign =>
                apiClient.get<CampaignStatsData>(`/campaigns/${campaign.id}/stats`)
                    .then(res => ({ id: campaign.id, data: res.data, name: campaign.name }))
                    .catch(() => ({ id: campaign.id, data: null, name: campaign.name }))
            );
            
            try {
                const results = await Promise.all(statsPromises);
                const newData: Record<string, CampaignStatsData> = {};
                const newErrors: string[] = [];

                results.forEach(result => {
                    if (result.data) {
                        newData[result.id] = result.data;
                    } else {
                        newErrors.push(`Could not load data for campaign "${result.name}".`);
                    }
                });
                
                // Actualiza el estado de los datos y los errores
                setComparisonData(prevData => {
                    const updatedData = { ...prevData };
                    campaignsToFetch.forEach(c => {
                        if (newData[c.id]) {
                            updatedData[c.id] = newData[c.id];
                        }
                    });
                     // Limpia datos de campañas que ya no están seleccionadas
                    Object.keys(updatedData).forEach(key => {
                        if (!campaignsToFetch.some(c => c.id === key)) {
                            delete updatedData[key];
                        }
                    });
                    return updatedData;
                });

                if (newErrors.length > 0) {
                    setError(newErrors.join(' '));
                }

            } catch {
                setError('An unexpected error occurred while fetching statistics.');
            } finally {
                setLoading(v => ({ ...v, stats: false }));
            }
        };

        fetchStats();
    }, [selectedCampaigns]);

    // Lógica para abrir y cargar el modal (sin cambios)
    const handleOpenDonationModal = async (formTitleId: string, formTitleName: string) => {
        setModalTitle(`Donors for "${formTitleName}"`);
        setModalOpen(true);
        setLoadingDonations(true);
        setDonationDetails([]);
        try {
            const response = await apiClient.get<DonationDetail[]>(`/campaigns/form-titles/${formTitleId}/donations`);
            setDonationDetails(response.data);
        } catch (error) {
            console.error("Failed to load donation details", error);
        } finally {
            setLoadingDonations(false);
        }
    };
    const handleCloseDonationModal = () => setModalOpen(false);

    const activeCampaigns = selectedCampaigns.filter(Boolean);
    const getGridSize = () => {
        switch (activeCampaigns.length) {
            case 1: return { xs: 12, md: 12 };
            case 2: return { xs: 12, md: 6 };
            case 3: return { xs: 12, md: 6, lg: 4 };
            case 4: return { xs: 12, md: 6 };
            default: return {};
        }
    };
    const gridItemSize = getGridSize();

    return (
        <Box sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
            <Typography variant="h4" component="h1" gutterBottom>Campaign Comparison</Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
                {[1, 2, 3, 4].map(slotId => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={slotId}>
                        <CampaignSelectorSlot
                            slotId={slotId}
                            sources={sources}
                            onCampaignChange={handleCampaignChange}
                            selectedCampaignId={selectedCampaigns[slotId - 1]?.id || null}
                        />
                    </Grid>
                ))}
            </Grid>

            {loading.stats && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}
            {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
            {!loading.stats && activeCampaigns.length === 0 && (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">Select one or more campaigns using the selectors above to see their statistics.</Typography>
                </Paper>
            )}

            <Grid container spacing={3} alignItems="stretch">
                {activeCampaigns.map(campaign => (
                    campaign && comparisonData[campaign.id] && (
                        <Grid size={gridItemSize} key={campaign.id}>
                            <CampaignResultCard name={campaign.name} stats={comparisonData[campaign.id]} onFormTitleClick={handleOpenDonationModal} />
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
                                    )) : <TableRow><TableCell colSpan={4} align="center">No donations found for this form title.</TableCell></TableRow>}
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