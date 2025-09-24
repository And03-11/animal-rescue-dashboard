// frontend/src/pages/CampaignComparisonPage.tsx (Con Modal de Donantes)

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
  Autocomplete,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import apiClient from '../api/axiosConfig';
import { CombinedStatCard } from '../components/CombinedStatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import dayjs from 'dayjs';

// --- Interfaces de Datos ---
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

// ✅ 1. AÑADE LA INTERFAZ PARA LOS DETALLES DE DONACIÓN
interface DonationDetail {
  id: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  date: string;
}

// --- Funciones de Formateo ---
const formatCurrency = (amt: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt);

const formatCompactNumber = (num: number) => {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
};

// --- Componente de la Tarjeta de Campaña ---
// ✅ 2. AÑADE UN PROP PARA MANEJAR EL CLIC EN LA FILA
const CampaignResultCard: React.FC<{
  name: string;
  stats: CampaignStatsData;
  onFormTitleClick: (formTitleId: string, formTitleName: string) => void;
}> = ({ name, stats, onFormTitleClick }) => {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom noWrap title={name} sx={{textAlign: 'center', mb: 1}}>
        {name}
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <CombinedStatCard
          title=""
          metrics={[
            { value: formatCompactNumber(stats.campaign_total_amount), label: 'Total Amount', icon: <MonetizationOnIcon sx={{ fontSize: 32 }} /> },
            { value: stats.campaign_total_count.toString(), label: 'Donations', icon: <ReceiptLongIcon sx={{ fontSize: 32 }} /> }
          ]}
        />
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
        Form Title Breakdown
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Form Title</TableCell>
              <TableCell>First Donation</TableCell>
              <TableCell align="right">Donations</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.stats_by_form_title.map((row) => (
              // ✅ 3. AÑADE EL EVENTO ONCLICK Y EL ESTILO DEL CURSOR
              <TableRow 
                key={row.form_title_id} 
                hover 
                sx={{ cursor: 'pointer' }}
                onClick={() => onFormTitleClick(row.form_title_id, row.form_title_name)}
              >
                <TableCell component="th" scope="row">{row.form_title_name}</TableCell>
                <TableCell>{row.date_sent ? dayjs(row.date_sent).format('DD/MM/YYYY') : 'N/A'}</TableCell>
                <TableCell align="right">{row.donation_count}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {formatCurrency(row.total_amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

// --- Componente Principal de la Página ---
export const CampaignComparisonPage: React.FC = () => {
  const [allCampaigns, setAllCampaigns] = useState<ApiListItem[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<ApiListItem[]>([]);
  const [comparisonData, setComparisonData] = useState<Record<string, CampaignStatsData>>({});
  const [loading, setLoading] = useState({ list: true, stats: false });
  const [error, setError] = useState('');
  
  // ✅ 4. AÑADE LOS ESTADOS PARA EL MODAL
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [donationDetails, setDonationDetails] = useState<DonationDetail[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(false);

  // Lógica de carga de datos (sin cambios)
  useEffect(() => {
    const fetchAllCampaigns = async () => {
      setLoading(v => ({ ...v, list: true }));
      try {
        const sourcesRes = await apiClient.get<string[]>('/campaigns/sources');
        const campaignPromises = sourcesRes.data.map(source =>
          apiClient.get<ApiListItem[]>(`/campaigns?source=${encodeURIComponent(source)}`)
        );
        const campaignsBySource = await Promise.all(campaignPromises);
        const flatCampaigns = campaignsBySource.flatMap(res => res.data);
        setAllCampaigns(flatCampaigns);
      } catch {
        setError('Failed to load the list of campaigns.');
      } finally {
        setLoading(v => ({ ...v, list: false }));
      }
    };
    fetchAllCampaigns();
  }, []);

  const fetchStatsForSelection = useCallback(async () => {
    if (selectedCampaigns.length === 0) {
      setComparisonData({});
      return;
    }
    setLoading(v => ({ ...v, stats: true }));
    setError('');
    const statsPromises = selectedCampaigns.map(campaign =>
      apiClient.get<CampaignStatsData>(`/campaigns/${campaign.id}/stats`)
        .then(res => ({ id: campaign.id, data: res.data }))
        .catch(() => ({ id: campaign.id, data: null }))
    );
    try {
      const results = await Promise.all(statsPromises);
      const newData: Record<string, CampaignStatsData> = {};
      results.forEach(result => {
        if (result.data) {
          newData[result.id] = result.data;
        } else {
            setError(prev => prev + ` Could not load data for campaign ID ${result.id}.`);
        }
      });
      setComparisonData(newData);
    } catch {
      setError('An unexpected error occurred while fetching statistics.');
    } finally {
      setLoading(v => ({ ...v, stats: false }));
    }
  }, [selectedCampaigns]);

  useEffect(() => {
    fetchStatsForSelection();
  }, [fetchStatsForSelection]);
  
  // ✅ 5. AÑADE LA LÓGICA PARA ABRIR Y CARGAR EL MODAL
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
      // Opcional: mostrar un error dentro del modal
    } finally {
      setLoadingDonations(false);
    }
  };

  const handleCloseDonationModal = () => {
    setModalOpen(false);
  };

  const getGridSize = () => {
    const count = selectedCampaigns.length;
    if (count === 1) return { xs: 12, md: 12 };
    if (count >= 2) return { xs: 12, md: 6 };
    return {};
  };
  const gridItemSize = getGridSize();

  return (
    <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Campaign Comparison
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Select up to 4 campaigns to compare</Typography>
        <Autocomplete
          multiple
          limitTags={4}
          loading={loading.list}
          options={allCampaigns}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selectedCampaigns}
          onChange={(_event, newValue) => { if (newValue.length <= 4) setSelectedCampaigns(newValue); }}
          renderInput={(params) => (<TextField {...params} variant="outlined" label="Search and Select Campaigns" placeholder="Campaign name..."/>)}
          renderTags={(value, getTagProps) => value.map((option, index) => (<Chip label={option.name} {...getTagProps({ index })}/>))}
        />
        {selectedCampaigns.length >= 4 && (<Alert severity="info" sx={{mt: 2}}>You have reached the maximum of 4 campaigns for comparison.</Alert>)}
      </Paper>

      {loading.stats && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading.stats && selectedCampaigns.length === 0 && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Select one or more campaigns to see their statistics.</Typography></Paper>
      )}

      <Grid container spacing={3} alignItems="stretch">
        {selectedCampaigns.map(campaign => (
          comparisonData[campaign.id] && (
            <Grid size={gridItemSize} key={campaign.id}>
              {/* ✅ 6. PASA LA FUNCIÓN AL COMPONENTE HIJO */}
              <CampaignResultCard 
                name={campaign.name} 
                stats={comparisonData[campaign.id]}
                onFormTitleClick={handleOpenDonationModal}
              />
            </Grid>
          )
        ))}
      </Grid>
      
      {/* ✅ 7. AÑADE EL COMPONENTE DIALOG (MODAL) AL FINAL */}
      <Dialog open={modalOpen} onClose={handleCloseDonationModal} maxWidth="md" fullWidth>
        <DialogTitle>
          {modalTitle}
          <IconButton aria-label="close" onClick={handleCloseDonationModal} sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDonations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Donor Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {donationDetails.length > 0 ? donationDetails.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.donorName}</TableCell>
                      <TableCell>{d.donorEmail}</TableCell>
                      <TableCell>{dayjs(d.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                      <TableCell align="right">{formatCurrency(d.amount)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">No donations found for this form title.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDonationModal}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CampaignComparisonPage;