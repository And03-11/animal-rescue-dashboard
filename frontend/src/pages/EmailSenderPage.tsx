// src/pages/EmailSenderPage.tsx
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Edit as EditIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import apiClient from '../api/axiosConfig';
import { CampaignWizard } from '../features/email-sender/CampaignWizard';

// --- Componente Principal de la Página (SIN CAMBIOS RESPECTO AL CÓDIGO QUE YA TENÍAS) ---
export const EmailSenderPage = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null); // Para saber si estamos subiendo CSV a una existente
  const [campaignToDelete, setCampaignToDelete] = useState<any | null>(null); // Guarda la campaña a eliminar
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false); // Controla el modal de confirmación
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchCampaigns = useCallback(async () => {
    // No mostramos spinner principal en refrescos automáticos
    try {
      const response = await apiClient.get('/sender/campaigns', {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' }
      });
      setCampaigns(response.data);
      if (loading) setError(null); // Limpia error solo si era carga inicial
    } catch (err: any) {
      // Solo muestra error si no es un error de cancelación (AbortError)
      // y si es la carga inicial o ya no hay campañas en la lista (para evitar parpadeo)
      if (err.name !== 'AbortError' && (loading || campaigns.length === 0)) {
        setError('Failed to load campaigns.');
        console.error(err);
      }
    } finally {
      if (loading) setLoading(false); // Desactiva loading inicial solo la primera vez
    }
  }, [loading, campaigns.length]); // Depende de loading y campaigns.length

  // Carga inicial
  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo una vez

  // Polling para campañas 'Sending'
  useEffect(() => {
    const isCampaignSending = campaigns.some(c => c.status === 'Sending');
    if (!isCampaignSending) return;

    console.log("Polling active for sending campaigns...");
    const intervalId = setInterval(() => {
      console.log("Polling for campaign updates...");
      fetchCampaigns(); // Llama a fetchCampaigns sin activar el loading principal
    }, 5000);

    return () => {
      console.log("Polling stopped.");
      clearInterval(intervalId);
    }
  }, [campaigns, fetchCampaigns]);


  // --- handleSaveCampaign (ACTUALIZADO para manejar errores y mensajes) ---
  const handleSaveCampaign = async (
    campaignDataFromForm: any,
    mapping?: { email: string; name: string; has_header: boolean }
  ) => {
    const { csvFile, ...campaignBaseData } = campaignDataFromForm; // Extrae csvFile
    const source_type = campaignBaseData.source_type;
    setError(null); // Limpia errores generales previos
    setSnackbarMessage(null); // Limpia mensajes previos

    try {
      // --- ETAPA 2: Guardar el Mapeo ---
      if (mapping && editingCampaignId && source_type === 'csv') {
        console.log("Etapa 2: Confirmando mapeo para:", editingCampaignId, mapping);
        setSnackbarMessage(`Saving column mapping for campaign ${editingCampaignId}...`);
        try {
          await apiClient.post(`/sender/campaigns/${editingCampaignId}/save-mapping`, mapping);
          setSnackbarMessage(`Column mapping saved successfully! Campaign is Ready.`);
          setIsModalOpen(false);
          setEditingCampaignId(null);
          fetchCampaigns();
          return; // Termina
        } catch (mapErr: any) {
          console.error("Error saving mapping:", mapErr);
          // Muestra el error DENTRO del modal
          // Necesitaríamos pasar una función `setFormError` a CampaignForm o manejarlo aquí
          // Por ahora, lo mostramos como error general y dejamos modal abierto
          setError(mapErr.response?.data?.detail || 'Failed to save column mapping.');
          setSnackbarMessage(null); // Oculta snackbar si hay error
          // NO CERRAMOS EL MODAL para que el usuario corrija
          throw mapErr;
        }
      }

      // --- ETAPA 1: Crear o Actualizar Campaña y/o Subir Archivo ---
      let campaignId = editingCampaignId;
      if (!campaignId) {
        console.log("Etapa 1: Creando configuración de campaña...");
        setSnackbarMessage(`Saving campaign configuration...`);
        // Asegúrate que campaignBaseData tenga todo lo necesario (incluyendo sender_config)
        const createResponse = await apiClient.post('/sender/campaigns', campaignBaseData);
        campaignId = createResponse.data.id;
        setEditingCampaignId(campaignId); // Guarda el ID nuevo
        console.log(`Etapa 1: Configuración guardada (ID: ${campaignId})`);
        setSnackbarMessage(`Configuration saved (ID: ${campaignId})...`);
      } else {
        console.log(`Etapa 1: Actualizando campaignId existente: ${campaignId}`);
        setSnackbarMessage(`Updating campaign configuration...`);
        await apiClient.put(`/sender/campaigns/${campaignId}`, campaignBaseData);
        setSnackbarMessage(`Configuration updated (ID: ${campaignId})...`);
      }

      // Subir CSV si aplica
      if (source_type === 'csv' && csvFile && campaignId) {
        console.log(`Etapa 1: Subiendo archivo CSV para ${campaignId}...`);
        setSnackbarMessage(`Uploading CSV file for campaign ${campaignId}...`);
        const formData = new FormData();
        formData.append('csv_file', csvFile, csvFile.name);
        try {
          await apiClient.post(`/sender/campaigns/${campaignId}/upload-csv`, formData);
          console.log(`Etapa 1: CSV subido para ${campaignId}`);

          // ✅ SI HAY MAPPING, GUARDARLO INMEDIATAMENTE
          if (mapping) {
            console.log("Mapeo recibido en Etapa 1, guardando inmediatamente...");
            setSnackbarMessage(`Saving column mapping...`);
            await apiClient.post(`/sender/campaigns/${campaignId}/save-mapping`, mapping);
            console.log("Mapeo guardado exitosamente.");
            setSnackbarMessage(`Campaign saved successfully!`);
            setIsModalOpen(false);
            setEditingCampaignId(null);
            fetchCampaigns();
            return;
          }

          setSnackbarMessage(`CSV uploaded! Please map columns below.`);
          // Si no hay mapping (flujo antiguo), dejamos abierto
        } catch (uploadErr: any) {
          console.error("Error uploading/mapping CSV:", uploadErr);
          setError(uploadErr.response?.data?.detail || 'Failed to upload/map CSV file.');
          setSnackbarMessage(null);
          throw uploadErr;
        }

      } else if (source_type === 'airtable' && campaignId) {
        // Si es Airtable, la creación fue todo.
        console.log("Etapa 1: Campaña Airtable creada/guardada. Cerrando modal.");
        setSnackbarMessage(`Airtable campaign ${campaignId} saved successfully!`);
        setIsModalOpen(false);
        setEditingCampaignId(null); // Limpia ID
        fetchCampaigns(); // Refresca lista
      }

    } catch (err: any) {
      // Captura errores de la creación inicial de campaña (si falló antes de subir CSV)
      console.error("Error en handleSaveCampaign (Etapa 1 - Creación):", err);
      let errorMessage = 'Failed operation.';
      if (err.response) { errorMessage = err.response.data?.detail || `Server error: ${err.response.status}`; }
      else if (err.request) { errorMessage = 'No response from server.'; }
      else { errorMessage = `Error: ${err.message}`; }
      setError(errorMessage);
      setSnackbarMessage(null);
      // Resetea editingCampaignId si la creación inicial falló
      if (!mapping && !editingCampaignId) setEditingCampaignId(null);
      throw err;
    }
    // No ponemos finally(setLoading(false)) porque el loading relevante es el snackbar o el error
  };


  const handleLaunchCampaign = async (campaignId: string) => {
    // ... (sin cambios respecto a lo anterior) ...
    try {
      const response = await apiClient.post(`/sender/campaigns/${campaignId}/launch`);
      setSnackbarMessage(response.data.message || 'Campaign launch initiated!');
      setTimeout(fetchCampaigns, 1500); // Refresca tras un delay
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to launch campaign.');
      console.error(err);
    }
  };
  const handleDeleteClick = (campaign: any) => {
    setCampaignToDelete(campaign);
    setDeleteConfirmOpen(true);
  };

  // Cierra el diálogo de confirmación
  const handleDeleteClose = () => {
    setCampaignToDelete(null);
    setDeleteConfirmOpen(false);
  };

  // Ejecuta la eliminación si se confirma
  const handleDeleteConfirm = async () => {
    if (!campaignToDelete) return;

    const campaignId = campaignToDelete.id;
    const currentStatus = campaignToDelete.status;
    const isCancelAction = ['Sending', 'Paused'].includes(currentStatus); // Determina si es cancelar o borrar directo
    const endpoint = isCancelAction ? `/sender/campaigns/${campaignId}/cancel` : `/sender/campaigns/${campaignId}`; // Endpoint cambia
    const method = isCancelAction ? 'post' : 'delete'; // Método HTTP cambia

    setDeleting(true); // Usamos el estado 'deleting' existente
    setError(null);
    setSnackbarMessage(null);

    try {
      // Llama al endpoint correcto (POST para /cancel, DELETE para /sender/campaigns/{id})
      await apiClient({ method: method, url: endpoint });

      setSnackbarMessage(`Campaign '${campaignToDelete.subject}' ${isCancelAction ? 'cancelled and deleted' : 'deleted successfully'}.`);
      handleDeleteClose(); // Cierra el modal
      // Esperamos un poco antes de refrescar si fue cancelación,
      // para dar tiempo al backend a procesar si la tarea estaba activa.
      setTimeout(fetchCampaigns, isCancelAction ? 1000 : 0);

    } catch (err: any) {
      console.error(`Error ${isCancelAction ? 'cancelling' : 'deleting'} campaign:`, err);
      setError(err.response?.data?.detail || `Failed to ${isCancelAction ? 'cancel' : 'delete'} campaign.`);
      handleDeleteClose(); // Cerramos modal incluso si falla por ahora
    } finally {
      setDeleting(false);
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    setActionLoading(prev => ({ ...prev, [campaignId]: true })); // Activa spinner para esta campaña
    setError(null);
    setSnackbarMessage(null);
    try {
      await apiClient.post(`/sender/campaigns/${campaignId}/pause`);
      setSnackbarMessage(`Campaign '${campaignId}' paused.`);
      fetchCampaigns(); // Refresca para actualizar el estado visual
    } catch (err: any) {
      console.error("Error pausing campaign:", err);
      setError(err.response?.data?.detail || 'Failed to pause campaign.');
    } finally {
      setActionLoading(prev => ({ ...prev, [campaignId]: false })); // Desactiva spinner
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    setActionLoading(prev => ({ ...prev, [campaignId]: true })); // Activa spinner
    setError(null);
    setSnackbarMessage(null);
    try {
      await apiClient.post(`/sender/campaigns/${campaignId}/resume`);
      setSnackbarMessage(`Campaign '${campaignId}' resuming...`);
      // El backend la pone en 'Sending', el polling la actualizará
      fetchCampaigns(); // Refresca para mostrar 'Sending'
    } catch (err: any) {
      console.error("Error resuming campaign:", err);
      setError(err.response?.data?.detail || 'Failed to resume campaign.');
    } finally {
      setActionLoading(prev => ({ ...prev, [campaignId]: false })); // Desactiva spinner
    }
  };


  // --- Renderizado ---
  if (loading && campaigns.length === 0) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">Campaign Manager</Typography>
        <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => { setEditingCampaignId(null); setError(null); setIsModalOpen(true); }}>
          Create New Campaign
        </Button>
      </Box>

      {/* Muestra error general si existe Y no está el modal abierto (para evitar duplicados) */}
      {error && !isModalOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Created At</TableCell>
                <TableCell>Campaign Name</TableCell>
                {/* --- AÑADE ESTA LÍNEA --- */}
                <TableCell>Subject</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Target Info</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Progress</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 && !loading ? (
                <TableRow><TableCell colSpan={7} align="center">No campaigns found. Create one to get started!</TableCell></TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell>{new Date(campaign.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>
                      <Link component={RouterLink} to={`/campaign/${campaign.id}`} underline="hover" color="inherit">
                        {campaign.campaign_name || `(ID: ${campaign.id.substring(9)})`} {/* Muestra nombre o ID corto */}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {campaign.subject || '(No Subject)'}
                    </TableCell>
                    <TableCell>
                      <Chip label={campaign.source_type?.toUpperCase()} size="small"
                        color={campaign.source_type === 'airtable' ? 'info' : 'secondary'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {campaign.source_type === 'airtable'
                        ? `${campaign.region} (Bounced: ${campaign.is_bounced ? 'Yes' : 'No'})`
                        : campaign.csv_filename || (campaign.status === 'Draft' ? 'CSV Pending Upload' : 'CSV Processed')}
                      {/* Muestra nombre del archivo o estado */}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={campaign.status === 'Scheduled' ? <ScheduleIcon fontSize="small" /> : undefined}
                        label={campaign.status}
                        size="small"
                        color={campaign.status === 'Completed' ? 'success' : campaign.status === 'Sending' ? 'warning' : campaign.status === 'Scheduled' ? 'info' : campaign.status.startsWith('Error') ? 'error' : 'default'}
                      />
                      {campaign.status === 'Scheduled' && campaign.scheduled_at && (
                        <Typography variant="caption" display="block" color="info.main" sx={{ mt: 0.5 }}>
                          📅 {new Date(campaign.scheduled_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Lógica de progreso */}
                      {(campaign.progress && campaign.progress.total > 0) || campaign.status === 'Sending' || campaign.status === 'Completed' ? (
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box sx={{ width: '100%', mr: 1 }}>
                            <LinearProgress variant="determinate"
                              value={Math.min(100, Math.max(0, Number(campaign.progress?.percentage) || 0))}
                              color={campaign.status === 'Sending' ? 'warning' : campaign.status === 'Completed' ? 'success' : 'primary'} />
                          </Box>
                          <Box sx={{ minWidth: 70 }}>
                            <Typography variant="body2" color="text.secondary">{`${campaign.progress?.sent ?? campaign.sent_count_final ?? 0} / ${campaign.progress?.total ?? campaign.target_count ?? '?'}`}</Typography>
                          </Box>
                        </Box>
                      ) : campaign.status === 'Draft' ? (
                        <Typography variant="caption" color="text.secondary">Waiting...</Typography>
                      ) : campaign.status === 'Ready' ? (
                        <Typography variant="caption" color="success.main">Ready to Launch</Typography>
                      ) : campaign.status === 'Scheduled' ? (
                        <Typography variant="caption" color="info.main">⏰ Scheduled</Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">N/A</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">

                      {campaign.status === 'Sending' && (
                        <Tooltip title="Pause Sending">
                          <span> {/* Span para Tooltip en botón deshabilitado */}
                            <IconButton
                              aria-label="pause campaign"
                              onClick={() => handlePauseCampaign(campaign.id)}
                              color="warning" // Color naranja para pausa
                              size="small"
                              disabled={actionLoading[campaign.id] || deleting} // Deshabilitado si ya hay acción o se está borrando
                              sx={{ mr: 0.5 }} // Margen derecho
                            >
                              {actionLoading[campaign.id] ? <CircularProgress size={16} color="inherit" /> : <PauseCircleOutlineIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}

                      {/* Botón Reanudar (visible si está 'Paused') */}
                      {campaign.status === 'Paused' && (
                        <Tooltip title="Resume Sending">
                          <span>
                            <IconButton
                              aria-label="resume campaign"
                              onClick={() => handleResumeCampaign(campaign.id)}
                              color="success" // Color verde para reanudar
                              size="small"
                              disabled={actionLoading[campaign.id] || deleting}
                              sx={{ mr: 0.5 }}
                            >
                              {actionLoading[campaign.id] ? <CircularProgress size={16} color="inherit" /> : <PlayCircleOutlineIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}

                      {/* Botón Launch */}
                      <Button
                        variant="outlined" size="small" startIcon={<RocketLaunchIcon />}
                        onClick={() => handleLaunchCampaign(campaign.id)}
                        // Habilitado si está en 'Ready', o si es 'Airtable' y está en 'Draft'
                        // O si se completó con errores y tiene emails pendientes
                        disabled={
                          !(
                            campaign.status === 'Ready' ||
                            (campaign.source_type === 'airtable' && campaign.status === 'Draft') ||
                            (campaign.status === 'Completed with Errors' && (campaign.sent_count_final ?? campaign.progress?.sent ?? 0) < (campaign.target_count ?? campaign.progress?.total ?? 0))
                          ) || campaign.status === 'Sending' // Siempre deshabilitado si está enviando
                        }
                      >
                        {campaign.status === 'Sending' ? 'Sending...' : (campaign.status === 'Completed with Errors' ? 'Retry Failed' : 'Launch')}
                      </Button>
                      {/* --- INICIO: BOTÓN EDITAR --- */}
                      <Tooltip title="Edit Campaign">
                        <span>
                          <IconButton
                            aria-label="edit campaign"
                            onClick={() => { setEditingCampaignId(campaign.id); setError(null); setIsModalOpen(true); }}
                            color="primary"
                            size="small"
                            disabled={campaign.status === 'Sending' || deleting}
                            sx={{ ml: 1 }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {/* --- FIN: BOTÓN EDITAR --- */}
                      {/* --- INICIO: NUEVO BOTÓN ELIMINAR --- */}
                      <Tooltip title="Delete Campaign">
                        {/* Span necesario para Tooltip en botón deshabilitado */}
                        <span>
                          <IconButton
                            aria-label="delete campaign"
                            onClick={() => handleDeleteClick(campaign)}
                            color="error" // Color rojo para indicar peligro
                            size="small"
                            disabled={campaign.status === 'Sending' || deleting} // Deshabilitado si enviando o si ya se está eliminando algo
                            sx={{ ml: 1 }} // Margen izquierdo para separarlo
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {/* --- FIN: NUEVO BOTÓN ELIMINAR --- */}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modal para Crear/Editar Campaña */}
      <CampaignWizard
        open={isModalOpen}
        initialCampaignId={editingCampaignId}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCampaignId(null);
          setError(null);
        }}
        onSave={handleSaveCampaign}
      />

      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteClose}
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
      >
        <DialogTitle id="delete-confirm-title">Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-confirm-description">
            {/* --- INICIO MODIFICACIÓN --- */}
            {['Sending', 'Paused'].includes(campaignToDelete?.status)
              ? `Are you sure you want to cancel and permanently delete the campaign `
              : `Are you sure you want to permanently delete the campaign `
            }
            <strong>"{campaignToDelete?.subject || 'this campaign'}"</strong>?
            {['Sending', 'Paused'].includes(campaignToDelete?.status) && ` The sending process will be stopped.`}
            This action cannot be undone.
            {/* --- FIN MODIFICACIÓN --- */}
          </DialogContentText>
          {deleting && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose} disabled={deleting}>Cancel</Button>
          {/* Cambia el texto del botón de confirmación */}
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting} autoFocus>
            {['Sending', 'Paused'].includes(campaignToDelete?.status) ? 'Cancel & Delete' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para notificaciones */}
      <Snackbar
        open={!!snackbarMessage} autoHideDuration={6000}
        onClose={() => setSnackbarMessage(null)} message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />


    </Container>
  );
};

export default EmailSenderPage;
