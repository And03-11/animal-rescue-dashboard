import React, { useState, useEffect } from 'react';
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
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse
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
import apiClient from '../api/apiClient';
import { StatCard } from '../components/StatCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// --- Interfaces ---
interface ApiListItem {
  id: string;
  name: string;
}
interface CampaignStatsData {
  campaign_total_amount: number;
  campaign_total_count: number;
  stats_by_form_title: {
    form_title_name: string;
    total_amount: number;
    donation_count: number;
  }[];
}

export const CampaignStatsPage: React.FC = () => {
  const [sources, setSources] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [statsData, setStatsData] = useState<CampaignStatsData | null>(null);
  const [loading, setLoading] = useState({
    sources: true,
    campaigns: false,
    stats: false
  });
  const [error, setError] = useState('');

  // Fetch sources
  useEffect(() => {
    setLoading(v => ({ ...v, sources: true }));
    apiClient.get<string[]>('/campaigns/sources')
      .then(res => setSources(res.data))
      .catch(() => setError('Failed to load campaign sources.'))
      .finally(() => setLoading(v => ({ ...v, sources: false })));
  }, []);

  // Fetch campaigns when source changes
  useEffect(() => {
    if (!selectedSource) {
      setCampaigns([]);
      setSelectedCampaign('');
      setStatsData(null);
      return;
    }
    setLoading(v => ({ ...v, campaigns: true }));
    apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`)
      .then(res => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(v => ({ ...v, campaigns: false })));
  }, [selectedSource]);

  // Fetch stats when campaign changes
  useEffect(() => {
    if (!selectedCampaign) {
      setStatsData(null);
      return;
    }
    setLoading(v => ({ ...v, stats: true }));
    apiClient.get<CampaignStatsData>(`/campaigns/${selectedCampaign}/stats`)
      .then(res => setStatsData(res.data))
      .catch(() => setError('Failed to load statistics.'))
      .finally(() => setLoading(v => ({ ...v, stats: false })));
  }, [selectedCampaign]);

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amt);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1200,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      <Typography variant="h4">Campaign Performance Stats</Typography>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>
          Filters
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>1. Select Source</InputLabel>
            <Select
              value={selectedSource}
              label="1. Select Source"
              onChange={e => setSelectedSource(e.target.value)}
            >
              {sources.map(src => (
                <MenuItem key={src} value={src}>
                  {src}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Collapse in={!!selectedSource} timeout="auto" unmountOnExit>
            <FormControl fullWidth disabled={loading.campaigns}>
              <InputLabel>2. Select Campaign</InputLabel>
              <Select
                value={selectedCampaign}
                label="2. Select Campaign"
                onChange={e => setSelectedCampaign(e.target.value)}
              >
                {campaigns.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Collapse>
        </Box>
      </Paper>

      {/* Loading & Error */}
      {loading.stats && <CircularProgress sx={{ alignSelf: 'center' }} />}
      {error && <Alert severity="error">{error}</Alert>}

      {/* Results */}
      {statsData && statsData.campaign_total_count > 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Results
          </Typography>
          <Divider sx={{ mb: 3 }} />

          {/* 1️⃣ StatCards */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 3,
              justifyContent: 'center',
              mb: 3
            }}
          >
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

          {/* 2️⃣ Tabla centrada y más ancha */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                width: '80%',       // ocupa el 80% del contenedor
                maxWidth: 800,      // pero como máximo 800px
                height: 450,
                mx: 'auto'
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      Form Title
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 'bold' }}
                    >
                      Donations
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 'bold' }}
                    >
                      Amount
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {statsData.stats_by_form_title.map(row => (
                    <TableRow hover key={row.form_title_name}>
                      <TableCell component="th" scope="row">
                        {row.form_title_name}
                      </TableCell>
                      <TableCell align="right">
                        {row.donation_count}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(row.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* 3️⃣ Gráfico full-width */}
          <Box sx={{ width: '100%' }}>
            <Paper
              variant="outlined"
              sx={{
                width: '100%',
                height: 450,
                p: 2,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <Typography variant="h6" gutterBottom>
                Donations by Form Title
              </Typography>
              <Box sx={{ flex: 1, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statsData.stats_by_form_title}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis
                      dataKey="form_title_name"
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      tick={{ fill: 'white', fontSize: 10 }}
                    />
                    <YAxis
                      tickFormatter={tick =>
                        `$${tick.toLocaleString()}`
                      }
                      tick={{ fill: 'white' }}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        formatCurrency(value)
                      }
                      cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                      contentStyle={{
                        backgroundColor: 'rgba(13,27,42,0.8)',
                        border: '1px solid rgba(56,174,204,0.2)'
                      }}
                    />
                    <Bar dataKey="total_amount" fill="#38AECC" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Box>
        </Paper>
      )}
    </Box>
  );
};
