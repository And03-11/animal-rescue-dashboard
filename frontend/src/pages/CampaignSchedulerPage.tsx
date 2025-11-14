// --- File: frontend/src/pages/CampaignSchedulerPage.tsx (Versión corregida) ---
import { useState, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton, Stack,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import type { Dayjs as DayjsType } from 'dayjs';

// --- FullCalendar ---
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import type {
  EventInput,
  EventDropArg,
  DateSelectArg,
  EventClickArg,  // ✅ Tipo correcto para tu versión
} from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';


import apiClient from '../api/axiosConfig';


// --- Config ---
const CATEGORIES = [
  "Big Campaigns", "NBC", "Unsubscribers", "Tagless",
  "Influencers in Progress", "Fundraising", "Other"
];

const SERVICES = [
  "Automation", "Internal", "Mailchimp", "Brevo", "Other"
];

interface EventFormData {
  id: string | null;
  title: string;
  start: DayjsType;
  end: DayjsType;
  category: string;
  source_service: string;
  notes: string;
}


// --- Color Helper ---
const getEventStyling = (service: string, category: string) => {
  let backgroundColor = '#3788d8'; 
  let borderColor = '#3788d8';
  let textColor = '#ffffff';

  switch (service.toLowerCase()) {
    case 'mailchimp':
      backgroundColor = '#fbb254';
      borderColor = '#fbb254';
      textColor = '#000000';
      break;
    case 'brevo':
      backgroundColor = '#0b996e';
      borderColor = '#0b996e';
      break;
    case 'internal':
    case 'automation':
      backgroundColor = '#6c5ce7';
      borderColor = '#6c5ce7';
      break;
    case 'other':
      backgroundColor = '#757575';
      borderColor = '#757575';
      break;
  }

  switch (category.toLowerCase()) {
    case 'nbc':
      borderColor = '#ff0000';
      break;
    case 'unsubscribers':
      borderColor = '#f50057';
      break;
  }

  return { backgroundColor, borderColor, textColor };
};



export const CampaignSchedulerPage = () => {

  const [error, setError] = useState('');
  const calendarRef = useRef<FullCalendar>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [currentEventData, setCurrentEventData] = useState<EventFormData | null>(null);


  // --- Fetch events ---
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
        const events = response.data.map((event: any) => {
          const service = event.source_service || 'Other';
          const category = event.category || '';

          const styling = getEventStyling(service, category);

          return {
            id: event.id.toString(),
            title: event.title,
            start: event.start_date,
            end: event.end_date,
            backgroundColor: styling.backgroundColor,
            borderColor: styling.borderColor,
            textColor: styling.textColor,
            extendedProps: {
              category,
              source_service: service,
              notes: event.notes || '',
            },
          };
        });

        successCallback(events);
      })
      .catch((err) => {
        console.error('Error fetching events:', err);
        setError('Error al cargar los eventos del calendario.');
        failureCallback(new Error('Error al cargar eventos'));
      });
  };


  // --- Event Handlers ---
  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    setError('');
    const { event } = dropInfo;

    if (!event.start || !event.end) {
      setError('Error al guardar el cambio. Faltan fechas.');
      dropInfo.revert();
      return;
    }

    const updateData = {
      title: event.title,
      start_date: event.start.toISOString(),
      end_date: event.end.toISOString(),
      category: event.extendedProps.category,
      source_service: event.extendedProps.source_service,
      notes: event.extendedProps.notes,
    };

    try {
      await apiClient.put(`/scheduler/events/${event.id}`, updateData);
    } catch (err) {
      console.error("Error updating event:", err);
      setError('Error al guardar el cambio. Revirtiendo.');
      dropInfo.revert();
    }
  }, []);


  const handleEventResize = useCallback(async (resizeInfo: EventResizeDoneArg) => {
    setError('');
    const { event } = resizeInfo;

    if (!event.start || !event.end) {
      setError('Error al guardar el cambio. Faltan fechas.');
      resizeInfo.revert();
      return;
    }

    const updateData = {
      title: event.title,
      start_date: event.start.toISOString(),
      end_date: event.end.toISOString(),
      category: event.extendedProps.category,
      source_service: event.extendedProps.source_service,
      notes: event.extendedProps.notes,
    };

    try {
      await apiClient.put(`/scheduler/events/${event.id}`, updateData);
    } catch (err) {
      console.error("Error updating event:", err);
      setError('Error al guardar el cambio. Revirtiendo.');
      resizeInfo.revert();
    }
  }, []);


  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    setFormError('');
    setCurrentEventData({
      id: null,
      title: 'Nueva Campaña',
      start: dayjs(selectInfo.start),
      end: dayjs(selectInfo.end),
      category: 'Other',
      source_service: 'Other',
      notes: '',
    });
    setModalOpen(true);
  }, []);


  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const { event } = clickInfo;
    setCurrentEventData({
      id: event.id,
      title: event.title,
      start: dayjs(event.start),
      end: dayjs(event.end),
      category: event.extendedProps.category,
      source_service: event.extendedProps.source_service,
      notes: event.extendedProps.notes,
    });
    setModalOpen(true);
  }, []);


  const handleModalClose = () => {
    setModalOpen(false);
    setCurrentEventData(null);
    setFormError('');
  };


  const handleModalSave = async () => {
    if (!currentEventData) return;
    setFormError('');

    if (!currentEventData.title.trim()) {
      setFormError('El título no puede estar vacío.');
      return;
    }

    if (currentEventData.start.isAfter(currentEventData.end)) {
      setFormError('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }

    const payload = {
      title: currentEventData.title,
      start_date: currentEventData.start.toISOString(),
      end_date: currentEventData.end.toISOString(),
      category: currentEventData.category,
      source_service: currentEventData.source_service,
      notes: currentEventData.notes
    };

    try {
      if (currentEventData.id) {
        await apiClient.put(`/scheduler/events/${currentEventData.id}`, payload);
      } else {
        await apiClient.post(`/scheduler/events`, payload);
      }

      handleModalClose();
      calendarRef.current?.getApi().refetchEvents();

    } catch (err: any) {
      console.error('Error saving event:', err);
      setFormError(err.response?.data?.detail || 'Error al guardar el evento.');
    }
  };


  const handleModalDelete = async () => {
    if (!currentEventData || !currentEventData.id) return;

    if (window.confirm(`¿Estás seguro de que quieres eliminar "${currentEventData.title}"?`)) {
      try {
        await apiClient.delete(`/scheduler/events/${currentEventData.id}`);
        handleModalClose();
        calendarRef.current?.getApi().refetchEvents();
      } catch (err: any) {
        console.error('Error deleting event:', err);
        setFormError(err.response?.data?.detail || 'Error al eliminar el evento.');
      }
    }
  };


  const handleModalFormChange = (field: keyof EventFormData, value: any) => {
    if (currentEventData) {
      setCurrentEventData({ ...currentEventData, [field]: value });
    }
  };


  // --- JSX ---
  return (
    <Box sx={{ width: '100%', p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Planificador de Campañas
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 1, md: 3 }, position: 'relative' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={fetchEvents}
          editable={true}
          selectable={true}
          droppable={true}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height="80vh"

          
        />
      </Paper>


      {/* --- Modal --- */}
      {currentEventData && (
        <Dialog open={modalOpen} onClose={handleModalClose} fullWidth maxWidth="sm">
          <DialogTitle>
            {currentEventData.id ? "Editar Evento" : "Crear Nuevo Evento"}
          </DialogTitle>

          <DialogContent>

            <Stack direction="row" spacing={1} sx={{ mb: 2, mt: 1 }}>
              <Chip
                label={`Servicio: ${currentEventData.source_service}`}
                size="small"
                sx={{ ...getEventStyling(currentEventData.source_service, '') }}
              />
              <Chip
                label={`Categoría: ${currentEventData.category}`}
                size="small"
                variant="outlined"
                sx={{
                  borderColor: getEventStyling('', currentEventData.category).borderColor,
                  color: getEventStyling('', currentEventData.category).borderColor
                }}
              />
            </Stack>

            <Stack spacing={3}>
              <TextField
                label="Título de la Campaña"
                value={currentEventData.title}
                onChange={(e) => handleModalFormChange('title', e.target.value)}
                fullWidth
                autoFocus
              />

              <DateTimePicker
                label="Fecha y Hora de Inicio"
                value={currentEventData.start}
                onChange={(newValue) => handleModalFormChange('start', newValue)}
              />

              <DateTimePicker
                label="Fecha y Hora de Fin"
                value={currentEventData.end}
                onChange={(newValue) => handleModalFormChange('end', newValue)}
              />

              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={currentEventData.category}
                  label="Categoría"
                  onChange={(e) => handleModalFormChange('category', e.target.value)}
                >
                  {CATEGORIES.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Servicio de Envío</InputLabel>
                <Select
                  value={currentEventData.source_service}
                  label="Servicio de Envío"
                  onChange={(e) => handleModalFormChange('source_service', e.target.value)}
                >
                  {SERVICES.map(srv => (
                    <MenuItem key={srv} value={srv}>{srv}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Notas"
                value={currentEventData.notes}
                onChange={(e) => handleModalFormChange('notes', e.target.value)}
                multiline
                rows={4}
                fullWidth
              />

              {formError && (
                <Alert severity="error">{formError}</Alert>
              )}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
            <Box>
              {currentEventData.id && (
                <IconButton onClick={handleModalDelete} color="error">
                  <DeleteIcon />
                </IconButton>
              )}
            </Box>
            <Box>
              <Button onClick={handleModalClose}>Cancelar</Button>
              <Button variant="contained" onClick={handleModalSave}>Guardar</Button>
            </Box>
          </DialogActions>
        </Dialog>
      )}

    </Box>
  );
};

export default CampaignSchedulerPage;
