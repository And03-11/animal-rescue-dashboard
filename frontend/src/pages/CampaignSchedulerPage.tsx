// --- File: frontend/src/pages/CampaignSchedulerPage.tsx (Paso 2 - Nueva Lógica) ---
import { useState, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton, Stack,
  Chip
} from '@mui/material';

// Importaciones individuales para componentes de MUI
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

import DeleteIcon from '@mui/icons-material/Delete';
// --- ✅ 1. Importar el ícono para el nuevo botón ---
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'; 
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import type { Dayjs as DayjsType } from 'dayjs';

// --- FullCalendar ---
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
// --- ✅ 2. Importar el nuevo plugin de lista ---
import listPlugin from '@fullcalendar/list'; 

import type {
  EventInput,
  EventDropArg,
  DateSelectArg, // Aunque ya no la usamos para 'select', la dejamos por si acaso
  EventClickArg,
} from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';


import apiClient from '../api/axiosConfig';


// --- Config (en Inglés) ---
const CATEGORIES = [
  "Big Campaigns", "NBC", "Unsubscribers", "Tagless",
  "Influencers in Progress", "Fundraising", "Other"
];

const SERVICES = [
  "Automation", "Mailchimp", "Brevo", "Internal", "Other"
];

// --- Interfaces (Sin cambios) ---
interface CampaignFormData {
  id: string | null;
  title: string;
  start: DayjsType;
  end: DayjsType;
  category: string;
  notes: string;
}
interface ScheduledEmail {
  id: number;
  title: string;
  send_at: string;
  service: string;
  status: 'pending' | 'sent';
  campaign_id: number;
}
interface EmailFormData {
  title: string;
  send_at: DayjsType;
  service: string;
}
const initialEmailFormState: EmailFormData = {
  title: '',
  send_at: dayjs(),
  service: 'Automation',
};
interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  opacity?: number;
  extendedProps: {
    type: 'campaign' | 'email';
    campaign_id: number;
    email_id?: number;
    notes?: string;
    category?: string;
    service?: string;
    status?: string;
  };
}

// --- Función de Ayuda para Colores (Sin cambios) ---
const getEventStyling = (service: string, category: string) => {
  let backgroundColor = '#3788d8'; 
  let borderColor = '#3788d8';
  let textColor = '#ffffff';

  switch ((service || "").toLowerCase()) {
    case 'mailchimp':
      backgroundColor = '#fbb254'; borderColor = '#fbb254'; textColor = '#000000';
      break;
    case 'brevo':
      backgroundColor = '#0b996e'; borderColor = '#0b996e';
      break;
    case 'internal':
      backgroundColor = '#38AECC'; borderColor = '#38AECC';
      break;
    case 'automation':
      backgroundColor = '#6c5ce7'; borderColor = '#6c5ce7';
      break;
    case 'other':
      backgroundColor = '#757575'; borderColor = '#757575';
      break;
  }

  switch ((category || "").toLowerCase()) {
    case 'big campaigns':
      backgroundColor = '#FF8F00'; borderColor = '#FF8F00';
      break;
    case 'nbc':
      backgroundColor = '#D32F2F'; borderColor = '#D32F2F';
      break;
    case 'unsubscribers':
      backgroundColor = '#C2185B'; borderColor = '#C2185B';
      break;
    case 'tagless':
      backgroundColor = '#7B1FA2'; borderColor = '#7B1FA2';
      break;
    case 'fundraising':
      backgroundColor = '#303F9F'; borderColor = '#303F9F';
      break;
    case 'other':
      backgroundColor = '#5D4037'; borderColor = '#5D4037';
      break;
  }
  
  return { backgroundColor, borderColor, textColor };
};


export const CampaignSchedulerPage = () => {

  const [error, setError] = useState('');
  const calendarRef = useRef<FullCalendar>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [currentEventData, setCurrentEventData] = useState<CampaignFormData | null>(null);
  const [campaignEmails, setCampaignEmails] = useState<ScheduledEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailForm, setEmailForm] = useState<EmailFormData>(initialEmailFormState);

  // --- fetchEvents (Sin cambios) ---
  const fetchEvents = (
    fetchInfo: any,
    successCallback: (events: EventInput[]) => void,
    failureCallback: (error: Error) => void
  ) => {
    setError('');
    const params = new URLSearchParams({
      start: fetchInfo.start.toISOString(),
      end: fetchInfo.end.toISOString(),
    });
    apiClient
      .get(`/scheduler/events?${params.toString()}`)
      .then((response) => {
        successCallback(response.data);
      })
      .catch((err) => {
        console.error('Error fetching events:', err);
        setError('Error loading calendar events.');
        failureCallback(new Error('Error loading events'));
      });
  };

  // --- Funciones API para Correos (Sin cambios) ---
  const fetchEmailsForCampaign = async (campaignId: number) => {
    setLoadingEmails(true);
    setCampaignEmails([]);
    try {
      const response = await apiClient.get<ScheduledEmail[]>(`/scheduler/emails?campaign_id=${campaignId}`);
      setCampaignEmails(response.data);
    } catch (err) {
      console.error('Error fetching emails:', err);
      setFormError('Could not load campaign emails.');
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleSaveNewEmail = async () => {
    if (!currentEventData?.id) {
      setFormError("The main campaign must be saved first.");
      return;
    }
    if (!emailForm.title.trim()) {
      setFormError("The email title is required.");
      return;
    }
    let numericCampaignId: number;
    try {
      numericCampaignId = parseInt(currentEventData.id.split('_')[1], 10);
      if (isNaN(numericCampaignId)) throw new Error("Invalid campaign ID format");
    } catch (e) {
      setFormError("Invalid campaign ID. Cannot save email.");
      return;
    }
    setFormError('');
    setLoadingEmails(true);
    const payload = {
      ...emailForm,
      campaign_id: numericCampaignId,
      send_at: emailForm.send_at.toISOString(),
      status: 'pending'
    };
    try {
      await apiClient.post('/scheduler/emails', payload);
      setEmailForm(initialEmailFormState);
      await fetchEmailsForCampaign(numericCampaignId);
      calendarRef.current?.getApi().refetchEvents();
    } catch (err: any) {
      console.error('Error saving new email:', err);
      setFormError(err.response?.data?.detail || 'Error saving email.');
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleToggleEmailStatus = async (email: ScheduledEmail) => {
    const newStatus = email.status === 'pending' ? 'sent' : 'pending';
    setCampaignEmails(prev => 
      prev.map(e => e.id === email.id ? { ...e, status: newStatus } : e)
    );
    try {
      await apiClient.put(`/scheduler/emails/${email.id}`, { status: newStatus });
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      console.error('Error updating email status:', err);
      setFormError('Error updating email status.');
      setCampaignEmails(prev => 
        prev.map(e => e.id === email.id ? { ...e, status: email.status } : e)
      );
    }
  };

  const handleDeleteEmail = async (emailId: number) => {
    if (!window.confirm("Are you sure you want to delete this email?")) return;
    setLoadingEmails(true);
    try {
      await apiClient.delete(`/scheduler/emails/${emailId}`);
      setCampaignEmails(prev => prev.filter(e => e.id !== emailId));
      calendarRef.current?.getApi().refetchEvents();
    } catch (err: any) {
      console.error('Error deleting email:', err);
      setFormError(err.response?.data?.detail || 'Error deleting email.');
    } finally {
      setLoadingEmails(false);
    }
  };

  // --- Handlers de Eventos del Calendario (Sin cambios) ---
  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    setError('');
    const { event } = dropInfo;
    const props = event.extendedProps;
    if (props.type !== 'campaign' || !event.start || !event.end) {
      dropInfo.revert();
      return;
    }
    const updateData = {
      title: event.title.replace("CAMPAÑA: ", ""),
      start_date: event.start.toISOString(),
      end_date: event.end.toISOString(),
      category: props.category,
      notes: props.notes,
    };
    try {
      await apiClient.put(`/scheduler/events/${event.id}`, updateData);
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      console.error("Error updating event:", err);
      setError('Error saving change. Reverting.');
      dropInfo.revert();
    }
  }, []);

  const handleEventResize = useCallback(async (resizeInfo: EventResizeDoneArg) => {
    setError('');
    const { event } = resizeInfo;
    const props = event.extendedProps;
    if (props.type !== 'campaign' || !event.start || !event.end) {
      resizeInfo.revert();
      return;
    }
    const updateData = {
      title: event.title.replace("CAMPAÑA: ", ""),
      start_date: event.start.toISOString(),
      end_date: event.end.toISOString(),
      category: props.category,
      notes: props.notes,
    };
    try {
      await apiClient.put(`/scheduler/events/${event.id}`, updateData);
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      console.error("Error resizing event:", err);
      setError('Error saving change. Reverting.');
      resizeInfo.revert();
    }
  }, []);

  // --- handleDateSelect ya no se usa, pero lo reemplazamos con este ---
  // --- ✅ 3. Nueva función para el botón "New Campaign" ---
  const handleOpenNewCampaignModal = useCallback(() => {
    setFormError('');
    setCurrentEventData({
      id: null, // Es nueva
      title: 'New Campaign',
      start: dayjs(), // Por defecto empieza ahora
      end: dayjs().add(1, 'hour'), // Por defecto dura 1 hora
      category: 'Other',
      notes: '',
    });
    setCampaignEmails([]); 
    setModalOpen(true);
  }, []); // No tiene dependencias


  // --- handleEventClick (Sin cambios) ---
  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const { event } = clickInfo;
    const props = event.extendedProps;

    if (props.type === 'email') {
      clickInfo.jsEvent.preventDefault(); 
      return; 
    }

    if (props.type === 'campaign') {
      setFormError(''); 
      setCurrentEventData({
        id: event.id,
        title: event.title.replace("CAMPAÑA: ", ""),
        start: dayjs(event.start),
        end: dayjs(event.end),
        category: props.category || 'Other',
        notes: props.notes || '',
      });
      fetchEmailsForCampaign(props.campaign_id);
      setEmailForm(initialEmailFormState); 
      setModalOpen(true);
    }
  }, []);

  // --- Resto de Handlers (sin cambios) ---
  const handleModalClose = () => {
    setModalOpen(false);
    setCurrentEventData(null);
    setFormError('');
    setCampaignEmails([]);
    setLoadingEmails(false);
    setEmailForm(initialEmailFormState);
  };

  const handleModalSave = async () => {
    if (!currentEventData) return;
    setFormError('');
    if (!currentEventData.title.trim()) {
      setFormError('Title cannot be empty.');
      return;
    }
    if (currentEventData.start.isAfter(currentEventData.end)) {
      setFormError('Start date cannot be after end date.');
      return;
    }
    const payload = {
      title: currentEventData.title,
      start_date: currentEventData.start.toISOString(),
      end_date: currentEventData.end.toISOString(),
      category: currentEventData.category,
      notes: currentEventData.notes
    };
    try {
      if (currentEventData.id) {
        await apiClient.put(`/scheduler/events/${currentEventData.id}`, payload);
        handleModalClose();
      } else {
        const response = await apiClient.post('/scheduler/events', payload);
        const newEvent = response.data as CalendarEvent; 
        setCurrentEventData({
            id: newEvent.id,
            title: newEvent.title.replace("CAMPAÑA: ", ""),
            start: dayjs(newEvent.start),
            end: dayjs(newEvent.end),
            category: newEvent.extendedProps.category || 'Other',
            notes: newEvent.extendedProps.notes || '',
        });
      }
      calendarRef.current?.getApi().refetchEvents();
    } catch (err: any) {
      console.error('Error saving event:', err);
      setFormError(err.response?.data?.detail || 'Error saving event.');
    }
  };

  const handleModalDelete = async () => {
    if (!currentEventData || !currentEventData.id) return;
    if (window.confirm(`Are you sure you want to delete "${currentEventData.title}"? (This will also delete all associated emails)`)) {
      try {
        await apiClient.delete(`/scheduler/events/${currentEventData.id}`);
        handleModalClose();
        calendarRef.current?.getApi().refetchEvents();
      } catch (err: any) {
        console.error('Error deleting event:', err);
        setFormError(err.response?.data?.detail || 'Error deleting event.');
      }
    }
  };

  const handleModalFormChange = (field: keyof Omit<CampaignFormData, 'id'|'start'|'end'>, value: any) => {
    if (currentEventData) {
      setCurrentEventData({ ...currentEventData, [field]: value });
    }
  };
  
  const handleEmailFormChange = (field: keyof EmailFormData, value: any) => {
    setEmailForm(prev => ({ ...prev, [field]: value }));
  };


  // --- JSX ---
  return (
    <Box sx={{ width: '100%', p: { xs: 1, md: 3 } }}>
      
      {/* --- ✅ 4. Título y Botón --- */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Campaign Scheduler
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddCircleOutlineIcon />}
          onClick={handleOpenNewCampaignModal} // Usamos el nuevo handler
        >
          New Campaign
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 1, md: 3 }, position: 'relative' }}>
        <FullCalendar
          ref={calendarRef}
          // --- ✅ 5. Actualización de Plugins y Toolbar ---
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]} // Añadido 'listPlugin'
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listDay', // Añadido 'listDay'
          }}
          // --- ✅ 6. Eliminación de 'selectable' y 'select' ---
          // selectable={true}  <-- ELIMINADO
          // select={handleDateSelect} <-- ELIMINADO
          
          // --- (Resto de props sin cambios) ---
          events={fetchEvents}
          editable={true}
          droppable={true}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventClick={handleEventClick}
          height="80vh"
          eventTimeFormat={{ 
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short'
          }}
          displayEventTime={true}
          displayEventEnd={true}
          eventDisplay='auto' 
        />
      </Paper>


      {/* --- MODAL (Sin cambios en la lógica interna, solo textos) --- */}
      {currentEventData && (
        <Dialog open={modalOpen} onClose={handleModalClose} fullWidth maxWidth="md">
          <DialogTitle>
            {currentEventData.id ? "Edit Campaign" : "Create New Campaign"}
          </DialogTitle>

          <DialogContent>
            <Grid container spacing={4}>
              
              {/* --- Columna Izquierda: Datos de la Campaña --- */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="h6" gutterBottom>Campaign Details</Typography>
                
                <Stack spacing={3} sx={{mt: 2}}>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      label={`Category: ${currentEventData.category}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor: getEventStyling('', currentEventData.category).borderColor,
                        color: getEventStyling('', currentEventData.category).borderColor
                      }}
                    />
                  </Stack>

                  <TextField
                    label="Campaign Title"
                    value={currentEventData.title}
                    onChange={(e) => handleModalFormChange('title', e.target.value)}
                    fullWidth
                    autoFocus
                  />

                  <DateTimePicker
                    label="Campaign Start Date/Time"
                    value={currentEventData.start}
                    onChange={(newValue) => setCurrentEventData(p => p ? {...p, start: newValue!} : null)}
                  />

                  <DateTimePicker
                    label="Campaign End Date/Time"
                    value={currentEventData.end}
                    onChange={(newValue) => setCurrentEventData(p => p ? {...p, end: newValue!} : null)}
                  />

                  <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={currentEventData.category}
                      label="Category"
                      onChange={(e) => handleModalFormChange('category', e.target.value)}
                    >
                      {CATEGORIES.map(cat => (
                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Campaign Notes"
                    value={currentEventData.notes}
                    onChange={(e) => handleModalFormChange('notes', e.target.value)}
                    multiline
                    rows={4}
                    fullWidth
                  />
                </Stack>
              </Grid>

              {/* --- Columna Derecha: Correos de la Campaña --- */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="h6" gutterBottom>Campaign Emails</Typography>
                
                {!currentEventData.id ? (
                  <Alert severity="info" sx={{mt: 2}}>
                    Save the campaign first to add individual emails.
                  </Alert>
                ) : (
                  <>
                    {/* --- Formulario para Añadir Nuevo Correo --- */}
                    <Paper variant="outlined" sx={{ p: 2, mt: 2, mb: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>Add Email</Typography>
                      <Stack spacing={2}>
                        <TextField
                          label="Email Title (e.g., Email 1: Welcome)"
                          value={emailForm.title}
                          onChange={(e) => handleEmailFormChange('title', e.target.value)}
                          fullWidth
                          size="small"
                        />
                        <DateTimePicker
                          label="Send Date/Time"
                          value={emailForm.send_at}
                          onChange={(newValue) => handleEmailFormChange('send_at', newValue!)}
                        />
                        <FormControl fullWidth size="small">
                          <InputLabel>Service</InputLabel>
                          <Select
                            value={emailForm.service}
                            label="Service"
                            onChange={(e) => handleEmailFormChange('service', e.target.value)}
                          >
                            {SERVICES.map(srv => (
                              <MenuItem key={srv} value={srv}>{srv}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleSaveNewEmail}
                          disabled={loadingEmails}
                        >
                          {loadingEmails ? <CircularProgress size={20} /> : "Add Email"}
                        </Button>
                      </Stack>
                    </Paper>

                    <Divider sx={{my: 2}} />

                    {/* --- Lista de Correos Existentes --- */}
                    <Typography variant="subtitle1" gutterBottom>Scheduled Emails</Typography>
                    {loadingEmails && campaignEmails.length === 0 && (
                      <CircularProgress size={24} sx={{display: 'block', mx: 'auto'}} />
                    )}
                    
                    <List dense sx={{maxHeight: 400, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1}}>
                      {campaignEmails.length === 0 && !loadingEmails && (
                         <Typography variant="body2" color="text.secondary" textAlign="center" sx={{p: 2}}>
                           No emails scheduled for this campaign.
                         </Typography>
                      )}
                      
                      {campaignEmails.map(email => (
                        <ListItem
                          key={email.id}
                          divider
                          sx={{ opacity: email.status === 'sent' ? 0.6 : 1 }}
                          secondaryAction={
                            <Stack direction="row" alignItems="center">
                              <Tooltip title={email.status === 'pending' ? 'Mark as Sent' : 'Mark as Pending'}>
                                <Checkbox
                                  edge="end"
                                  checked={email.status === 'sent'}
                                  onChange={() => handleToggleEmailStatus(email)}
                                />
                              </Tooltip>
                              <Tooltip title="Delete Email">
                                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEmail(email.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          }
                        >
                          <ListItemText
                            primary={email.title}
                            secondary={`${email.service} | ${dayjs(email.send_at).format('DD/MM/YY HH:mm')}`}
                            sx={{ 
                              textDecoration: email.status === 'sent' ? 'line-through' : 'none',
                              color: email.status === 'sent' ? 'text.secondary' : 'text.primary'
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}
              </Grid>
            </Grid>

            {/* Error general del modal */}
            {formError && (
              <Alert severity="error" sx={{mt: 2}}>{formError}</Alert>
            )}

          </DialogContent>

          <DialogActions sx={{ justifyContent: 'space-between', p: 2, pt: 1 }}>
            <Box>
              {currentEventData.id && (
                <Tooltip title="Delete Full Campaign (and all its emails)">
                  <IconButton onClick={handleModalDelete} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Box>
              <Button onClick={handleModalClose}>
                 {currentEventData.id && !formError ? "Close" : "Cancel"}
              </Button>
              <Button variant="contained" onClick={handleModalSave}>
                {currentEventData.id ? "Save Campaign Changes" : "Create Campaign"}
              </Button>
            </Box>
          </DialogActions>
        </Dialog>
      )}

    </Box>
  );
};

export default CampaignSchedulerPage;