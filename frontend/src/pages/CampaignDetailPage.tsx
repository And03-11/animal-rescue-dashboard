// src/pages/CampaignDetailPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
// Línea nueva
// La línea nueva y corregida
import { 
  Box, Typography, CircularProgress, Alert, Paper, Table, 
  TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Breadcrumbs, Link, Chip, Divider, CardHeader,
  Avatar, ToggleButtonGroup, ToggleButton, TextField, CardContent
} from '@mui/material';
import Grid from '@mui/material/Grid';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import apiClient from '../api/axiosConfig';
// Añade estas líneas junto a tus otros imports
import ArticleIcon from '@mui/icons-material/Article';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { EmailPreview } from '../components/EmailPreview';


export const CampaignDetailPage = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview'); // Por defecto en preview

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

  // Bloque nuevo con Grid
  // Reemplaza el bloque 'return' en src/pages/CampaignDetailPage.tsx

  return (
    <Box sx={{ width: '100%', maxWidth: '1600px' }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Link component={RouterLink} underline="hover" color="text.primary" to="/send-email">
          Campaign Manager
        </Link>
        <Typography color="text.primary">{details?.subject || 'Campaign Details'}</Typography>
      </Breadcrumbs>
      
      <Grid container spacing={3} sx={{ justifyContent: 'center' }}>
        {/* --- Columna Izquierda: Detalles y Lista de Contactos --- */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Box display="flex" flexDirection="column" gap={3}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Campaign Info</Typography>
              <Divider sx={{mb: 2}}/>
              <Typography><strong>Subject:</strong> {details?.subject}</Typography>
              <Typography><strong>Target:</strong> {details?.region} (Bounced: {details?.is_bounced ? 'Yes' : 'No'})</Typography>
              <Typography><strong>Status:</strong> <Chip label={details?.status} color={details?.status === 'Completed' ? 'success' : details?.status === 'Sending' ? 'warning' : 'default'} size="small"/></Typography>
              <Typography><strong>Total Recipients:</strong> {details?.target_count}</Typography>
            </Paper>

            <Paper variant="outlined">
              <TableContainer sx={{ maxHeight: 440 }}>
                <Table stickyHeader>
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
                          <TableCell align="right"><Chip label={contact.status} color={contact.status === 'Sent' ? 'success' : 'default'} size="small" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} align="center">
                          No contacts found for this campaign.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        </Grid>

        {/* --- Columna Derecha: Vista Previa del Correo --- */}
        <Grid size={{ xs: 12, md: 7 }}>
            <Paper variant="outlined">
                <CardHeader
                    avatar={<Avatar><ArticleIcon /></Avatar>}
                    title="Sent Email Content"
                    action={
                        <ToggleButtonGroup value={viewMode} exclusive onChange={(_e, newMode) => newMode && setViewMode(newMode)} size="small">
                            <ToggleButton value="preview" aria-label="preview"><VisibilityIcon /></ToggleButton>
                            <ToggleButton value="code" aria-label="code view"><CodeIcon /></ToggleButton>
                        </ToggleButtonGroup>
                    }
                />
                <CardContent>
                    {viewMode === 'preview' ? (
                        <EmailPreview subject={details?.subject} htmlBody={details?.html_body} />
                    ) : (
                        <TextField fullWidth multiline InputProps={{ readOnly: true }} rows={15} value={details?.html_body} variant="outlined" />
                    )}
                </CardContent>
            </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CampaignDetailPage