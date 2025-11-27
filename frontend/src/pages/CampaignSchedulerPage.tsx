// --- File: frontend/src/pages/CampaignSchedulerPage.tsx (VERSIÓN FINAL v3) ---
import { useState, useCallback, useEffect } from 'react';
import {
  Box, Paper, Typography, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton, Stack,
  Divider, CircularProgress, Tooltip, List, ListItem,
  ListItemText, ListItemButton, ListItemSecondaryAction, Checkbox,
  Collapse, RadioGroup, FormControlLabel, Radio, FormLabel, useTheme
} from '@mui/material';

import Grid from '@mui/material/Grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import type { Dayjs as DayjsType } from 'dayjs';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SaveIcon from '@mui/icons-material/Save';

import EmailIcon from '@mui/icons-material/Email';
import apiClient from '../api/axiosConfig';
import {
  SchedulerTimeline,
  type TimelineItem,
  type TimelineGroup
} from '../components/SchedulerTimeline';

// --- Constante de SlotProps (Sin cambios) ---
const dateTimePickerSlotProps = {
  layout: {
    sx: {
      '& .MuiDigitalClock-amPm': {
        height: 'auto !important',
        overflow: 'hidden !important',
      },
      '& .MuiDigitalClock-amPm .MuiList-root': {
        padding: '0 !important',
        height: 'auto !important',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        scrollTop: '0 !important',
      }
    }
  }
};

// --- Config (Sin cambios) ---
const CATEGORIES = [
  "Big Campaigns", "NBC", "Unsubscribers", "Tagless",
  "Influencers in Progress", "Fundraising", "Other"
];
const SERVICES = [
  "Automation", "Mailchimp", "Brevo", "Internal", "Other"
];
type SegmentationMode = "bc" | "single" | "split";

// --- Interfaces (Sin cambios) ---
interface CampaignFormData {
  id: string | null;
  title: string;
  start: DayjsType;
  end: DayjsType;
  category: string;
  notes: string;
  segmentation_mode: SegmentationMode;
}
interface ScheduledCampaignResponse {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  category: string | null;
  notes: string | null;
  segmentation_mode: SegmentationMode | null;
}
interface CampaignEmail {
  id: number;
  campaign_id: number;
  title: string;
  subject: string | null;
  button_name: string | null;
  link_donation: string | null;
  link_contact_us: string | null;
  custom_links: string | null;
}
interface ScheduledSend {
  id: number;
  campaign_email_id: number;
  send_at: string;
  service: string;
  status: 'pending' | 'sent';
  segment_tag: string | null;
}
interface SendFormData {
  service: string;
  bc_send_mode: 'same_time' | 'segmented';
  bc_same_time: DayjsType;
  bc_usa_time: DayjsType;
  bc_eur_time: DayjsType;
  bc_yahoo_time: DayjsType;
  non_bc_single_time: DayjsType;
  non_bc_usa_time: DayjsType;
  non_bc_eur_time: DayjsType;
}
const initialSendFormState: SendFormData = {
  service: 'Automation',
  bc_send_mode: 'same_time',
  bc_same_time: dayjs(),
  bc_usa_time: dayjs(),
  bc_eur_time: dayjs(),
  bc_yahoo_time: dayjs(),
  non_bc_single_time: dayjs(),
  non_bc_usa_time: dayjs(),
  non_bc_eur_time: dayjs(),
};

interface CalendarEvent {
  id: string; // "campaign_1" o "send_1"
  title: string;
  start: string; // ISO Date string
  end?: string; // ISO Date string
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  opacity?: number;
  allDay?: boolean;
  extendedProps: {
    type: 'campaign' | 'send';
    campaign_id: number;
    campaign_email_id?: number;
    send_id?: number;
    notes?: string;
    category?: string;
    title?: string; // Título original de la campaña
    service?: string;
    status?: string;
    segment_tag?: string;
    parent_title?: string;
    parent_category?: string;
    segmentation_mode?: SegmentationMode;
    parent_segmentation_mode?: SegmentationMode;
  };
}


// --- Sub-Componentes (EmailContentEditor, SendScheduler) (Sin cambios) ---
// (Omitidos por brevedad, pero están en tu código)
// [Internal Note: Components EmailContentEditor and SendScheduler are unchanged]
// --- Sub-Componente: EmailContentEditor (L2) (Sin cambios) ---
interface EmailContentEditorProps {
  email: CampaignEmail;
  categoryType: string;
  onSave: (updatedEmail: CampaignEmail) => void;
  onError: (error: string) => void;
  isLoading: boolean;
}
const EmailContentEditor: React.FC<EmailContentEditorProps> = ({ email, categoryType, onSave, onError, isLoading }) => {
  const [formData, setFormData] = useState(email);
  const [customLinks, setCustomLinks] = useState<Array<{ label: string; url: string }>>([]);
  useEffect(() => {
    setFormData(email);
    try {
      const links = JSON.parse(email.custom_links || '[]');
      setCustomLinks(links);
    } catch { setCustomLinks([]); }
  }, [email]);
  const handleChange = (field: keyof Omit<CampaignEmail, 'id' | 'campaign_id' | 'custom_links'>, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const handleCustomLinkChange = (index: number, field: 'label' | 'url', value: string) => {
    const newLinks = [...customLinks];
    newLinks[index][field] = value;
    setCustomLinks(newLinks);
    setFormData(prev => ({ ...prev, custom_links: JSON.stringify(newLinks) }));
  };
  const addCustomLink = () => {
    const newLinks = [...customLinks, { label: '', url: '' }];
    setCustomLinks(newLinks);
    setFormData(prev => ({ ...prev, custom_links: JSON.stringify(newLinks) }));
  };
  const removeCustomLink = (index: number) => {
    const newLinks = customLinks.filter((_, i) => i !== index);
    setCustomLinks(newLinks);
    setFormData(prev => ({ ...prev, custom_links: JSON.stringify(newLinks) }));
  };
  const handleSaveClick = async () => {
    if (!formData.subject) { onError("Subject is required."); return; }
    onSave(formData);
  };
  const isBigCampaign = categoryType.toLowerCase().includes("big campaigns");
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Edit Content for "{email.title}"
      </Typography>
      <Stack spacing={2}>
        <TextField label="Subject" value={formData.subject || ''}
          onChange={(e) => handleChange('subject', e.target.value)} fullWidth size="small" />
        <TextField label="Button Name" value={formData.button_name || ''}
          onChange={(e) => handleChange('button_name', e.target.value)} fullWidth size="small" />
        {!isBigCampaign && (
          <Collapse in={!isBigCampaign} timeout="auto">
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Links (Non-BC Only)</Typography>
              <TextField label="Link: Donation (Fixed)" value={formData.link_donation || ''}
                onChange={(e) => handleChange('link_donation', e.target.value)} fullWidth size="small" />
              <TextField label="Link: Contact Us (Fixed)" value={formData.link_contact_us || ''}
                onChange={(e) => handleChange('link_contact_us', e.target.value)} fullWidth size="small" />
              {customLinks.map((link, index) => (
                <Stack direction="row" spacing={1} key={index}>
                  <TextField label="Link Label" value={link.label} size="small"
                    onChange={(e) => handleCustomLinkChange(index, 'label', e.target.value)} />
                  <TextField label="Link URL" value={link.url} size="small" fullWidth
                    onChange={(e) => handleCustomLinkChange(index, 'url', e.target.value)} />
                  <IconButton onClick={() => removeCustomLink(index)} color="error" size="small"><DeleteIcon /></IconButton>
                </Stack>
              ))}
              <Button onClick={addCustomLink} size="small" startIcon={<AddCircleOutlineIcon />}>Add Custom Link</Button>
            </Stack>
          </Collapse>
        )}
        <Button variant="contained" size="small" color="success" onClick={handleSaveClick} disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}>
          Save Email Content
        </Button>
      </Stack>
    </Paper>
  );
};

// --- Sub-Componente: SendScheduler (L3) (Sin cambios) ---
interface SendSchedulerProps {
  email: CampaignEmail;
  campaignSegmentation: SegmentationMode;
  onSave: (sends: Partial<ScheduledSend>[]) => void;
  onError: (error: string) => void;
  isLoading: boolean;
}
const SendScheduler: React.FC<SendSchedulerProps> = ({ email, campaignSegmentation, onSave, onError, isLoading }) => {
  const [formData, setFormData] = useState(initialSendFormState);

  const handleChange = (field: keyof SendFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const handleSaveClick = () => {
    const sendsToCreate: Partial<ScheduledSend>[] = [];
    onError('');
    if (campaignSegmentation === 'bc') {
      if (formData.bc_send_mode === 'same_time') {
        sendsToCreate.push(
          { segment_tag: 'Tag 1+4 (USA)', send_at: formData.bc_same_time.toISOString(), service: formData.service },
          { segment_tag: 'Tag 2+3 (EUR)', send_at: formData.bc_same_time.toISOString(), service: formData.service },
          { segment_tag: 'Tag 5 (Yahoo)', send_at: formData.bc_same_time.toISOString(), service: formData.service }
        );
      } else {
        sendsToCreate.push(
          { segment_tag: 'Tag 1+4 (USA)', send_at: formData.bc_usa_time.toISOString(), service: formData.service },
          { segment_tag: 'Tag 2+3 (EUR)', send_at: formData.bc_eur_time.toISOString(), service: formData.service },
          { segment_tag: 'Tag 5 (Yahoo)', send_at: formData.bc_yahoo_time.toISOString(), service: formData.service }
        );
      }
    } else {
      if (campaignSegmentation === 'single') {
        sendsToCreate.push(
          { segment_tag: 'USA', send_at: formData.non_bc_single_time.toISOString(), service: formData.service },
          { segment_tag: 'EUR', send_at: formData.non_bc_single_time.toISOString(), service: formData.service }
        );
      } else if (campaignSegmentation === 'split') {
        sendsToCreate.push(
          { segment_tag: 'USA', send_at: formData.non_bc_usa_time.toISOString(), service: formData.service },
          { segment_tag: 'EUR', send_at: formData.non_bc_eur_time.toISOString(), service: formData.service }
        );
      }
    }
    if (sendsToCreate.length > 0) {
      onSave(sendsToCreate);
      setFormData(initialSendFormState);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Add Sends for "{email.title}"
      </Typography>
      {/* --- FORMULARIO PARA BIG CAMPAIGN --- */}
      {campaignSegmentation === 'bc' && (
        <Stack spacing={2}>
          <FormControl component="fieldset">
            <FormLabel component="legend">BC Send Mode (per email)</FormLabel>
            <RadioGroup row value={formData.bc_send_mode} onChange={(e) => handleChange('bc_send_mode', e.target.value as any)}>
              <FormControlLabel value="same_time" control={<Radio />} label="Same Time for All" />
              <FormControlLabel value="segmented" control={<Radio />} label="Segmented Time" />
            </RadioGroup>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Service</InputLabel>
            <Select value={formData.service} label="Service" onChange={(e) => handleChange('service', e.target.value)}>
              {SERVICES.map(srv => <MenuItem key={srv} value={srv}>{srv}</MenuItem>)}
            </Select>
          </FormControl>
          <Collapse in={formData.bc_send_mode === 'same_time'}>
            <DateTimePicker
              label="Send Date/Time (All)"
              value={formData.bc_same_time}
              onChange={(newValue) => handleChange('bc_same_time', newValue!)}
              slotProps={dateTimePickerSlotProps}
            />
          </Collapse>
          <Collapse in={formData.bc_send_mode === 'segmented'}>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <DateTimePicker
                label="Tag 1+4 (USA) Time"
                value={formData.bc_usa_time}
                onChange={(newValue) => handleChange('bc_usa_time', newValue!)}
                slotProps={dateTimePickerSlotProps}
              />
              <DateTimePicker
                label="Tag 2+3 (EUR) Time"
                value={formData.bc_eur_time}
                onChange={(newValue) => handleChange('bc_eur_time', newValue!)}
                slotProps={dateTimePickerSlotProps}
              />
              <DateTimePicker
                label="Tag 5 (Yahoo) Time"
                value={formData.bc_yahoo_time}
                onChange={(newValue) => handleChange('bc_yahoo_time', newValue!)}
                slotProps={dateTimePickerSlotProps}
              />
            </Stack>
          </Collapse>
        </Stack>
      )}
      {/* --- FORMULARIO PARA NON-BC (SINGLE) --- */}
      {campaignSegmentation === 'single' && (
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            Modo: Un Solo Horario (Se crearán envíos para USA y EUR a la misma hora)
          </Typography>
          <DateTimePicker
            label="Send Date/Time (USA & EUR)"
            value={formData.non_bc_single_time}
            onChange={(newValue) => handleChange('non_bc_single_time', newValue!)}
            slotProps={dateTimePickerSlotProps}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Service</InputLabel>
            <Select value={formData.service} label="Service" onChange={(e) => handleChange('service', e.target.value)}>
              {SERVICES.map(srv => <MenuItem key={srv} value={srv}>{srv}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      )}
      {/* --- FORMULARIO PARA NON-BC (SPLIT) --- */}
      {campaignSegmentation === 'split' && (
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            Modo: Horario Dividido (Se crearán envíos separados para USA y EUR)
          </Typography>
          <DateTimePicker
            label="USA Send Time"
            value={formData.non_bc_usa_time}
            onChange={(newValue) => handleChange('non_bc_usa_time', newValue!)}
            slotProps={dateTimePickerSlotProps}
          />
          <DateTimePicker
            label="EUR Send Time"
            value={formData.non_bc_eur_time}
            onChange={(newValue) => handleChange('non_bc_eur_time', newValue!)}
            slotProps={dateTimePickerSlotProps}
          />
          <FormControl fullWidth size="small" sx={{ mt: 2 }}>
            <InputLabel>Service</InputLabel>
            <Select value={formData.service} label="Service" onChange={(e) => handleChange('service', e.target.value)}>
              {SERVICES.map(srv => <MenuItem key={srv} value={srv}>{srv}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      )}
      <Button variant="contained" size="small" onClick={handleSaveClick} disabled={isLoading} sx={{ mt: 2 }}>
        {isLoading ? <CircularProgress size={20} /> : "Add Scheduled Send(s)"}
      </Button>
    </Paper>
  );
};


// --- Componente Principal ---
export const CampaignSchedulerPage = () => {
  const theme = useTheme();
  // --- Estados (Sin cambios) ---
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [currentCampaign, setCurrentCampaign] = useState<CampaignFormData | null>(null);
  const [campaignEmails, setCampaignEmails] = useState<CampaignEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<CampaignEmail | null>(null);
  const [emailFormTitle, setEmailFormTitle] = useState('');
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [scheduledSends, setScheduledSends] = useState<ScheduledSend[]>([]);
  const [loadingSends, setLoadingSends] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // --- Estados para la Timeline (Sin cambios) ---
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  // --- Carga de Datos de la Timeline ---
  const fetchTimelineData = useCallback(async () => {
    // setLoadingTimeline(true); // No mostrar en recargas
    setError('');

    const start = dayjs().subtract(1, 'month').startOf('month').toISOString();
    const end = dayjs().add(3, 'month').endOf('month').toISOString();

    const params = new URLSearchParams({ start, end });

    try {
      const response = await apiClient.get<CalendarEvent[]>(`/scheduler/events?${params.toString()}`);
      const events = response.data;

      // --- Transformación de datos ---

      const newItems: TimelineItem[] = [];
      const groupsMap = new Map<string, TimelineGroup>();

      events.forEach(event => {
        const props = event.extendedProps;

        if (props.type === 'campaign') {
          if (!groupsMap.has(event.id)) {
            groupsMap.set(event.id, {
              id: event.id,
              content: event.title,
              notes: props.notes,
              category: props.category,
              segmentation_mode: props.segmentation_mode,
              // ✅ 1. Forzar inicio al PRICIPIO del día
              start: dayjs(event.start).startOf('day').toDate(),
              end: dayjs(event.end).endOf('day').toDate(),
            });
          }

          newItems.push({
            id: `bg_${event.id}`,
            content: '',
            // ✅ 1. Forzar inicio al PRICIPIO del día
            start: dayjs(event.start).startOf('day').toDate(),
            end: dayjs(event.end).endOf('day').toDate(),
            group: event.id,
            type: 'background',
            className: 'timeline-campaign-background',
            style: `background-color: ${event.backgroundColor}33; border-color: ${event.borderColor};`
          });
        }
        else if (props.type === 'send') {
          const parentGroupId = `campaign_${props.campaign_id}`;
          if (!groupsMap.has(parentGroupId)) {
            groupsMap.set(parentGroupId, {
              id: parentGroupId,
              content: props.parent_title || `Campaña #${props.campaign_id}`,
            });
          }

          // ✅ 2. Crear Tooltip con la hora
          const startTime = dayjs(event.start).format('HH:mm');
          const tooltipTitle = `[${startTime}] ${event.title}`;

          newItems.push({
            id: event.id,
            content: event.title, // El contenido (lo que se ve si no hay template)
            start: new Date(event.start),
            group: parentGroupId,
            type: 'point', // <-- ✅ 2. Cambiado de 'box' a 'point'
            className: `timeline-send-item status-${props.status || 'pending'}`,
            style: `
              border-color: ${event.borderColor};
              background-color: ${event.backgroundColor}CC; 
            `,
            title: tooltipTitle, // <-- ✅ 2. Añadir el tooltip
            campaign_id: props.campaign_id
          });
        }
      });

      setTimelineGroups(Array.from(groupsMap.values()));
      setTimelineItems(newItems);

    } catch (err) {
      console.error('Error fetching timeline events:', err);
      setError('Error loading scheduler data.');
    } finally {
      setLoadingTimeline(false); // Desactivar spinner
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchTimelineData();
  }, [fetchTimelineData]);


  // --- Funciones API (L2 y L3) (Sin cambios) ---
  const fetchEmailsForCampaign = async (campaignId: number) => {
    setLoadingEmails(true);
    setCampaignEmails([]);
    setSelectedEmail(null);
    setScheduledSends([]);
    try {
      const response = await apiClient.get<CampaignEmail[]>(`/scheduler/campaigns/${campaignId}/emails`);
      setCampaignEmails(response.data);
    } catch (err) {
      setFormError('Could not load campaign emails.');
    } finally {
      setLoadingEmails(false);
    }
  };
  const handleSaveNewEmail = async () => {
    if (!currentCampaign?.id || !emailFormTitle.trim()) {
      setFormError("Title is required."); return;
    }
    const numericCampaignId = parseInt(currentCampaign.id.split('_')[1], 10);
    setFormError('');
    setLoadingEmails(true);
    try {
      await apiClient.post('/scheduler/emails', {
        campaign_id: numericCampaignId,
        title: emailFormTitle,
      });
      setEmailFormTitle('');
      await fetchEmailsForCampaign(numericCampaignId);
    } catch (err: any) { setFormError(err.response?.data?.detail || 'Error saving email.'); }
    finally { setLoadingEmails(false); }
  };
  const handleSaveEmailContent = async (updatedEmail: CampaignEmail) => {
    setFormError('');
    setIsSavingEmail(true);
    try {
      const payload = {
        title: updatedEmail.title,
        subject: updatedEmail.subject,
        button_name: updatedEmail.button_name,
        link_donation: updatedEmail.link_donation,
        link_contact_us: updatedEmail.link_contact_us,
        custom_links: updatedEmail.custom_links,
      };
      await apiClient.put(`/scheduler/emails/${updatedEmail.id}`, payload);
      if (currentCampaign?.id) {
        const numericCampaignId = parseInt(currentCampaign.id.split('_')[1], 10);
        await fetchEmailsForCampaign(numericCampaignId);
        setSelectedEmail(prev => prev ? { ...prev, ...payload } : null);
      }
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Error saving email content.');
    } finally {
      setIsSavingEmail(false);
    }
  };
  const handleDeleteEmail = async (emailId: number) => {
    if (!window.confirm("Are you sure you want to delete this Email Content and ALL its scheduled sends?")) return;
    setLoadingEmails(true);
    try {
      await apiClient.delete(`/scheduler/emails/${emailId}`);
      if (currentCampaign?.id) {
        const numericCampaignId = parseInt(currentCampaign.id.split('_')[1], 10);
        await fetchEmailsForCampaign(numericCampaignId);
      }
      fetchTimelineData(); // Recargar timeline
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Error deleting email.');
    } finally {
      setLoadingEmails(false);
    }
  };
  const fetchSendsForEmail = async (emailId: number) => {
    setLoadingSends(true);
    setScheduledSends([]);
    try {
      const response = await apiClient.get<ScheduledSend[]>(`/scheduler/emails/${emailId}/sends`);
      setScheduledSends(response.data);
    } catch (err) {
      setFormError('Could not load scheduled sends.');
    } finally {
      setLoadingSends(false);
    }
  };
  const handleSaveNewSends = async (sendsToCreate: Partial<ScheduledSend>[]) => {
    if (!selectedEmail) {
      setFormError("An email must be selected first."); return;
    }
    setFormError('');
    setLoadingSends(true);
    const savePromises = sendsToCreate.map(send =>
      apiClient.post('/scheduler/sends', {
        campaign_email_id: selectedEmail.id,
        send_at: send.send_at,
        service: send.service,
        segment_tag: send.segment_tag,
        status: 'pending'
      })
    );
    try {
      await Promise.all(savePromises);
      await fetchSendsForEmail(selectedEmail.id);
      fetchTimelineData(); // Recargar timeline
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Error saving one or more sends.');
    } finally {
      setLoadingSends(false);
    }
  };
  const handleToggleSendStatus = async (send: ScheduledSend) => {
    const newStatus = send.status === 'pending' ? 'sent' : 'pending';
    setScheduledSends(prev =>
      prev.map(s => s.id === send.id ? { ...s, status: newStatus } : s)
    );
    try {
      await apiClient.put(`/scheduler/sends/${send.id}`, { status: newStatus });
      fetchTimelineData(); // Recargar timeline
    } catch (err) {
      setFormError('Error updating send status.');
      setScheduledSends(prev =>
        prev.map(s => s.id === send.id ? { ...s, status: send.status } : s)
      );
    }
  };
  const handleDeleteSend = async (sendId: number) => {
    if (!window.confirm("Are you sure you want to delete this scheduled send?")) return;
    setLoadingSends(true);
    try {
      await apiClient.delete(`/scheduler/sends/${sendId}`);
      if (selectedEmail) {
        await fetchSendsForEmail(selectedEmail.id);
      }
      fetchTimelineData(); // Recargar timeline
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Error deleting send.');
    } finally {
      setLoadingSends(false);
    }
  };

  // --- Handlers de Eventos del Modal (Sin cambios) ---
  const getSegModeFromCategory = (category: string): SegmentationMode => {
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes("big campaigns")) {
      return "bc";
    }
    return "single";
  };
  const handleOpenNewCampaignModal = useCallback(() => {
    setFormError('');
    const defaultCategory = 'Other';
    setCurrentCampaign({
      id: null,
      title: 'New Campaign',
      start: dayjs().startOf('day'),
      end: dayjs().startOf('day'), // Fecha fin = fecha inicio por defecto
      category: defaultCategory,
      notes: '',
      segmentation_mode: getSegModeFromCategory(defaultCategory),
    });
    setCampaignEmails([]);
    setSelectedEmail(null);
    setScheduledSends([]);
    setModalOpen(true);
  }, []);

  // --- Manejador de Doble Clic ---
  const handleItemDoubleClick = useCallback(async (clickedId: string | number) => {
    setError('');
    setFormError('');

    // ✅ 3. IGNORAR doble clic en envíos (send_...)
    if (String(clickedId).startsWith('send_')) {
      return;
    }

    let campaignGroupId: string | number | undefined;

    // 1. Encontrar qué se clickeó
    const clickedItem = timelineItems.find(i => i.id === clickedId);

    if (clickedItem) {
      // Es un ítem (fondo de campaña)
      campaignGroupId = clickedItem.group;
    } else {
      // Es la etiqueta de un grupo
      const clickedGroup = timelineGroups.find(g => g.id === clickedId);
      if (clickedGroup) {
        campaignGroupId = clickedGroup.id;
      }
    }

    if (!campaignGroupId) {
      setError('Could not find campaign for this item.');
      return;
    }

    // 2. Encontrar los datos de la campaña (grupo)
    const campaignData = timelineGroups.find(g => g.id === campaignGroupId);
    if (!campaignData) {
      setError('Could not find campaign data from group.');
      return;
    }

    // 3. Extraer el ID numérico
    const numericCampaignId = parseInt(String(campaignData.id).split('_')[1], 10);
    if (isNaN(numericCampaignId)) {
      setError('Invalid campaign ID format.');
      return;
    }

    // 4. Preparar el formulario del modal
    setCurrentCampaign({
      id: String(campaignData.id),
      title: campaignData.content.replace('CAMPAÑA: ', ''),
      start: dayjs(campaignData.start),
      // Ajustar la fecha final para el DatePicker (restar 1 día)
      end: dayjs(campaignData.end).subtract(1, 'day'),
      category: campaignData.category || 'Other',
      notes: campaignData.notes || '',
      segmentation_mode: (campaignData.segmentation_mode as SegmentationMode) || getSegModeFromCategory(campaignData.category || ''),
    });

    // 5. Cargar emails (ahora SÍ funcionará)
    fetchEmailsForCampaign(numericCampaignId);

    setEmailFormTitle('');
    setSelectedEmail(null);
    setScheduledSends([]);

    setModalOpen(true);

  }, [timelineItems, timelineGroups]);

  // --- Manejador de Arrastrar (Move) ---
  const handleItemMove = useCallback(async (
    item: TimelineItem,
    callback: (item: TimelineItem | null) => void
  ) => {
    setError('');
    const itemIdStr = String(item.id);

    // --- Lógica para CAMPAÑAS (tipo 'background') ---
    if (itemIdStr.startsWith('bg_')) {
      const campaignId = item.group;
      const campaignData = timelineGroups.find(g => g.id === campaignId);

      if (!campaignData) {
        setError('Cannot move campaign: data not found.');
        callback(null); // Revertir
        return;
      }

      const payload = {
        title: campaignData.content.replace('CAMPAÑA: ', ''),
        start_date: dayjs(item.start as Date).startOf('day').toISOString(),
        end_date: dayjs(item.end as Date).endOf('day').toISOString(), // Guardar inclusivo
        category: campaignData.category,
        notes: campaignData.notes,
        segmentation_mode: campaignData.segmentation_mode,
      };

      try {
        await apiClient.put(`/scheduler/events/${campaignId}`, payload);
        callback(item); // Confirmar el movimiento
        fetchTimelineData(); // Recargar todo para consistencia
      } catch (err) {
        setError('Failed to update campaign range.');
        callback(null); // Revertir
      }
      return;
    }

    // --- Lógica para ENVÍOS (tipo 'point') ---
    if (itemIdStr.startsWith('send_')) {
      const sendId = parseInt(itemIdStr.split('_')[1], 10);

      // ✅ 4. Lógica de Restricción
      const campaignData = timelineGroups.find(g => g.id === item.group);
      if (campaignData && campaignData.start && campaignData.end) {
        const itemTime = dayjs(item.start as Date);
        // Usamos startOf/endOf por si el fondo de la campaña no está forzado a 00:00/23:59
        const campaignStart = dayjs(campaignData.start).startOf('day');
        const campaignEnd = dayjs(campaignData.end).endOf('day');

        if (itemTime.isBefore(campaignStart) || itemTime.isAfter(campaignEnd)) {
          setError('Cannot move send outside its campaign range.');
          callback(null); // Revertir
          return;
        }
      }
      // (Si no se encuentra la campaña, permitimos el movimiento por ahora)

      const payload = {
        send_at: (item.start as Date).toISOString(),
      };

      try {
        await apiClient.put(`/scheduler/sends/${sendId}`, payload);
        callback(item); // Confirmar el movimiento
        fetchTimelineData(); // Recargamos para que el estado (sent/pending) sea consistente
      } catch (err) {
        setError('Failed to update send time.');
        callback(null); // Revertir
      }
      return;
    }

    callback(null);

  }, [timelineGroups, timelineItems, fetchTimelineData]);


  const handleCampaignFormChange = (
    field: keyof Omit<CampaignFormData, 'id' | 'start' | 'end'>,
    value: any
  ) => {
    if (currentCampaign) {
      const newCampaign = { ...currentCampaign, [field]: value };
      if (field === 'category') {
        newCampaign.segmentation_mode = getSegModeFromCategory(value);
      }
      setCurrentCampaign(newCampaign);
    }
  };
  const handleModalClose = () => {
    setModalOpen(false); setCurrentCampaign(null); setFormError('');
    setCampaignEmails([]); setSelectedEmail(null); setScheduledSends([]);
  };
  const handleModalSave_Simple = async () => {
    if (!currentCampaign) return;
    setFormError('');
    if (!currentCampaign.title.trim()) { setFormError('Title cannot be empty.'); return; }
    if (currentCampaign.start.isAfter(currentCampaign.end)) { setFormError('Start date cannot be after end date.'); return; }

    // ✅ 5. Lógica de guardado inclusivo
    const payload = {
      title: currentCampaign.title,
      start_date: currentCampaign.start.startOf('day').toISOString(),
      // Guardamos la fecha final + 1 día para que sea inclusiva en la BBDD
      end_date: currentCampaign.end.add(1, 'day').startOf('day').toISOString(),
      category: currentCampaign.category,
      notes: currentCampaign.notes,
      segmentation_mode: currentCampaign.segmentation_mode
    };
    try {
      if (currentCampaign.id) {
        await apiClient.put(`/scheduler/events/${currentCampaign.id}`, payload);
        setFormError('');
      } else {
        const response = await apiClient.post('/scheduler/events', payload);
        const newEvent = response.data as ScheduledCampaignResponse;
        setCurrentCampaign(prev => prev ? {
          ...prev,
          id: `campaign_${newEvent.id}`,
          segmentation_mode: newEvent.segmentation_mode || 'bc'
        } : null);
      }
      fetchTimelineData(); // Recargar timeline
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Error saving event.');
    }
  };
  const handleModalDelete = async () => {
    if (!currentCampaign || !currentCampaign.id) return;
    if (window.confirm(`Are you sure you want to delete "${currentCampaign.title}"?`)) {
      try {
        await apiClient.delete(`/scheduler/events/${currentCampaign.id}`);
        handleModalClose();
        fetchTimelineData(); // Recargar timeline
      } catch (err: any) {
        setFormError(err.response?.data?.detail || 'Error deleting event.');
      }
    }
  };
  const handleSelectEmail = (email: CampaignEmail) => {
    setSelectedEmail(email);
  };

  // --- JSX (Solo eliminamos FullCalendar) ---
  return (
    <Box sx={{ width: '100%', p: { xs: 1, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">Campaign Scheduler</Typography>
        <Button variant="contained" startIcon={<AddCircleOutlineIcon />}
          onClick={handleOpenNewCampaignModal}>
          New Campaign
        </Button>
      </Box>
      {error && (<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>)}

      {/* --- RENDERIZAR LA TIMELINE --- */}
      <Paper variant="outlined" sx={{
        p: { xs: 1, md: 2 },
        position: 'relative',
        minHeight: '80vh',
        // Estilos para las clases CSS personalizadas
        '& .vis-timeline': { borderColor: theme.palette.divider },
        '& .vis-panel, & .vis-center, & .vis-left, & .vis-right, & .vis-top, & .vis-bottom': {
          borderColor: theme.palette.divider,
        },
        '& .vis-time-axis .vis-grid': { borderColor: theme.palette.divider },
        '& .vis-item.timeline-campaign-background': {
          borderStyle: 'dashed',
          borderWidth: '1px',
          borderRadius: '4px',
          zIndex: 0,
        },
        '& .vis-item.vis-point.timeline-send-item': { // Específico para 'point'
          zIndex: 1,
          borderWidth: '2px',
          boxShadow: theme.shadows[1],
        },
        '& .vis-item.vis-point.status-sent': { // Específico para 'point'
          opacity: 0.6,
        },
        // (Eliminamos los estilos de plantilla que ya no usamos)
      }}>
        {loadingTimeline ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '75vh' }}>
            <CircularProgress />
          </Box>
        ) : (
          <SchedulerTimeline
            items={timelineItems}
            groups={timelineGroups}
            onItemMove={handleItemMove}
            onItemDoubleClick={handleItemDoubleClick}
          />
        )}
      </Paper>

      {/* --- El DIÁLOGO MODAL se mantiene intacto --- */}
      {currentCampaign && (
        <Dialog open={modalOpen} onClose={handleModalClose} fullWidth maxWidth="xl">
          <DialogTitle>
            {currentCampaign.id ? `Edit Campaign: ${currentCampaign.title}` : "Create New Campaign"}
          </DialogTitle>

          <DialogContent>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFormError('')}>{formError}</Alert>
            )}

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField label="Campaign Title" value={currentCampaign.title}
                    onChange={(e) => handleCampaignFormChange('title', e.target.value)} fullWidth autoFocus />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <DatePicker label="Campaign Start" value={currentCampaign.start}
                    onChange={(newValue) => setCurrentCampaign(p => p ? { ...p, start: newValue! } : null)} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <DatePicker label="Campaign End" value={currentCampaign.end}
                    onChange={(newValue) => setCurrentCampaign(p => p ? { ...p, end: newValue! } : null)} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select value={currentCampaign.category} label="Category"
                      onChange={(e) => handleCampaignFormChange('category', e.target.value)}>
                      {CATEGORIES.map(cat => (<MenuItem key={cat} value={cat}>{cat}</MenuItem>))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <Collapse
                    in={!currentCampaign.category.toLowerCase().includes("big campaigns")}
                    timeout="auto"
                  >
                    <FormControl component="fieldset" sx={{ pl: 1 }}>
                      <FormLabel component="legend">Segmentation Mode (for all emails)</FormLabel>
                      <RadioGroup row value={currentCampaign.segmentation_mode}
                        onChange={(e) => handleCampaignFormChange('segmentation_mode', e.target.value as SegmentationMode)}>
                        <FormControlLabel value="single" control={<Radio />} label="Un Solo Horario (para USA y EUR)" />
                        <FormControlLabel value="split" control={<Radio />} label="Horario Dividido (USA / EUR)" />
                      </RadioGroup>
                    </FormControl>
                  </Collapse>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField label="Campaign Notes" value={currentCampaign.notes}
                    onChange={(e) => handleCampaignFormChange('notes', e.target.value)}
                    multiline rows={2} fullWidth />
                </Grid>
              </Grid>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button variant="contained" onClick={handleModalSave_Simple} size="small">
                  {currentCampaign.id ? "Save Campaign Changes" : "Create Campaign to Continue"}
                </Button>
              </Box>
            </Paper>

            <Collapse in={!!currentCampaign.id}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    <EmailIcon sx={{ mr: 1, verticalAlign: 'bottom' }} /> Email Content (L2)
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>Add New Email</Typography>
                    <Stack direction="row" spacing={1}>
                      <TextField label="New Email Title (ej. Email #1)" value={emailFormTitle}
                        onChange={(e) => setEmailFormTitle(e.target.value)} fullWidth size="small" />
                      <Button variant="contained" onClick={handleSaveNewEmail} disabled={loadingEmails} size="small">
                        {loadingEmails ? <CircularProgress size={20} /> : "Add"}
                      </Button>
                    </Stack>
                  </Paper>
                  {loadingEmails && campaignEmails.length === 0 ? <CircularProgress /> : (
                    <List dense sx={{ maxHeight: 600, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1 }}>
                      {campaignEmails.length === 0 && (
                        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ p: 2 }}>
                          No emails created for this campaign yet.
                        </Typography>
                      )}
                      {campaignEmails.map(email => (
                        <ListItemButton key={email.id} selected={selectedEmail?.id === email.id}
                          onClick={() => handleSelectEmail(email)}>
                          <ListItemText primary={email.title} secondary={email.subject || "Sin Asunto"} />
                          <ListItemSecondaryAction>
                            <Tooltip title="Delete Email & All Sends">
                              <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEmail(email.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </ListItemSecondaryAction>
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  {!selectedEmail ? (
                    <Alert severity="info">
                      Select an email from the left list to edit its content and manage its sends.
                    </Alert>
                  ) : (
                    <>
                      <EmailContentEditor
                        email={selectedEmail}
                        categoryType={currentCampaign.category}
                        onSave={handleSaveEmailContent}
                        onError={setFormError}
                        isLoading={isSavingEmail}
                      />
                      <Divider sx={{ my: 2 }} />
                      <SendScheduler
                        email={selectedEmail}
                        campaignSegmentation={currentCampaign.segmentation_mode}
                        onSave={handleSaveNewSends}
                        onError={setFormError}
                        isLoading={loadingSends}
                      />
                      {loadingSends ? <CircularProgress /> : (
                        <List dense sx={{ maxHeight: 400, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1, mt: 2 }}>
                          {scheduledSends.length === 0 && (
                            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ p: 2 }}>
                              No sends scheduled for this email.
                            </Typography>
                          )}
                          {scheduledSends.map(send => (
                            <ListItem key={send.id} divider sx={{ opacity: send.status === 'sent' ? 0.6 : 1 }}>
                              <ListItemText
                                primary={`${send.service} | ${send.segment_tag || 'No Segment'}`}
                                secondary={dayjs(send.send_at).format('DD/MM/YY HH:mm')}
                                sx={{ textDecoration: send.status === 'sent' ? 'line-through' : 'none' }}
                              />
                              <ListItemSecondaryAction>
                                <Tooltip title={send.status === 'pending' ? 'Mark as Sent' : 'Mark as Pending'}>
                                  <Checkbox edge="end" checked={send.status === 'sent'}
                                    onChange={() => handleToggleSendStatus(send)} />
                                </Tooltip>
                                <Tooltip title="Delete Send">
                                  <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteSend(send.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </ListItemSecondaryAction>
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </>
                  )}
                </Grid>
              </Grid>
            </Collapse>
          </DialogContent>

          <DialogActions sx={{ justifyContent: 'space-between', p: 2, pt: 1 }}>
            <Box>
              {currentCampaign.id && (
                <Tooltip title="Delete Full Campaign (and all its emails/sends)">
                  <IconButton onClick={handleModalDelete} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Box>
              <Button onClick={handleModalClose}>Close</Button>
            </Box>
          </DialogActions>
        </Dialog>
      )}

    </Box>
  );
};

export default CampaignSchedulerPage;