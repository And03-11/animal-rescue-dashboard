// src/pages/EmailSenderPage.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Typography,
} from '@mui/material';
import axios from 'axios';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import apiClient from '../api/axiosConfig';
import { CampaignTable } from '../features/email-sender/CampaignTableWorkspace';
import { CampaignWizard } from '../features/email-sender/CampaignWizard';
import {
  CampaignSaveSessionState,
  executeCampaignSavePlan,
  planCampaignSave,
} from '../features/email-sender/campaignWizardOrchestration';
import type { CampaignWizardPayload } from '../features/email-sender/campaignWizardState';
import type {
  CampaignLaunchResponse,
  CreateCampaignResponse,
  CsvColumnMapping,
  EmailCampaign,
} from '../features/email-sender/types';

interface ApiErrorPayload {
  detail?: string;
}

const isAbortError = (error: unknown): boolean => (
  axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')
);

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data?.detail || fallback;
  }

  return fallback;
};

const getCampaignSaveErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    if (error.response) {
      return error.response.data?.detail || `Server error: ${error.response.status}`;
    }
    if (error.request) return 'No response from server.';
  }

  return error instanceof Error ? `Error: ${error.message}` : 'Failed operation.';
};

// --- Componente Principal de la Página (SIN CAMBIOS RESPECTO AL CÓDIGO QUE YA TENÍAS) ---
export const EmailSenderPage = () => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null); // Para saber si estamos subiendo CSV a una existente
  const [campaignToDelete, setCampaignToDelete] = useState<EmailCampaign | null>(null); // Guarda la campaña a eliminar
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false); // Controla el modal de confirmación
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const campaignSaveSessionRef = useRef(new CampaignSaveSessionState());
  const wizardCampaignIdRef = useRef<string | null>(editingCampaignId);

  useEffect(() => {
    if (!isModalOpen || wizardCampaignIdRef.current !== editingCampaignId) {
      campaignSaveSessionRef.current.clear();
    }
    wizardCampaignIdRef.current = editingCampaignId;
  }, [editingCampaignId, isModalOpen]);

  const fetchCampaigns = useCallback(async () => {
    // No mostramos spinner principal en refrescos automáticos
    try {
      const response = await apiClient.get<EmailCampaign[]>('/sender/campaigns', {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' }
      });
      setCampaigns(response.data);
      if (loading) setError(null); // Limpia error solo si era carga inicial
    } catch (err: unknown) {
      // Solo muestra error si no es un error de cancelación (AbortError)
      // y si es la carga inicial o ya no hay campañas en la lista (para evitar parpadeo)
      if (!isAbortError(err) && (loading || campaigns.length === 0)) {
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


  const handleSaveCampaign = async (
    campaignDataFromForm: CampaignWizardPayload,
    mapping?: CsvColumnMapping,
    signal?: AbortSignal,
  ) => {
    const {
      csvFile,
      source_type: requestedSourceType,
      ...campaignRequestData
    } = campaignDataFromForm;
    const saveSignal = signal ?? new AbortController().signal;
    const saveState = campaignSaveSessionRef.current;
    const campaignIdForSave = saveState.resolveCampaignId(saveSignal, editingCampaignId);
    const existingSourceType = campaignIdForSave
      ? campaigns.find((campaign) => campaign.id === campaignIdForSave)?.source_type
      : undefined;
    const sourceType = requestedSourceType
      ?? existingSourceType
      ?? (mapping ? 'csv' : 'airtable');
    const operations = planCampaignSave({
      existingCampaignId: campaignIdForSave,
      sourceType,
      hasCsvFile: Boolean(csvFile),
      hasMapping: Boolean(mapping),
    });

    setError(null);
    setSnackbarMessage(null);

    try {
      const campaignId = await executeCampaignSavePlan({
        operations,
        initialCampaignId: campaignIdForSave,
        signal: saveSignal,
        retainCampaignId: (createdCampaignId) => {
          saveState.retainCampaignId(saveSignal, createdCampaignId);
        },
        runOperation: async ({ operation, campaignId: currentCampaignId, signal: operationSignal }) => {
          if (operation === 'create-campaign') {
            setSnackbarMessage('Saving campaign configuration…');
            const response = await apiClient.post<CreateCampaignResponse>(
              '/sender/campaigns',
              {
                ...campaignRequestData,
                source_type: sourceType,
              },
              { signal: operationSignal },
            );
            return response.data.id;
          }

          if (!currentCampaignId) throw new Error('Campaign ID is required to complete this save.');

          if (operation === 'update-campaign') {
            setSnackbarMessage('Updating campaign configuration…');
            await apiClient.put(
              `/sender/campaigns/${currentCampaignId}`,
              campaignRequestData,
              { signal: operationSignal },
            );
          } else if (operation === 'upload-csv') {
            if (!csvFile) throw new Error('CSV file is required for upload.');
            setSnackbarMessage('Uploading CSV file…');
            const formData = new FormData();
            formData.append('csv_file', csvFile, csvFile.name);
            await apiClient.post(
              `/sender/campaigns/${currentCampaignId}/upload-csv`,
              formData,
              { signal: operationSignal },
            );
          } else if (operation === 'save-mapping') {
            if (!mapping) throw new Error('CSV mapping is required to complete this save.');
            setSnackbarMessage('Saving column mapping…');
            await apiClient.post(
              `/sender/campaigns/${currentCampaignId}/save-mapping`,
              mapping,
              { signal: operationSignal },
            );
          }
        },
      });

      saveState.complete(saveSignal);
      setSnackbarMessage(
        sourceType === 'csv'
          ? 'CSV campaign saved successfully!'
          : `Airtable campaign ${campaignId} saved successfully!`,
      );
      setIsModalOpen(false);
      setEditingCampaignId(null);
      void fetchCampaigns();
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      console.error('Error saving campaign:', err);
      setError(getCampaignSaveErrorMessage(err));
      setSnackbarMessage(null);
      throw err;
    }
  };

  const handleLaunchCampaign = async (campaignId: string) => {
    // ... (sin cambios respecto a lo anterior) ...
    try {
      const response = await apiClient.post<CampaignLaunchResponse>(`/sender/campaigns/${campaignId}/launch`);
      setSnackbarMessage(response.data.message || 'Campaign launch initiated!');
      setTimeout(fetchCampaigns, 1500); // Refresca tras un delay
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to launch campaign.'));
      console.error(err);
    }
  };
  const handleDeleteClick = (campaign: EmailCampaign) => {
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

    } catch (err: unknown) {
      console.error(`Error ${isCancelAction ? 'cancelling' : 'deleting'} campaign:`, err);
      setError(getApiErrorMessage(err, `Failed to ${isCancelAction ? 'cancel' : 'delete'} campaign.`));
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
    } catch (err: unknown) {
      console.error("Error pausing campaign:", err);
      setError(getApiErrorMessage(err, 'Failed to pause campaign.'));
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
    } catch (err: unknown) {
      console.error("Error resuming campaign:", err);
      setError(getApiErrorMessage(err, 'Failed to resume campaign.'));
    } finally {
      setActionLoading(prev => ({ ...prev, [campaignId]: false })); // Desactiva spinner
    }
  };

  const lastPage = Math.max(0, Math.ceil(campaigns.length / rowsPerPage) - 1);
  const visiblePage = Math.min(page, lastPage);
  useEffect(() => {
    if (page !== visiblePage) setPage(visiblePage);
  }, [page, visiblePage]);
  const visibleCampaigns = campaigns.slice(
    visiblePage * rowsPerPage,
    (visiblePage + 1) * rowsPerPage,
  );


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

      <CampaignTable
        campaigns={visibleCampaigns}
        total={campaigns.length}
        page={visiblePage}
        rowsPerPage={rowsPerPage}
        onPageChange={setPage}
        onRowsPerPageChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage);
          setPage(0);
        }}
        loading={loading}
        deleting={deleting}
        actionLoading={actionLoading}
        onPause={handlePauseCampaign}
        onResume={handleResumeCampaign}
        onLaunch={handleLaunchCampaign}
        onEdit={(campaignId) => {
          setEditingCampaignId(campaignId);
          setError(null);
          setIsModalOpen(true);
        }}
        onDelete={handleDeleteClick}
      />

      {/* Modal para Crear/Editar Campaña */}
      <CampaignWizard
        open={isModalOpen}
        initialCampaignId={editingCampaignId}
        onClose={() => {
          campaignSaveSessionRef.current.clear();
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
            {['Sending', 'Paused'].includes(campaignToDelete?.status ?? '')
              ? `Are you sure you want to cancel and permanently delete the campaign `
              : `Are you sure you want to permanently delete the campaign `
            }
            <strong>"{campaignToDelete?.subject || 'this campaign'}"</strong>?
            {['Sending', 'Paused'].includes(campaignToDelete?.status ?? '') && ` The sending process will be stopped.`}
            This action cannot be undone.
            {/* --- FIN MODIFICACIÓN --- */}
          </DialogContentText>
          {deleting && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose} disabled={deleting}>Cancel</Button>
          {/* Cambia el texto del botón de confirmación */}
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting} autoFocus>
            {['Sending', 'Paused'].includes(campaignToDelete?.status ?? '') ? 'Cancel & Delete' : 'Delete'}
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
