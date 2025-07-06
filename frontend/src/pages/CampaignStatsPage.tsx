import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, Typography, Paper, Divider, CircularProgress, Alert,
    FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import apiClient from '../api/apiClient';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// Interfaces
interface ApiListItem { id: string; name: string; }
interface FormTitleStat {
  name: string;
  totalAmount: number;
  donationsCount: number;
}
interface CampaignStatsData {
  formTitleStats: FormTitleStat[];
  grandTotalAmount: number;
  grandTotalCount: number;
}

export const CampaignStatsPage = () => {
  const [sources, setSources] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [statsData, setStatsData] = useState<CampaignStatsData | null>(null);
  const [loading, setLoading] = useState({ sources: true, campaigns: false, stats: false });
  const [error, setError] = useState('');

  // Cargar Sources
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

  // Cargar Campaigns
  useEffect(() => {
    if (!selectedSource) return;
    setCampaigns([]);
    setSelectedCampaign('');
    setStatsData(null);
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

  // Cargar Estadísticas
  useEffect(() => {
    if (!selectedCampaign) return;
    setStatsData(null);
    setLoading(prev => ({ ...prev, stats: true }));
    const fetchStats = async () => {
      try {
        const response = await apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats`);
        setStatsData(response.data);
      } catch (err) { setError('Failed to load campaign stats.'); }
      finally { setLoading(prev => ({ ...prev, stats: false })); }
    };
    fetchStats();
  }, [selectedCampaign]);

  return (
    <Box sx={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" component="h1">Campaign Statistics</Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>Filters</Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Source</InputLabel>
              <Select value={selectedSource} label="Source" onChange={(e) => setSelectedSource(e.target.value)} disabled={loading.sources}>
                {sources.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth disabled={!selectedSource || loading.campaigns}>
              <InputLabel>Campaign</InputLabel>
              <Select value={selectedCampaign} label="Campaign" onChange={(e) => setSelectedCampaign(e.target.value)}>
                {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {loading.stats && <CircularProgress sx={{ alignSelf: 'center', mt: 2 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      
      {statsData && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="h5" gutterBottom>Campaign Totals</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <StatCard title="Grand Total Amount" value={`$${statsData.grandTotalAmount.toFixed(2)}`} icon={<MonetizationOnIcon color="success" sx={{ fontSize: 40 }} />} />
            <StatCard title="Grand Total Donations" value={`${statsData.grandTotalCount}`} icon={<ReceiptLongIcon sx={{ fontSize: 40 }} />} />
          </Box>
          
          <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Breakdown by Form Title</Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={3}>
            <Grid item xs={12} lg={6}>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{fontWeight: 'bold'}}>Form Title</TableCell>
                      <TableCell sx={{fontWeight: 'bold'}} align="right">Total Amount</TableCell>
                      <TableCell sx={{fontWeight: 'bold'}} align="right"># Donations</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statsData.formTitleStats.map((stat) => (
                      <TableRow key={stat.name} hover>
                        <TableCell>{stat.name}</TableCell>
                        <TableCell align="right">${stat.totalAmount.toFixed(2)}</TableCell>
                        <TableCell align="right">{stat.donationsCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} lg={6}>
              <Box sx={{ height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData.formTitleStats} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }}/>
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="totalAmount" name="Total Amount" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};
