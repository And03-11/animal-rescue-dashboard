import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, ListItemText, OutlinedInput, Collapse,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme // Importar useTheme
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/axiosConfig';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// --- Interfaces (sin cambios) ---
interface ApiListItem { id: string; name: string; }
interface Donation {
  id: string;
  date: string;
  amount: number;
  donorName: string;
  donorEmail: string;
}
interface DonationData {
  donations: Donation[];
  totalAmount: number;
  donationsCount: number;
}

// --- Constantes para el menú (sin cambios) ---
const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 5.5 + ITEM_PADDING_TOP,
      width: 350,
    },
  },
};

export const FormTitleSearchPage = () => {
  const theme = useTheme(); // ✅ CAMBIO 1: Hook para acceder al tema de MUI
  const [sources, setSources] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [formTitles, setFormTitles] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [donationData, setDonationData] = useState<DonationData | null>(null);
  const [loading, setLoading] = useState({ sources: true, campaigns: false, titles: false, donations: false });
  const [error, setError] = useState('');

  // ... Lógica de carga de datos y búsqueda sin cambios ...
  useEffect(() => {
    setLoading(prev => ({ ...prev, sources: true }));
    apiClient.get<string[]>('/campaigns/sources')
      .then(res => setSources(res.data))
      .catch(() => setError('Failed to load sources.'))
      .finally(() => setLoading(prev => ({ ...prev, sources: false })));
  }, []);

  useEffect(() => {
    if (!selectedSource) return;
    setCampaigns([]); setFormTitles([]); setSelectedCampaign(''); setSelectedTitles([]);
    setLoading(prev => ({ ...prev, campaigns: true }));
    apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`)
      .then(res => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(prev => ({ ...prev, campaigns: false })));
  }, [selectedSource]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setFormTitles([]); setSelectedTitles([]);
    setLoading(prev => ({ ...prev, titles: true }));
    apiClient.get<ApiListItem[]>(`/form-titles?campaign_id=${selectedCampaign}`)
      .then(res => setFormTitles(res.data))
      .catch(() => setError('Failed to load form titles.'))
      .finally(() => setLoading(prev => ({ ...prev, titles: false })));
  }, [selectedCampaign]);

  const handleSearch = useCallback(async () => {
    if (selectedTitles.length === 0) {
      setError('Please select at least one form title to search.');
      return;
    }
    setLoading(prev => ({ ...prev, donations: true }));
    setError('');
    setDonationData(null);
    try {
      const params = new URLSearchParams();
      selectedTitles.forEach(titleId => params.append('form_title_id', titleId));
      if (startDate) params.append('start_date', startDate.format('YYYY-MM-DD'));
      if (endDate) params.append('end_date', endDate.format('YYYY-MM-DD'));

      const response = await apiClient.get<DonationData>(`/form-titles/donations?${params.toString()}`);
      setDonationData(response.data);
    } catch (err) {
      setError('Failed to fetch donation data.');
    } finally {
      setLoading(prev => ({ ...prev, donations: false }));
    }
  }, [selectedTitles, startDate, endDate]);

  return (
    <Box sx={{ width: '100%', maxWidth: '1280px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" component="h1">Advanced Donation Search</Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>Filters</Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ...otros Selects sin cambios... */}
          <FormControl fullWidth>
            <InputLabel>1. Select Source</InputLabel>
            <Select value={selectedSource} label="1. Select Source" onChange={(e) => setSelectedSource(e.target.value)} disabled={loading.sources}>
              {sources.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <Collapse in={!!selectedSource}>
            <FormControl fullWidth disabled={loading.campaigns}>
              <InputLabel>2. Select Campaign</InputLabel>
              <Select value={selectedCampaign} label="2. Select Campaign" onChange={(e) => setSelectedCampaign(e.target.value)}>
                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Collapse>
          
          <Collapse in={!!selectedCampaign}>
            <FormControl fullWidth disabled={loading.titles}>
              <InputLabel>3. Select Form Title(s)</InputLabel>
              <Select
                multiple
                value={selectedTitles}
                onChange={(e) => setSelectedTitles(e.target.value as string[])}
                input={<OutlinedInput label="3. Select Form Title(s)" />}
                renderValue={(selected) => {
                    const selectedNames = formTitles
                        .filter(ft => selected.includes(ft.id))
                        .map(ft => ft.name)
                        .join(', ');
                    return selectedNames || 'Select Form Title(s)';
                }}
                MenuProps={MenuProps}
              >
                {formTitles.map((t) => {
                  // ✅ CAMBIO 2: Determinar si el ítem está seleccionado
                  const isSelected = selectedTitles.indexOf(t.id) > -1;
                  return (
                    <MenuItem 
                      key={t.id} 
                      value={t.id}
                      // ✅ CAMBIO 3: Estilo condicional para el ítem
                      sx={{
                        fontWeight: isSelected ? theme.typography.fontWeightBold : theme.typography.fontWeightRegular,
                        backgroundColor: isSelected ? theme.palette.action.selected : 'transparent',
                        '&:hover': {
                          backgroundColor: isSelected ? theme.palette.action.selected : theme.palette.action.hover,
                        }
                      }}
                    >
                      {/* Se elimina el Checkbox */}
                      <ListItemText primary={t.name} />
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Collapse>

          <Collapse in={selectedTitles.length > 0}>
            <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 5 }}>
                <DatePicker label="Start Date (Optional)" value={startDate} onChange={setStartDate} sx={{ width: '100%' }} />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <DatePicker label="End Date (Optional)" value={endDate} onChange={setEndDate} sx={{ width: '100%' }} />
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Button fullWidth variant="contained" onClick={handleSearch} disabled={loading.donations} sx={{ height: '56px' }}>
                  {loading.donations ? <CircularProgress size={24} color="inherit" /> : 'Search'}
                </Button>
              </Grid>
            </Grid>
          </Collapse>
        </Box>
      </Paper>

      {/* ...el resto del componente para mostrar resultados no cambia... */}
      {loading.donations && <CircularProgress sx={{ alignSelf: 'center', mt: 2 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      
      {donationData && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="h5" gutterBottom>Results</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <StatCard title="Total Amount" value={`$${donationData.totalAmount.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
            <StatCard title="Number of Donations" value={`${donationData.donationsCount}`} icon={<ReceiptLongIcon sx={{ fontSize: 40 }} />} />
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{fontWeight: 'bold'}}>Donor</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}}>Email</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}}>Date</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}} align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {donationData.donations.map((donation) => (
                  <TableRow key={donation.id} hover>
                    <TableCell>{donation.donorName}</TableCell>
                    <TableCell>{donation.donorEmail}</TableCell>
                    <TableCell>{dayjs(donation.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                    <TableCell align="right">${donation.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default FormTitleSearchPage;