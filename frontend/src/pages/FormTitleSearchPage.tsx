import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, Typography, Paper, Divider, Button, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Collapse
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/apiClient';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// Interfaces actualizadas
interface ApiListItem { id: string; name: string; }
interface Donation {
  id: string;
  date: string;
  amount: number;
  donorName: string;
  donorEmail: string; // <-- Nuevo campo para el email del donante
}
interface DonationData {
  donations: Donation[];
  totalAmount: number;
  donationsCount: number;
}

export const FormTitleSearchPage = () => {
  // La lógica de estado y de fetch no necesita cambios
  const [sources, setSources] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [formTitles, setFormTitles] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [donationData, setDonationData] = useState<DonationData | null>(null);
  const [loading, setLoading] = useState({ sources: true, campaigns: false, titles: false, donations: false });
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await apiClient.get<string[]>('/campaigns/sources');
        setSources(response.data);
      } catch (err) { setError('Failed to load sources.'); } 
      finally { setLoading(prev => ({ ...prev, sources: false })); }
    };
    fetchSources();
  }, []);

  useEffect(() => {
    if (!selectedSource) return;
    setCampaigns([]); setFormTitles([]); setSelectedCampaign(''); setSelectedTitle('');
    setLoading(prev => ({ ...prev, campaigns: true }));
    const fetchCampaigns = async () => {
      try {
        const response = await apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`);
        setCampaigns(response.data);
      } catch (err) { setError('Failed to load campaigns.'); }
      finally { setLoading(prev => ({ ...prev, campaigns: false })); }
    };
    fetchCampaigns();
  }, [selectedSource]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setFormTitles([]); setSelectedTitle('');
    setLoading(prev => ({ ...prev, titles: true }));
    const fetchFormTitles = async () => {
      try {
        const response = await apiClient.get<ApiListItem[]>(`/form-titles?campaign_id=${selectedCampaign}`);
        setFormTitles(response.data);
      } catch (err) { setError('Failed to load form titles.'); }
      finally { setLoading(prev => ({ ...prev, titles: false })); }
    };
    fetchFormTitles();
  }, [selectedCampaign]);

  const handleSearch = useCallback(async () => {
    if (!selectedTitle) { setError('Please select a form title to search.'); return; }
    setLoading(prev => ({ ...prev, donations: true }));
    setError('');
    setDonationData(null);
    try {
      const params = new URLSearchParams({ form_title_id: selectedTitle });
      if (startDate) params.append('start_date', startDate.format('YYYY-MM-DD'));
      if (endDate) params.append('end_date', endDate.format('YYYY-MM-DD'));
      const response = await apiClient.get<DonationData>(`/form-titles/donations?${params.toString()}`);
      setDonationData(response.data);
    } catch (err) { setError('Failed to fetch donation data.'); }
    finally { setLoading(prev => ({ ...prev, donations: false })); }
  }, [selectedTitle, startDate, endDate]);

  return (
    <Box sx={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" component="h1">Advanced Donation Search</Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>Filters</Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Step 1: Source */}
          <FormControl fullWidth>
            <InputLabel>1. Select Source</InputLabel>
            <Select value={selectedSource} label="1. Select Source" onChange={(e) => setSelectedSource(e.target.value)} disabled={loading.sources}>
              {sources.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Step 2: Campaign */}
          <Collapse in={!!selectedSource}>
            <FormControl fullWidth disabled={loading.campaigns}>
              <InputLabel>2. Select Campaign</InputLabel>
              <Select value={selectedCampaign} label="2. Select Campaign" onChange={(e) => setSelectedCampaign(e.target.value)}>
                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Collapse>

          {/* Step 3: Form Title */}
          <Collapse in={!!selectedCampaign}>
            <FormControl fullWidth disabled={loading.titles}>
              <InputLabel>3. Select Form Title</InputLabel>
              <Select value={selectedTitle} label="3. Select Form Title" onChange={(e) => setSelectedTitle(e.target.value)}>
                {formTitles.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Collapse>

          {/* Step 4: Dates and Search */}
          <Collapse in={!!selectedTitle}>
            <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
              <Grid item xs={12} sm={5}>
                <DatePicker label="Start Date (Optional)" value={startDate} onChange={setStartDate} sx={{ width: '100%' }} />
              </Grid>
              <Grid item xs={12} sm={5}>
                <DatePicker label="End Date (Optional)" value={endDate} onChange={setEndDate} sx={{ width: '100%' }} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="contained" onClick={handleSearch} disabled={loading.donations} sx={{ height: '56px' }}>
                  {loading.donations ? <CircularProgress size={24} color="inherit" /> : 'Search'}
                </Button>
              </Grid>
            </Grid>
          </Collapse>
        </Box>
      </Paper>

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
                  {/* ¡COLUMNAS REORDENADAS! */}
                  <TableCell sx={{fontWeight: 'bold'}}>Donor</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}}>Email</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}}>Date</TableCell>
                  <TableCell sx={{fontWeight: 'bold'}} align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {donationData.donations.map((donation) => (
                  <TableRow key={donation.id} hover>
                    {/* ¡CELDAS REORDENADAS! */}
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

export default FormTitleSearchPage
