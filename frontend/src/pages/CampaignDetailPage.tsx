// src/pages/CampaignDetailPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { 
  Box, Typography, CircularProgress, Alert, Paper, Table, 
  TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Breadcrumbs, Link, Chip, Divider 
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import apiClient from '../api/apiClient';

export const CampaignDetailPage = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaignDetails = useCallback(async () => {
    if (!campaignId) return;
    // No mostramos el 'loading' en los refrescos para una experiencia más suave
    // setLoading(true); 
    try {
      const response = await apiClient.get(`/sender/campaigns/${campaignId}/details`);
      setData(response.data);
    } catch (err) {
      setError('Failed to load campaign details.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // useEffect para la carga inicial de datos
  useEffect(() => {
    fetchCampaignDetails();
  }, [fetchCampaignDetails]);

  // --- NUEVO useEffect PARA EL AUTO-REFRESCO (POLLING) ---
  useEffect(() => {
    // Si la campaña no se está enviando, no hacemos nada.
    if (data?.details?.status !== 'Sending') {
      return; 
    }

    // Si se está enviando, refrescamos los datos cada 5 segundos.
    const intervalId = setInterval(() => {
      console.log('Polling for campaign details update...');
      fetchCampaignDetails();
    }, 5000);

    // Función de limpieza para detener el polling si el usuario se va de la página
    // o si la campaña termina.
    return () => clearInterval(intervalId);

  }, [data, fetchCampaignDetails]); // Se ejecuta cada vez que los datos cambian


  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  
  const details = data?.details;
  const contacts = data?.contacts || [];

  return (
    <Box sx={{ width: '100%', maxWidth: '1100px' }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Link component={RouterLink} underline="hover" color="inherit" to="/send-email">
          Campaign Manager
        </Link>
        <Typography color="text.primary">{details?.subject || 'Campaign Details'}</Typography>
      </Breadcrumbs>
      
      <Typography variant="h4" gutterBottom>
        Campaign Details
      </Typography>
      
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography><strong>Subject:</strong> {details?.subject}</Typography>
        <Typography><strong>Target:</strong> {details?.region} (Bounced: {details?.is_bounced ? 'Yes' : 'No'})</Typography>
        <Typography><strong>Status:</strong> <Chip label={details?.status} color={details?.status === 'Completed' ? 'success' : details?.status === 'Sending' ? 'warning' : 'default'} size="small"/></Typography>
        <Typography><strong>Total Recipients:</strong> {details?.target_count}</Typography>
      </Paper>

      <Paper variant="outlined">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{fontWeight: 'bold'}}>Contact Email</TableCell>
                <TableCell sx={{fontWeight: 'bold'}} align="right">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.length > 0 ? (
                contacts.map((contact: any, index: number) => (
                  <TableRow key={index} hover>
                    <TableCell>{contact.email}</TableCell>
                    <TableCell align="right">
                      <Chip label={contact.status} color={contact.status === 'Sent' ? 'success' : 'default'} size="small" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    {details?.status === 'Draft' ? 'Launch the campaign to see the recipient list.' : 'No contacts found for this campaign.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};