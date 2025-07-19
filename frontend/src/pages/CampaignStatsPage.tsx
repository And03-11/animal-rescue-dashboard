import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import CloseIcon from '@mui/icons-material/Close';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useWebSocket } from '../context/WebSocketProvider';

// --- Interfaces ---
interface ApiListItem {
  id: string;
  name: string;
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
interface DonationDetail {
  id: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  date: string;
}

export const CampaignStatsPage: React.FC = () => {
  // filtros
  const [sources, setSources] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  // estadísticas
  const [statsData, setStatsData] = useState<CampaignStatsData | null>(null);
  const [loading, setLoading] = useState({ sources: true, campaigns: false, stats: false });
  const [error, setError] = useState('');

  // estado del modal de donaciones
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [donationDetails, setDonationDetails] = useState<DonationDetail[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(false);
  const [errorDonations, setErrorDonations] = useState('');
  const { subscribe } = useWebSocket();

  // formatea USD
  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt);

  // ① cargar sources
  useEffect(() => {
    apiClient.get<string[]>('/campaigns/sources')
      .then(res => setSources(res.data))
      .catch(() => setError('Failed to load campaign sources.'))
      .finally(() => setLoading(v => ({ ...v, sources: false })));
  }, []);

  // ② cargar campaigns al cambiar source
  useEffect(() => {
    if (!selectedSource) {
      setCampaigns([]);
      setSelectedCampaign('');
      setStatsData(null);
      return;
    }
    setLoading(v => ({ ...v, campaigns: true }));
    apiClient.get<ApiListItem[]>(`/campaigns?source=${encodeURIComponent(selectedSource)}`)
      .then(res => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(v => ({ ...v, campaigns: false })));
  }, [selectedSource]);

  // ③ cargar estadísticas al cambiar campaign
  const fetchCampaignStats = useCallback(() => {
    if (!selectedCampaign) {
      setStatsData(null);
      return;
    }
    setLoading(v => ({ ...v, stats: true }));
    setError(''); // Limpia errores anteriores
    apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats`)
      .then(res => setStatsData(res.data))
      .catch(() => setError('Failed to load statistics.'))
      .finally(() => setLoading(v => ({ ...v, stats: false })));
  }, [selectedCampaign]); // Se recrea solo si selectedCampaign cambia

  // ③ cargar estadísticas usando la nueva función
  useEffect(() => {
    fetchCampaignStats();
  }, [fetchCampaignStats]);


  // <-- 5. AÑADE EL useEffect PARA LA SUSCRIPCIÓN DE WEBSOCKET -->
  useEffect(() => {
    const unsubscribe = subscribe('new_donation', () => {
      // Solo refresca si hay una campaña seleccionada
      if (selectedCampaign) {
        console.log(`Notification received! Refreshing stats for campaign: ${selectedCampaign}`);
        fetchCampaignStats();
      }
    });

    return () => unsubscribe(); // Limpieza
  }, [subscribe, selectedCampaign, fetchCampaignStats]);

  // abre el modal de donaciones
  const openDonationModal = (ftId: string, ftName: string) => {
    setModalTitle(ftName);
    setModalOpen(true);
    setLoadingDonations(true);
    setErrorDonations('');
    apiClient.get<DonationDetail[]>(`/campaigns/form-titles/${ftId}/donations`)
      .then(res => setDonationDetails(res.data))
      .catch(() => setErrorDonations('Failed to load donation details.'))
      .finally(() => setLoadingDonations(false));
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4">Campaign Performance Stats</Typography>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>Filters</Typography>
        <Divider sx={{ mb: 2 }} />
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>1. Select Source</InputLabel>
          <Select
            value={selectedSource}
            label="1. Select Source"
            onChange={e => setSelectedSource(e.target.value)}
          >
            {sources.map(src => <MenuItem key={src} value={src}>{src}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth disabled={loading.campaigns}>
          <InputLabel>2. Select Campaign</InputLabel>
          <Select
            value={selectedCampaign}
            label="2. Select Campaign"
            onChange={e => setSelectedCampaign(e.target.value)}
          >
            {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>

      {/* Loading & Error */}
      {loading.stats && <CircularProgress sx={{ alignSelf: 'center' }} />}
      {error && <Alert severity="error">{error}</Alert>}

      {/* Results */}
      {statsData && statsData.campaign_total_count > 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>Results</Typography>
          <Divider sx={{ mb: 3 }} />

          {/* StatCards */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', mb: 3 }}>
            <StatCard
              title="Campaign Grand Total"
              value={formatCurrency(statsData.campaign_total_amount)}
              icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />}
            />
            <StatCard
              title="Total Donations"
              value={statsData.campaign_total_count.toString()}
              icon={<ReceiptLongIcon color="action" sx={{ fontSize: 40 }} />}
            />
          </Box>

          {/* Tabla de Form Titles */}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Form Title</TableCell>
                  <TableCell align="right">Donations</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statsData.stats_by_form_title.map(row => (
                  <TableRow
                    key={row.form_title_id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => openDonationModal(row.form_title_id, row.form_title_name)}
                  >
                    <TableCell>{row.form_title_name}</TableCell>
                    <TableCell align="right">{row.donation_count}</TableCell>
                    <TableCell align="right">{formatCurrency(row.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Gráfico full-width */}
          <Paper variant="outlined" sx={{ width: '100%', height: 450, p: 2 }}>
            <Typography variant="h6" gutterBottom>Donations by Form Title</Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart
                data={statsData.stats_by_form_title}
                margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="form_title_name" angle={-45} textAnchor="end" interval={0} tick={{ fill: 'white', fontSize: 10 }} />
                <YAxis tickFormatter={tick => `$${tick.toLocaleString()}`} tick={{ fill: 'white' }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: 'rgba(255,255,255,0.1)' }} />
                <Bar dataKey="total_amount" fill="#38AECC" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Paper>
      )}

      {/* Modal de Donaciones */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2 }}>
          Donors for “{modalTitle}”
          <IconButton
            aria-label="close"
            onClick={() => setModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDonations
            ? <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress /></Box>
            : errorDonations
              ? <Alert severity="error">{errorDonations}</Alert>
              : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Donor Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {donationDetails.map(d => (
                      <TableRow key={d.id}>
                        <TableCell>{d.donorName}</TableCell>
                        <TableCell>{d.donorEmail}</TableCell>
                        <TableCell align="right">{formatCurrency(d.amount)}</TableCell>
                        <TableCell align="right">{new Date(d.date).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
          }
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};


export default CampaignStatsPage