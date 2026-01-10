// src/pages/EmailSenderPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import {
  Alert,
  Autocomplete, // Necesario para la selección manual
  Box,
  Button,
  Checkbox, // Necesario para Autocomplete
  Chip,
  CircularProgress,
  Collapse, // Para mostrar/occultar secciones
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid, IconButton, // Importado para mantener tu estilo
  Input,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'; // Agrupadas importaciones de MUI
import { Link as RouterLink } from 'react-router-dom';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiClient from '../api/axiosConfig';
import { EmailPreview } from '../components/EmailPreview'; // Componente de vista previa
import DeleteIcon from '@mui/icons-material/Delete';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline'; // Para Pausar
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SendIcon from '@mui/icons-material/Send';

// --- Interfaces ---
interface CampaignFormProps {
  onSave: (
    campaign: any,
    mapping?: { email: string; name: string; has_header: boolean }
  ) => void;
  onCancel: () => void;
  initialCampaignId?: string | null;
}

// Interfaz para las opciones de remitente (del nuevo endpoint)
interface SenderOptions {
  groups: string[];
  accounts: { id: string; group: string }[];
}

// Interfaz para las cuentas seleccionadas en Autocomplete
interface SelectedAccount {
  id: string;
  group: string;
}


// --- Componente del Formulario para Crear Campañas (ACTUALIZADO) ---
const CampaignForm: React.FC<CampaignFormProps> = ({ onSave, onCancel, initialCampaignId = null }) => {
  // --- Estados ---
  const [sourceType, setSourceType] = useState<'airtable' | 'csv'>('airtable');
  const [region, setRegion] = useState('USA');
  const [isBounced, setIsBounced] = useState(false);
  const [segment, setSegment] = useState<'standard' | 'dnr'>('standard'); // ✅ Nuevo estado para Segmento
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('<h1>New Campaign</h1>\n<p>Write your content here.</p>');


  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvPreview, setCsvPreview] = useState<{ columns: string[], preview_row: string[], has_header: boolean } | null>(null);
  const [columnMapping, setColumnMapping] = useState<{ email: string, name: string }>({ email: '', name: '' });
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
  const [showMapping, setShowMapping] = useState<boolean>(false);


  // --- INICIO: NUEVOS ESTADOS para Selección de Remitente ---
  const [senderOptions, setSenderOptions] = useState<SenderOptions>({ groups: [], accounts: [] });
  const [senderSelectionMode, setSenderSelectionMode] = useState<string>('all'); // 'all', 'group', 'manual'
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  // Guardamos objetos completos {id, group} para que Autocomplete funcione bien
  const [selectedAccounts, setSelectedAccounts] = useState<SelectedAccount[]>([]);
  const [loadingSenders, setLoadingSenders] = useState<boolean>(true);
  const [campaignName, setCampaignName] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState<Dayjs | null>(null);

  // --- Estados para Test Email ---
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);
  // --- FIN: NUEVOS ESTADOS ---


  // --- useCallback para fetchCsvPreview (sin cambios respecto a lo anterior) ---
  const fetchCsvPreview = useCallback(async (campaignId: string) => {
    console.log("Llamando a fetchCsvPreview para campaignId:", campaignId);
    setIsPreviewLoading(true);
    setCsvPreview(null);
    setColumnMapping({ email: '', name: '' });
    setFormError('');
    try {
      const response = await apiClient.get(`/sender/campaigns/${campaignId}/csv-preview`);
      console.log("Respuesta de /csv-preview:", response.data);
      setCsvPreview(response.data);
      if (response.data.has_header && response.data.columns) {
        const columnsLower = response.data.columns.map((c: string) => (c || '').toLowerCase());
        const emailIndex = columnsLower.findIndex((c: string) => c === 'email' || c === 'correo');
        const nameIndex = columnsLower.findIndex((c: string) => c === 'name' || c === 'nombre' || c.includes('first name') || c.includes('primer nombre'));
        const emailCol = emailIndex !== -1 ? response.data.columns[emailIndex] : '';
        const nameCol = nameIndex !== -1 ? response.data.columns[nameIndex] : '';
        console.log("Auto-mapeo detectado:", { emailCol, nameCol });
        setColumnMapping({ email: emailCol, name: nameCol });
      }
    } catch (err: any) {
      console.error("Error fetching CSV preview:", err);
      setFormError(err.response?.data?.detail || 'Failed to load CSV preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  // --- useEffects ---

  // useEffect para cargar opciones de remitente
  useEffect(() => {
    const fetchSenderOptions = async () => {
      setLoadingSenders(true);
      setFormError(''); // Limpia errores previos al cargar opciones
      try {
        const response = await apiClient.get<SenderOptions>('/sender/credentials');
        setSenderOptions(response.data);
        console.log("Opciones de remitente cargadas:", response.data);
      } catch (error: any) {
        console.error("Error fetching sender options:", error);
        setFormError(error.response?.data?.detail || "Failed to load sender account options.");
      } finally {
        setLoadingSenders(false);
      }
    };
    fetchSenderOptions();
  }, []); // Se ejecuta solo una vez

  // useEffect para manejar la lógica de preview/mapeo CSV (sin cambios respecto a lo anterior)
  useEffect(() => {
    console.log("--- useEffect CAMPAIGNFORM ---");
    console.log(`ID State: ${campaignId}, ID Prop: ${initialCampaignId}, Source: ${sourceType}, File: ${!!csvFile}, Preview: ${!!csvPreview}, Loading: ${isPreviewLoading}, ShowingMap: ${showMapping}`);
    if (initialCampaignId && initialCampaignId !== campaignId) {
      console.log("   useEffect: Prop initialCampaignId recibida/actualizada:", initialCampaignId);
      setCampaignId(initialCampaignId);
      setCsvPreview(null);
      setShowMapping(false);
      setColumnMapping({ email: '', name: '' });
      if (sourceType === 'csv' && !isPreviewLoading) {
        console.log("   useEffect: DISPARANDO fetchCsvPreview por nuevo ID Prop.");
        fetchCsvPreview(initialCampaignId);
      }
    }
    if (csvPreview && !showMapping) {
      console.log("   useEffect: DISPARANDO setShowMapping(true)");
      setShowMapping(true);
    }
    if (sourceType === 'airtable' || (sourceType === 'csv' && !csvFile && !campaignId)) {
      if (showMapping || csvPreview) {
        console.log("   useEffect: Limpiando/ocultando mapeo por cambio de fuente/archivo.");
        setShowMapping(false);
        setCsvPreview(null);
        setColumnMapping({ email: '', name: '' });
      }
    }
    console.log("--- Fin useEffect ---");
  }, [initialCampaignId, campaignId, sourceType, csvFile, csvPreview, isPreviewLoading, showMapping, fetchCsvPreview]);


  // --- Manejadores ---
  // Función para parsear CSV localmente
  const parseCSVLocally = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      // Detectar delimitador
      const firstLine = text.split('\n')[0];
      let delimiter = ',';
      if (firstLine.includes(';')) delimiter = ';';
      else if (firstLine.includes('\t')) delimiter = '\t';

      // Parsear filas
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        setFormError('CSV file is empty.');
        return;
      }

      const splitLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; }
          else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += char; }
        }
        result.push(current.trim());
        return result;
      };

      const firstRow = splitLine(lines[0]);
      const secondRow = lines.length > 1 ? splitLine(lines[1]) : [];

      // Detectar si tiene header (si todas las celdas de la primera fila son texto)
      const hasHeader = firstRow.every(cell => {
        const cleaned = cell.replace(/[.,]/g, '');
        return isNaN(Number(cleaned)) || cleaned === '';
      });

      // Construir preview
      const columns = hasHeader ? firstRow : firstRow.map((_, i) => `Columna ${i + 1}`);
      const previewData = hasHeader ? secondRow : firstRow;

      console.log("Local CSV parse:", { columns, hasHeader, previewData, delimiter });

      // Auto-detectar columnas de email y nombre
      const columnsLower = columns.map(c => c.toLowerCase());
      const emailIdx = columnsLower.findIndex(c => c === 'email' || c === 'correo' || c.includes('mail'));
      const nameIdx = columnsLower.findIndex(c => c === 'name' || c === 'nombre' || c.includes('first'));

      setCsvPreview({
        columns,
        has_header: hasHeader,
        preview_row: previewData
      });
      setColumnMapping({
        email: emailIdx >= 0 ? columns[emailIdx] : '',
        name: nameIdx >= 0 ? columns[nameIdx] : ''
      });
      setShowMapping(true);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
        setFormError('Please select a valid CSV file.');
        setCsvFile(null);
        setCsvFileName('');
        setCsvPreview(null);
        setShowMapping(false);
        event.target.value = '';
        return;
      }
      setCsvFile(file);
      setCsvFileName(file.name);
      setFormError('');
      console.log("Archivo CSV seleccionado:", file.name, file.type, file.size);

      // ✅ Parsear CSV localmente para mostrar mapeo inmediatamente
      parseCSVLocally(file);
    } else {
      setCsvFile(null);
      setCsvFileName('');
      setCsvPreview(null);
      setShowMapping(false);
    }
  };

  const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newViewMode: 'code' | 'preview' | null) => {
    // ... (sin cambios respecto a lo anterior) ...
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  // --- Función Auxiliar para obtener sender_config ---
  const getSenderConfigValue = (): string | string[] => {
    if (senderSelectionMode === 'group') {
      return selectedGroup || 'all'; // Devuelve 'all' si no hay grupo seleccionado (fallback)
    }
    if (senderSelectionMode === 'manual') {
      // Devuelve la lista de IDs de las cuentas seleccionadas
      return selectedAccounts.map(acc => acc.id);
    }
    // Por defecto o si el modo es 'all'
    return 'all';
  };

  const handleSave = () => {
    setFormError(''); // Limpia errores previos

    // --- Validaciones Comunes ---
    if (!campaignName.trim()) {
      setFormError('Campaign Name cannot be empty.'); return;
    }
    if (!subject.trim()) {
      setFormError('Email Subject cannot be empty.'); return;
    }
    if (!htmlBody.trim()) {
      setFormError('Email Body cannot be empty.'); return;
    }

    // Validación específica para selección manual de remitentes
    if (senderSelectionMode === 'manual' && selectedAccounts.length === 0) {
      setFormError('Please select at least one account for manual sender selection.'); return;
    }
    // Validación específica para selección por grupo
    if (senderSelectionMode === 'group' && !selectedGroup) {
      setFormError('Please select a sender group.'); return;
    }

    // --- Obtener sender_config ---
    const senderConfig = getSenderConfigValue();

    // --- Construcción del Payload Base ---
    const payload: any = {
      campaign_name: campaignName,
      source_type: sourceType,
      subject,
      html_body: htmlBody,
      sender_config: senderConfig,
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      csvFile: sourceType === 'csv' && !campaignId ? csvFile : undefined,
    };
    if (sourceType === 'airtable') {
      payload.region = region;
      payload.is_bounced = isBounced;
      payload.segment = segment; // ✅ Incluir segmento en payload
    }

    // --- Lógica para CSV ---
    if (sourceType === 'csv') {
      // Validar que haya archivo si es nueva campaña
      if (!csvFile && !campaignId) {
        setFormError('Please select a CSV file.'); return;
      }

      // Validar mapeo si tenemos preview local
      if (showMapping && csvPreview) {
        if (!columnMapping.email) { setFormError('Please select the column containing Email addresses.'); return; }
        if (!columnMapping.name) { setFormError('Please select the column containing the recipient Name.'); return; }
        if (columnMapping.email === columnMapping.name) { setFormError('Email and Name must be mapped to different columns.'); return; }

        // ✅ Enviar todo junto: campaña + archivo + mapeo
        console.log('CSV con mapeo local - enviando todo junto:', { ...columnMapping, has_header: csvPreview?.has_header ?? false });
        onSave(payload, {
          email: columnMapping.email,
          name: columnMapping.name,
          has_header: csvPreview?.has_header ?? false
        });
      } else {
        // Sin preview local (caso raro), solo enviar payload
        console.log('CSV sin mapeo local - solo payload');
        onSave(payload);
      }
    } else {
      // --- Airtable - enviar directamente ---
      console.log('Airtable: Llamando a onSave con payload');
      onSave(payload);
    }
  };

  const handleSendTest = async () => {
    // Ya no requerimos campaignId para enviar test
    setSendingTest(true);
    setTestSuccessMessage(null);
    setFormError('');

    try {
      const emailList = testEmails.split(',').map(e => e.trim()).filter(e => e);
      if (emailList.length === 0) {
        alert("Please enter at least one email address.");
        setSendingTest(false);
        return;
      }

      const senderConfig = getSenderConfigValue();

      if (campaignId) {
        // Usar endpoint de campaña existente
        const payload = {
          emails: emailList,
          subject: subject,
          html_body: htmlBody,
          sender_config: senderConfig
        };
        await apiClient.post(`/sender/campaigns/${campaignId}/send-test`, payload);
      } else {
        // Usar endpoint ad-hoc (sin guardar)
        const payload = {
          emails: emailList,
          subject: subject,
          html_body: htmlBody,
          sender_config: senderConfig
        };
        await apiClient.post(`/sender/send-test-adhoc`, payload);
      }

      setTestEmailDialogOpen(false);
      setTestEmails('');
      setTestSuccessMessage(`Test email sent to ${emailList.length} recipient(s)!`);

      setTimeout(() => setTestSuccessMessage(null), 5000);

    } catch (err: any) {
      console.error("Error sending test:", err);
      setFormError(err.response?.data?.detail || "Failed to send test emails.");
      setTestEmailDialogOpen(false);
    } finally {
      setSendingTest(false);
    }
  };

  // --- Renderizado ---
  return (
    <>
      {/* Muestra el error del formulario si existe */}
      {formError && <Alert severity="error" sx={{ mb: 2, mx: 3 }}>{formError}</Alert>}
      <DialogTitle>{initialCampaignId ? 'Edit Campaign Configuration' : 'Create New Campaign'}</DialogTitle>
      <DialogContent>
        {/* Selector de Fuente */}
        <FormControl component="fieldset" margin="normal" fullWidth required>
          <FormLabel component="legend">Contact Source</FormLabel>
          <RadioGroup row value={sourceType} onChange={(e) => setSourceType(e.target.value as 'airtable' | 'csv')}>
            <FormControlLabel value="airtable" control={<Radio />} label="Airtable Contacts" />
            <FormControlLabel value="csv" control={<Radio />} label="Upload CSV" />
          </RadioGroup>
        </FormControl>

        {/* Filtros Airtable */}
        {sourceType === 'airtable' && (
          <Paper variant="outlined" sx={{ p: 2, mt: 1, mb: 2, borderColor: 'primary.main' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>Airtable Filters</Typography>
            <FormControl component="fieldset" margin="dense" fullWidth>
              <FormLabel component="legend">Target Region</FormLabel>
              <RadioGroup row value={region} onChange={(e) => setRegion(e.target.value)}>
                <FormControlLabel value="USA" control={<Radio size="small" />} label="USA" />
                <FormControlLabel value="EUR" control={<Radio size="small" />} label="EUR" />
              </RadioGroup>
            </FormControl>

            {/* ✅ Segment Selector (Nuevo) */}
            <FormControl component="fieldset" margin="dense" fullWidth sx={{ mt: 2 }}>
              <FormLabel component="legend">Target Segment</FormLabel>
              <RadioGroup row value={segment} onChange={(e) => setSegment(e.target.value as 'standard' | 'dnr')}>
                <FormControlLabel
                  value="standard"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2">Not Donors</Typography>
                      <Typography variant="caption" color="text.secondary">Standard Campaign</Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="dnr"
                  control={<Radio size="small" color="warning" />}
                  label={
                    <Box>
                      <Typography variant="body2" color="warning.main">Donors</Typography>
                      <Typography variant="caption" color="text.secondary">Special Campaign</Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>


            {/* Bounce Filter (Clarified) */}
            <FormControl component="fieldset" margin="dense" fullWidth sx={{ mt: 2 }}>
              <FormLabel component="legend">Bounce Status</FormLabel>
              <RadioGroup
                row
                value={isBounced ? "bounced" : "valid"}
                onChange={(e) => setIsBounced(e.target.value === "bounced")}
              >
                <FormControlLabel
                  value="valid"
                  control={<Radio size="small" />}
                  label="Valid Emails Only"
                />
                <FormControlLabel
                  value="bounced"
                  control={<Radio size="small" color="error" />}
                  label="Bounced Emails Only"
                />
              </RadioGroup>
            </FormControl>
          </Paper>
        )}

        {/* Subida y Mapeo CSV */}
        {sourceType === 'csv' && (
          <Paper variant="outlined" sx={{ p: 2, mt: 1, mb: 2, borderColor: 'secondary.main' }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: 'secondary.main' }}>CSV Upload & Mapping</Typography>
            {/* ... (Botón de subida y lógica de Mapeo sin cambios respecto a lo anterior) ... */}
            {(!campaignId || !showMapping) && (
              <Button
                variant="outlined" component="label" startIcon={<CloudUploadIcon />} fullWidth
                color={formError.includes('CSV file') ? "error" : "primary"} sx={{ mb: 2 }}
              >
                {csvFileName ? `Archivo: ${csvFileName}` : 'Select CSV File'}
                <Input type="file" sx={{ display: 'none' }} onChange={handleFileChange} inputProps={{ accept: ".csv, text/csv" }} />
              </Button>
            )}
            {(campaignId && showMapping && csvFileName) && (
              <Typography variant="body2" sx={{ mb: 2 }}>Archivo subido: <strong>{csvFileName}</strong></Typography>
            )}
            <Collapse in={showMapping} timeout="auto" sx={{ width: '100%' }}>
              {isPreviewLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={30} /></Box>
              ) : csvPreview ? (
                <>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Map CSV columns to required fields: <Chip label={csvPreview.has_header ? "Header Detected" : "No Header Detected"} size="small" variant="outlined" sx={{ ml: 0.5 }} />
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Data Preview (First Row):</Typography>
                  <Box sx={{ display: 'flex', overflowX: 'auto', gap: 1, p: 1, mb: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    {csvPreview.columns.map((colName, index) => (
                      <Tooltip key={index} title={colName} placement="top">
                        <Chip label={`"${csvPreview.preview_row[index] || ''}"`} variant="outlined" size="small" sx={{ flexShrink: 0 }} />
                      </Tooltip>
                    ))}
                  </Box>
                  {/* --- Usa Grid para los Selects de mapeo --- */}
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}> {/* Mantenemos tu estilo de Grid item */}
                      <FormControl fullWidth required error={formError.includes('Email column') && !columnMapping.email}>
                        <InputLabel id="email-column-label">Email Column *</InputLabel>
                        <Select
                          labelId="email-column-label" label="Email Column *" value={columnMapping.email}
                          onChange={(e) => { setColumnMapping(prev => ({ ...prev, email: e.target.value })); setFormError(''); }}
                        >
                          <MenuItem value=""><em>-- Select Column --</em></MenuItem>
                          {csvPreview.columns.map((colName, index) => (
                            <MenuItem key={`${index}-${colName}`} value={colName}>{colName}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}> {/* Mantenemos tu estilo de Grid item */}
                      <FormControl fullWidth required error={formError.includes('Name column') && !columnMapping.name}>
                        <InputLabel id="name-column-label">Name Column *</InputLabel>
                        <Select
                          labelId="name-column-label" label="Name Column *" value={columnMapping.name}
                          onChange={(e) => { setColumnMapping(prev => ({ ...prev, name: e.target.value })); setFormError(''); }}
                        >
                          <MenuItem value=""><em>-- Select Column --</em></MenuItem>
                          {csvPreview.columns.map((colName, index) => (
                            <MenuItem key={`${index}-${colName}`} value={colName}>{colName}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </>
              ) : !isPreviewLoading && campaignId ? (
                <Alert severity="warning" sx={{ mt: 2 }}>Could not load CSV preview. Please check the file format or try uploading again.</Alert>
              ) : null}
            </Collapse>
          </Paper>
        )}

        {/* --- INICIO: NUEVA SECCIÓN JSX - Selección de Remitente --- */}
        <Divider sx={{ my: 2 }}><Chip label="Sender Options" size="small" /></Divider>
        <FormControl component="fieldset" margin="normal" fullWidth required disabled={loadingSenders}>
          <FormLabel component="legend">Select Sender Accounts</FormLabel>
          {loadingSenders ? <CircularProgress size={24} sx={{ mt: 1, mb: 1 }} /> : (
            <RadioGroup
              row aria-label="sender selection mode" name="senderSelectionMode"
              value={senderSelectionMode}
              onChange={(e) => {
                const newMode = e.target.value;
                setSenderSelectionMode(newMode);
                // Resetea selecciones al cambiar de modo
                if (newMode !== 'group') setSelectedGroup('');
                if (newMode !== 'manual') setSelectedAccounts([]);
                setFormError(''); // Limpia errores al cambiar modo
              }}
            >
              <FormControlLabel value="all" control={<Radio />} label="All Available" />
              <FormControlLabel value="group" control={<Radio />} label="Specific Group" disabled={senderOptions.groups.length === 0} />
              <FormControlLabel value="manual" control={<Radio />} label="Manual Selection" disabled={senderOptions.accounts.length === 0} />
            </RadioGroup>
          )}
        </FormControl>

        {/* Select de Grupo */}
        <Collapse in={senderSelectionMode === 'group' && !loadingSenders && senderOptions.groups.length > 0} timeout="auto" sx={{ width: '100%' }}>
          <FormControl fullWidth margin="dense" required={senderSelectionMode === 'group'} error={senderSelectionMode === 'group' && !selectedGroup && formError.includes('group')}>
            <InputLabel id="sender-group-label">Select Group</InputLabel>
            <Select
              labelId="sender-group-label" value={selectedGroup} label="Select Group"
              onChange={(e) => { setSelectedGroup(e.target.value); setFormError(''); }} // Limpia error al seleccionar
            >
              <MenuItem value=""><em>-- Select a Group --</em></MenuItem>
              {senderOptions.groups.map(groupName => (
                <MenuItem key={groupName} value={groupName}>{groupName}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Collapse>

        {/* Autocomplete para Selección Manual */}
        <Collapse in={senderSelectionMode === 'manual' && !loadingSenders && senderOptions.accounts.length > 0} timeout="auto" sx={{ width: '100%' }}>
          <Autocomplete
            multiple
            options={senderOptions.accounts} // {id, group}[]
            getOptionLabel={(option) => `${option.id} (${option.group})`}
            value={selectedAccounts} // Usa el estado que guarda objetos
            onChange={(_event, newValue) => {
              setSelectedAccounts(newValue); // Actualiza con los objetos seleccionados
              setFormError(''); // Limpia error al seleccionar/deseleccionar
            }}
            isOptionEqualToValue={(option, value) => option.id === value.id && option.group === value.group}
            renderInput={(params) => (
              <TextField
                {...params} variant="outlined" label="Select Specific Accounts"
                placeholder="Accounts" margin="dense"
                // Error si modo manual está activo y no hay selección Y el error es sobre esto
                error={senderSelectionMode === 'manual' && selectedAccounts.length === 0 && formError.includes('at least one account')}
                required={senderSelectionMode === 'manual'} // Solo visualmente requerido
              />
            )}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox checked={selected} />
                {`${option.id} (${option.group})`}
              </li>
            )}
            disableCloseOnSelect
            sx={{ mt: 1 }}
          />
        </Collapse>


        <TextField
          fullWidth
          label="Campaign Name"
          variant="outlined"
          value={campaignName}
          // Limpia el error específico de este campo al escribir
          onChange={(e) => { setCampaignName(e.target.value); setFormError(''); }}
          margin="normal"
          required // Marcarlo como requerido visualmente
          // Mostrar error si el formError general incluye "Name"
          error={formError.includes('Campaign Name')}
          sx={{ mt: 2 }} // Añadir margen superior si es necesario
        />
        {/* --- FIN: NUEVA SECCIÓN JSX --- */}


        {/* Campos Comunes: Subject y Editor/Preview */}

        {/* --- Programar Envío --- */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateTimePicker
              label="Schedule Send (optional)"
              value={scheduledAt}
              onChange={(newValue) => setScheduledAt(newValue)}
              slotProps={{
                textField: {
                  fullWidth: true,
                  helperText: scheduledAt ? 'Campaign will launch automatically at this time' : 'Leave empty to save as Draft'
                }
              }}
              minDateTime={dayjs()}
            />
          </LocalizationProvider>
          {scheduledAt && (
            <Tooltip title="Clear scheduled time">
              <IconButton onClick={() => setScheduledAt(null)} color="warning" size="small">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <TextField fullWidth label="Email Subject" variant="outlined" value={subject} onChange={(e) => { setSubject(e.target.value); setFormError(''); }} margin="normal" required error={formError.includes('Subject')} />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', my: 1 }}>
          <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewChange} size="small">
            <ToggleButton value="code" aria-label="code view"><CodeIcon sx={{ mr: 1 }} /> Code</ToggleButton>
            <ToggleButton value="preview" aria-label="preview"><VisibilityIcon sx={{ mr: 1 }} /> Preview</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {viewMode === 'code' ? (
          <TextField fullWidth label="Email Body (HTML)" variant="outlined" multiline rows={10} value={htmlBody} onChange={(e) => { setHtmlBody(e.target.value); setFormError(''); }} required error={formError.includes('Body')} />
        ) : (
          <EmailPreview subject={subject} htmlBody={htmlBody} />
        )}

      </DialogContent >
      <DialogActions>
        <Button
          onClick={() => setTestEmailDialogOpen(true)}
          color="secondary"
          startIcon={<SendIcon />}
          disabled={sendingTest}
          sx={{ mr: 'auto' }} // Push to left
        >
          Send Test
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          {showMapping ? 'Confirm Mapping & Save' : (scheduledAt ? '📅 Schedule Campaign' : 'Save Campaign')}
        </Button>
      </DialogActions>

      {/* Dialog para Enviar Test */}
      <Dialog open={testEmailDialogOpen} onClose={() => !sendingTest && setTestEmailDialogOpen(false)}>
        <DialogTitle>Send Test Email</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter email addresses separated by commas. The current subject and body will be used.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Email Addresses"
            type="text"
            fullWidth
            variant="outlined"
            value={testEmails}
            onChange={(e) => setTestEmails(e.target.value)}
            placeholder="test@example.com, another@example.com"
            disabled={sendingTest}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestEmailDialogOpen(false)} disabled={sendingTest}>Cancel</Button>
          <Button onClick={handleSendTest} variant="contained" color="secondary" disabled={sendingTest}>
            {sendingTest ? <CircularProgress size={24} /> : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!testSuccessMessage}
        autoHideDuration={6000}
        onClose={() => setTestSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setTestSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
          {testSuccessMessage}
        </Alert>
      </Snackbar>
    </>
  );
};


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
          return; // Detiene
        }
      }

      // --- ETAPA 1: Crear Campaña y/o Subir Archivo ---
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
        console.log(`Etapa 1: Usando campaignId existente: ${campaignId}`);
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
          return; // Detiene
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
      <Dialog open={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingCampaignId(null); setError(null); }} fullWidth maxWidth="md">
        {/* Pasamos el ID y el callback para limpiar errores */}
        <CampaignForm
          onSave={handleSaveCampaign}
          onCancel={() => { setIsModalOpen(false); setEditingCampaignId(null); setError(null); }}
          initialCampaignId={editingCampaignId}
        />
      </Dialog>

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