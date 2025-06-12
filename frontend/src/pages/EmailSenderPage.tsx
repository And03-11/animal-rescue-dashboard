// src/pages/EmailSenderPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, CircularProgress, Alert, Snackbar,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogActions, DialogContent, DialogTitle, TextField,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Checkbox, Chip,
  Container, Link, LinearProgress
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import apiClient from '../api/apiClient';
import { ToggleButtonGroup, ToggleButton } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { EmailPreview } from '../components/EmailPreview';

// --- Componente del Formulario para Crear Campañas (Completo) ---
// Reemplaza el componente CampaignForm en src/pages/EmailSenderPage.tsx
const CampaignForm: React.FC<{ onSave: (campaign: any) => void; onCancel: () => void; }> = ({ onSave, onCancel }) => {
  const [region, setRegion] = useState('USA');
  const [isBounced, setIsBounced] = useState(false);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('<h1>New Campaign</h1>\n<p>Write your content here.</p>');
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');

  const handleSave = () => {
    onSave({ region, is_bounced: isBounced, subject, html_body: htmlBody });
  };

  const handleViewChange = (event: React.MouseEvent<HTMLElement>, newViewMode: 'code' | 'preview' | null) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  return (
    <>
      <DialogTitle>Create New Campaign</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend">Target Region</FormLabel>
          <RadioGroup row value={region} onChange={(e) => setRegion(e.target.value)}>
            <FormControlLabel value="USA" control={<Radio />} label="USA" />
            <FormControlLabel value="EUR" control={<Radio />} label="EUR" />
            <FormControlLabel value="TEST" control={<Radio />} label="TEST" />
          </RadioGroup>
        </FormControl>
        <FormControlLabel control={<Checkbox checked={isBounced} onChange={(e) => setIsBounced(e.target.checked)} />} label="Target Bounced Accounts Only" />
        <TextField fullWidth label="Email Subject" variant="outlined" value={subject} onChange={(e) => setSubject(e.target.value)} margin="normal" />

        <Box sx={{display: 'flex', justifyContent: 'flex-end', my: 1}}>
            <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewChange} size="small">
                <ToggleButton value="code" aria-label="code view"><CodeIcon sx={{mr:1}}/> Code</ToggleButton>
                <ToggleButton value="preview" aria-label="preview"><VisibilityIcon sx={{mr:1}}/> Preview</ToggleButton>
            </ToggleButtonGroup>
        </Box>

        {viewMode === 'code' ? (
            <TextField fullWidth label="Email Body (HTML)" variant="outlined" multiline rows={10} value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} />
        ) : (
            <EmailPreview subject={subject} htmlBody={htmlBody} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save Campaign</Button>
      </DialogActions>
    </>
  );
};


// --- Componente Principal de la Página (Completo) ---
export const EmailSenderPage = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const response = await apiClient.get('/sender/campaigns');
      setCampaigns(response.data);
    } catch (err) {
      setError('Failed to load campaigns.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    const isCampaignSending = campaigns.some(c => c.status === 'Sending');
    if (!isCampaignSending) return;

    const intervalId = setInterval(() => {
      console.log("Polling for campaign updates...");
      fetchCampaigns();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [campaigns, fetchCampaigns]);


  const handleSaveCampaign = async (campaignData: any) => {
    try {
      await apiClient.post('/sender/campaigns', campaignData);
      setIsModalOpen(false);
      setSnackbarMessage('Campaign saved successfully!');
      fetchCampaigns();
    } catch (err) {
      setError('Failed to save campaign.');
    }
  };

  const handleLaunchCampaign = async (campaignId: string) => {
    try {
      const response = await apiClient.post(`/sender/campaigns/${campaignId}/launch`);
      setSnackbarMessage(response.data.message || 'Campaign launch initiated!');
      setTimeout(fetchCampaigns, 1000); 
    } catch (err) {
      setError('Failed to launch campaign.');
    }
  };
  
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Campaign Manager
        </Typography>
        <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => setIsModalOpen(true)}>
          Create New Campaign
        </Button>
      </Box>

      <Paper variant="outlined">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Created At</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{minWidth: 200}}>Progress</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id} hover>
                  <TableCell>{new Date(campaign.createdAt).toLocaleString('en-US')}</TableCell>
                  
                  {/* Celda del Asunto con el Enlace */}
                  <TableCell sx={{fontWeight: 500}}>
                    <Link component={RouterLink} to={`/campaign/${campaign.id}`} underline="hover" color="inherit">
                      {campaign.subject}
                    </Link>
                  </TableCell>

                  <TableCell>{campaign.region} (Bounced: {campaign.is_bounced ? 'Yes' : 'No'})</TableCell>
                  <TableCell>
                    <Chip label={campaign.status} color={campaign.status === 'Completed' ? 'success' : campaign.status === 'Sending' ? 'warning' : 'default'} size="small"/>
                  </TableCell>
                  <TableCell>
                    {campaign.progress && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', mr: 1 }}>
                          <LinearProgress variant="determinate" value={campaign.progress.percentage} color="primary" />
                        </Box>
                        <Box sx={{ minWidth: 70 }}>
                          <Typography variant="body2" color="text.secondary">{`${campaign.progress.sent} / ${campaign.progress.total}`}</Typography>
                        </Box>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button 
                      variant="outlined" 
                      size="small" 
                      startIcon={<RocketLaunchIcon />}
                      onClick={() => handleLaunchCampaign(campaign.id)}
                      disabled={campaign.status === 'Sending' || (campaign.status === 'Completed' && campaign.progress?.sent === campaign.progress?.total)}
                    >
                      {campaign.status === 'Sending' ? 'Sending...' : 'Launch'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} fullWidth maxWidth="md">
        <CampaignForm onSave={handleSaveCampaign} onCancel={() => setIsModalOpen(false)} />
      </Dialog>
      
      <Snackbar open={!!snackbarMessage} autoHideDuration={6000} onClose={() => setSnackbarMessage(null)} message={snackbarMessage} />
    </Container>
  );
};