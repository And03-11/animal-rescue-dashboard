// src/pages/EmailSenderPage.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Snackbar,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import apiClient from '../api/axiosConfig';
import {
  getApiErrorMessage,
  getCampaignSaveErrorMessage,
  isAbortError,
} from '../features/email-sender/apiErrors';
import { CampaignDeleteDialog } from '../features/email-sender/CampaignDeleteDialog';
import { CampaignTable } from '../features/email-sender/CampaignTableWorkspace';
import { CampaignWizard } from '../features/email-sender/CampaignWizard';
import {
  CampaignSaveSessionState,
  executeCampaignSavePlan,
  planCampaignSave,
} from '../features/email-sender/campaignWizardOrchestration';
import type {
  CampaignLaunchResponse,
  CampaignFormData,
  CreateCampaignResponse,
  CsvColumnMapping,
  EmailCampaign,
  PaginatedCampaignsResponse,
} from '../features/email-sender/types';

// --- Componente Principal de la Página (SIN CAMBIOS RESPECTO AL CÓDIGO QUE YA TENÍAS) ---
export const EmailSenderPage = () => {
  const [totalCampaigns, setTotalCampaigns] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
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

  const fetchCampaigns = useCallback(async (
    signal?: AbortSignal,
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true);

    try {
      const response = await apiClient.get<PaginatedCampaignsResponse>('/sender/campaigns', {
        params: {
          page_size: rowsPerPage,
          offset: page * rowsPerPage,
        },
        signal,
        timeout: 15_000,
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' },
      });
      const { items, total } = response.data;
      const lastPage = Math.max(0, Math.ceil(total / rowsPerPage) - 1);

      setTotalCampaigns(total);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setCampaigns(items);
      setError(null);
    } catch (err: unknown) {
      if (!isAbortError(err) && showLoading) {
        setError('Failed to load campaigns.');
        console.error(err);
      }
    } finally {
      if (showLoading && !signal?.aborted) setLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCampaigns(controller.signal);

    return () => controller.abort();
  }, [fetchCampaigns]);

  // Polling para campañas 'Sending'
  useEffect(() => {
    const isCampaignSending = campaigns.some(c => c.status === 'Sending');
    if (!isCampaignSending) return;

    console.log("Polling active for sending campaigns...");
    const intervalId = setInterval(() => {
      console.log("Polling for campaign updates...");
      void fetchCampaigns(undefined, false);
    }, 5000);

    return () => {
      console.log("Polling stopped.");
      clearInterval(intervalId);
    }
  }, [campaigns, fetchCampaigns]);


  const handleSaveCampaign = async (
    campaignDataFromForm: CampaignFormData,
    mapping?: CsvColumnMapping,
    signal?: AbortSignal,
  ) => {
    const { csvFile, ...campaignBaseData } = campaignDataFromForm;
    const sourceType = campaignBaseData.source_type;
    const saveSignal = signal ?? new AbortController().signal;
    const saveState = campaignSaveSessionRef.current;
    const campaignIdForSave = saveState.resolveCampaignId(saveSignal, editingCampaignId);
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
              campaignBaseData,
              { signal: operationSignal },
            );
            return response.data.id;
          }

          if (!currentCampaignId) throw new Error('Campaign ID is required to complete this save.');

          if (operation === 'update-campaign') {
            setSnackbarMessage('Updating campaign configuration…');
            await apiClient.put(
              `/sender/campaigns/${currentCampaignId}`,
              campaignBaseData,
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
          ? `CSV campaign ${campaignId} saved successfully!`
          : `Airtable campaign ${campaignId} saved successfully!`,
      );
      setIsModalOpen(false);
      setEditingCampaignId(null);
      void fetchCampaigns();
    } catch (saveError: unknown) {
      if (isAbortError(saveError)) return;
      console.error('Error saving campaign:', saveError);
      setError(getCampaignSaveErrorMessage(saveError));
      setSnackbarMessage(null);
      throw saveError;
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


  // --- Renderizado ---
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography variant="h3" component="h1">Email campaigns</Typography>
            <Chip
              label={loading && totalCampaigns === 0
                ? 'Loading campaigns…'
                : `${totalCampaigns.toLocaleString()} campaigns`}
              size="small"
              variant="outlined"
              sx={{ color: 'text.secondary' }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Create, send, and measure campaign performance from one workspace.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddCircleOutlineIcon />}
          onClick={() => { setEditingCampaignId(null); setError(null); setIsModalOpen(true); }}
          sx={{ flexShrink: 0 }}
        >
          Create campaign
        </Button>
      </Box>

      {/* Muestra error general si existe Y no está el modal abierto (para evitar duplicados) */}
      {error && !isModalOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <CampaignTable
        campaigns={campaigns}
        total={totalCampaigns}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(nextPage) => setPage(nextPage)}
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

      <CampaignDeleteDialog
        campaign={campaignToDelete}
        deleting={deleting}
        open={deleteConfirmOpen}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
      />

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
