// src/pages/EmailSenderPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react'; // <-- Cambio aquí
import {
  Box, Button, Typography, CircularProgress, Alert, Snackbar,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogActions, DialogContent, DialogTitle, TextField,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Checkbox, Chip,
  Container, Link, LinearProgress, Input, // <-- Asegúrate que Input está importado
  ToggleButtonGroup, ToggleButton, Select, MenuItem, InputLabel, Grid, Collapse,// <-- Asegúrate que estos están importados
  Tooltip
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudUploadIcon from '@mui/icons-material/CloudUpload'; // <-- Icono para subida
import CodeIcon from '@mui/icons-material/Code'; // <-- Icono para vista código
import VisibilityIcon from '@mui/icons-material/Visibility'; // <-- Icono para vista previa
import apiClient from '../api/axiosConfig';
import { EmailPreview } from '../components/EmailPreview'; // <-- Componente de vista previa



interface CampaignFormProps {
  onSave: (
    campaign: any,
    // El mapeo es opcional y solo se envía en la segunda etapa
    mapping?: { email: string; name: string; has_header: boolean }
  ) => void; // onSave ahora puede recibir el mapeo
  onCancel: () => void;
  initialCampaignId?: string | null; // <-- Prop opcional para pasar el ID
}

// --- Componente del Formulario para Crear Campañas (ACTUALIZADO) ---
const CampaignForm: React.FC<CampaignFormProps> = ({ onSave, onCancel, initialCampaignId = null }) => {
  // --- Estados ---
  const [sourceType, setSourceType] = useState<'airtable' | 'csv'>('airtable'); // Nuevo estado para fuente
  const [region, setRegion] = useState('USA'); // Específico de Airtable
  const [isBounced, setIsBounced] = useState(false); // Específico de Airtable
  const [subject, setSubject] = useState(''); // Común
  const [htmlBody, setHtmlBody] = useState('<h1>New Campaign</h1>\n<p>Write your content here.</p>'); // Común
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code'); // Para editor HTML
  const [csvFile, setCsvFile] = useState<File | null>(null); // Nuevo estado para archivo CSV
  const [csvFileName, setCsvFileName] = useState<string>(''); // Nuevo estado para nombre archivo CSV
  // Guarda la respuesta del endpoint /csv-preview
  const [csvPreview, setCsvPreview] = useState<{ columns: string[], preview_row: string[], has_header: boolean } | null>(null);
  // Guarda la selección del usuario (qué columna del CSV es Email, qué columna es Nombre)
  const [columnMapping, setColumnMapping] = useState<{ email: string, name: string }>({ email: '', name: '' });
  // Para mostrar un spinner mientras se carga el preview
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
// Controla si se debe mostrar la sección de mapeo
  const [showMapping, setShowMapping] = useState<boolean>(false);


  const fetchCsvPreview = useCallback(async (campaignId: string) => {
    console.log("Llamando a fetchCsvPreview para campaignId:", campaignId); // Log para depuración
    setIsPreviewLoading(true);
    setCsvPreview(null); // Limpia preview anterior
    setColumnMapping({ email: '', name: '' }); // Resetea mapeo
    setFormError(''); // Limpia errores
    try {
      const response = await apiClient.get(`/sender/campaigns/${campaignId}/csv-preview`);
      console.log("Respuesta de /csv-preview:", response.data); // Log para depuración
      setCsvPreview(response.data);

      // Intenta pre-seleccionar automáticamente si hay cabeceras con nombres comunes
      if (response.data.has_header && response.data.columns) {
        const columnsLower = response.data.columns.map((c: string) => (c || '').toLowerCase()); // Maneja posibles null/undefined
        const emailIndex = columnsLower.findIndex((c: string) => c === 'email' || c === 'correo');
        const nameIndex = columnsLower.findIndex((c: string) => c === 'name' || c === 'nombre' || c.includes('first name') || c.includes('primer nombre')); // Más flexible

        const emailCol = emailIndex !== -1 ? response.data.columns[emailIndex] : '';
        const nameCol = nameIndex !== -1 ? response.data.columns[nameIndex] : '';

        console.log("Auto-mapeo detectado:", { emailCol, nameCol }); // Log para depuración
        setColumnMapping({ email: emailCol, name: nameCol });
      }

    } catch (err: any) {
      console.error("Error fetching CSV preview:", err);
      setFormError(err.response?.data?.detail || 'Failed to load CSV preview.');
      // Considera si limpiar el archivo seleccionado si el preview falla
      // setCsvFile(null);
      // setCsvFileName('');
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);


  useEffect(() => {
  console.log("--- useEffect CAMPAIGNFORM ---");
  console.log(`ID State: ${campaignId}, ID Prop: ${initialCampaignId}, Source: ${sourceType}, File: ${!!csvFile}, Preview: ${!!csvPreview}, Loading: ${isPreviewLoading}, ShowingMap: ${showMapping}`);

  // A) Detecta si la PROP initialCampaignId acaba de recibir un valor válido
  //    Y si es diferente del estado interno actual.
  if (initialCampaignId && initialCampaignId !== campaignId) {
      console.log("   useEffect: Prop initialCampaignId recibida/actualizada:", initialCampaignId);
      // Actualiza el estado interno
      setCampaignId(initialCampaignId);
      // IMPORTANTE: Resetea preview y mapeo al recibir un NUEVO ID
      setCsvPreview(null);
      setShowMapping(false);
      setColumnMapping({ email: '', name: '' });

      // SI ADEMÁS es CSV, llama a fetchCsvPreview INMEDIATAMENTE
      if (sourceType === 'csv' && !isPreviewLoading) { // Evita llamadas duplicadas si ya está cargando
          console.log("   useEffect: DISPARANDO fetchCsvPreview por nuevo ID Prop.");
          fetchCsvPreview(initialCampaignId); // Llama con el nuevo ID directamente
      }
  }

  // B) Disparador para MOSTRAR el mapeo (sin cambios):
  //    - Ya tenemos datos de preview.
  //    - Aún no lo estamos mostrando.
  if (csvPreview && !showMapping) {
      console.log("   useEffect: DISPARANDO setShowMapping(true)");
      setShowMapping(true);
  }

  // C) Limpieza si se cambia a Airtable o se quita el archivo ANTES de guardar (sin cambios)
   if (sourceType === 'airtable' || (sourceType ==='csv' && !csvFile && !campaignId)) {
       if (showMapping || csvPreview) {
          console.log("   useEffect: Limpiando/ocultando mapeo por cambio de fuente/archivo.");
          setShowMapping(false);
          setCsvPreview(null);
          setColumnMapping({ email: '', name: '' });
       }
   }
   console.log("--- Fin useEffect ---");

// Ajusta las dependencias: Ahora reacciona principalmente a initialCampaignId
}, [initialCampaignId, campaignId, sourceType, csvFile, csvPreview, isPreviewLoading, showMapping, fetchCsvPreview]); // Dependencias revisadas
  // --- FIN NUEVO useEffect ---

  // --- Manejadores ---
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      // Validación básica de tipo (aunque 'accept' ya ayuda)
      if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
        alert('Please select a valid CSV file.');
        setCsvFile(null);
        setCsvFileName('');
        event.target.value = ''; // Limpia el input por si eligen el mismo archivo inválido otra vez
        return;
      }
      setCsvFile(file);
      setCsvFileName(file.name);
      console.log("Archivo CSV seleccionado:", file.name, file.type, file.size);
    } else {
      setCsvFile(null);
      setCsvFileName('');
    }
  };

  const handleViewChange = (
    _event: React.MouseEvent<HTMLElement>, // Argumento 1: Evento (puedes usar _event si no lo necesitas)
    newViewMode: 'code' | 'preview' | null // Argumento 2: Nuevo valor ('code', 'preview', o null si se deselecciona)
  ) => {
    // Solo actualiza el estado si se seleccionó un modo válido (no null)
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const handleSave = () => {
    setFormError(''); // Limpia errores previos

    // --- Validaciones Comunes ---
    if (!subject.trim()) {
      setFormError('Email Subject cannot be empty.');
      return;
    }
    if (!htmlBody.trim()) {
      setFormError('Email Body cannot be empty.');
      return;
    }

    // --- Construcción del Payload Base ---
    const payload: any = {
      source_type: sourceType,
      subject,
      html_body: htmlBody,
      // Incluye el archivo CSV solo si es la fuente CSV Y AÚN NO tenemos un campaignId
      // (esto indica que es la primera vez que se guarda, antes de subir el archivo)
      csvFile: sourceType === 'csv' && !campaignId ? csvFile : undefined,
    };
    if (sourceType === 'airtable') {
      payload.region = region;
      payload.is_bounced = isBounced;
    }

    // --- Lógica de Etapas ---
    if (showMapping && sourceType === 'csv') {
      // --- ETAPA 2: Confirmar Mapeo ---
      // Validar que las columnas estén mapeadas
      if (!columnMapping.email) {
          setFormError('Please select the column containing Email addresses.');
          return;
      }
      if (!columnMapping.name) {
          setFormError('Please select the column containing the recipient Name.');
          return;
      }
      // Validar que no se haya mapeado la misma columna a ambos campos
      if (columnMapping.email === columnMapping.name) {
          setFormError('Email and Name must be mapped to different columns.');
          return;
      }

      console.log('Etapa 2: Llamando a onSave con mapeo:', { ...columnMapping, has_header: csvPreview?.has_header ?? false });
      // Llama a onSave (en EmailSenderPage) pasando el payload base Y el objeto de mapeo
      onSave(payload, {
          email: columnMapping.email,
          name: columnMapping.name,
          has_header: csvPreview?.has_header ?? false // Incluye si se detectó cabecera
      });

    } else {
      // --- ETAPA 1: Guardar Configuración / Subir Archivo ---
      // Si es CSV, valida que se haya seleccionado un archivo
      if (sourceType === 'csv' && !csvFile && !campaignId) { // Solo requerir archivo si es la primera vez
          setFormError('Please select a CSV file.');
          return;
      }

      console.log('Etapa 1: Llamando a onSave sin mapeo (solo config/archivo)');
      // Llama a onSave (en EmailSenderPage) solo con el payload base (que puede incluir csvFile)
      onSave(payload);
    }
  };

  // --- Renderizado ---
  return (
    <>
      <DialogTitle>Create New Campaign</DialogTitle>
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
                <FormControlLabel value="USA" control={<Radio size="small"/>} label="USA" />
                <FormControlLabel value="EUR" control={<Radio size="small"/>} label="EUR" />
                <FormControlLabel value="TEST" control={<Radio size="small"/>} label="TEST" />
              </RadioGroup>
            </FormControl>
            <FormControlLabel
              control={<Checkbox checked={isBounced} onChange={(e) => setIsBounced(e.target.checked)} />}
              label="Target Bounced Accounts Only"
              sx={{ display: 'block', mt: 1 }}
            />
          </Paper>
        )}

        {/* Subida CSV */}
        {sourceType === 'csv' && (
          <Paper variant="outlined" sx={{ p: 2, mt: 1, mb: 2, borderColor: 'secondary.main' }}>
             <Typography variant="subtitle2" sx={{ mb: 2, color: 'secondary.main' }}>CSV Upload & Mapping</Typography>

          {/* --- Botón de subida O nombre del archivo --- */}
          {/* Muestra el botón solo si NO hay campaignId (antes de la Etapa 1) O si NO estamos mostrando el mapeo */}
          {(!campaignId || !showMapping) && (
            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUploadIcon />}
              fullWidth
              color={formError && !csvFile ? "error" : "primary"}
              sx={{ mb: 2 }} // Margen inferior
            >
              {csvFileName ? `Archivo: ${csvFileName}` : 'Select CSV File'}
              <Input
                type="file"
                sx={{ display: 'none' }}
                onChange={handleFileChange}
                inputProps={{ accept: ".csv, text/csv" }}
              />
            </Button>
          )}
          {/* Muestra el nombre si ya estamos en la etapa de mapeo */}
          {(campaignId && showMapping && csvFileName) && (
              <Typography variant="body2" sx={{mb: 2}}>Archivo subido: <strong>{csvFileName}</strong></Typography>
          )}

          {/* --- Interfaz de Mapeo (se muestra después de subir y cargar preview) --- */}
          {/* Usa 'Collapse' para una transición suave */}
          <Collapse in={showMapping} timeout="auto" sx={{ width: '100%' }}>
            {/* Muestra spinner mientras carga el preview */}
            {isPreviewLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={30} /></Box>
            ) : csvPreview ? ( // Muestra el mapeo solo si tenemos datos de preview
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Map CSV columns to required fields: <Chip label={csvPreview.has_header ? "Header Detected" : "No Header Detected"} size="small" variant="outlined" sx={{ml: 0.5}}/>
                </Typography>

                {/* --- Fila de Preview --- */}
                <Typography variant="caption" color="text.secondary" display="block">Data Preview (First Row):</Typography>
                <Box sx={{ display: 'flex', overflowX: 'auto', gap: 1, p: 1, mb: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  {csvPreview.columns.map((colName, index) => (
                    <Tooltip key={index} title={colName} placement="top">
                      <Chip
                        //label={`${colName}: "${csvPreview.preview_row[index] || ''}"`} // Demasiado largo a veces
                        label={`"${csvPreview.preview_row[index] || ''}"`} // Muestra solo el valor
                        variant="outlined"
                        size="small"
                        sx={{ flexShrink: 0 }} // Evita que los chips se encojan
                      />
                    </Tooltip>
                  ))}
                </Box>
                {/* --- Fin Fila de Preview --- */}


                {/* --- Desplegables de Mapeo --- */}
                <Grid container spacing={2}>
                  {/* Desplegable para Email */}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth required error={!!formError && !columnMapping.email}>
                      <InputLabel id="email-column-label">Email Column *</InputLabel>
                      <Select
                        labelId="email-column-label"
                        label="Email Column *" // El * indica requerido visualmente
                        value={columnMapping.email}
                        onChange={(e) => { setColumnMapping(prev => ({ ...prev, email: e.target.value })); setFormError(''); }} // Limpia error al seleccionar
                      >
                        <MenuItem value=""><em>-- Select Column --</em></MenuItem>
                        {csvPreview.columns.map((colName, index) => (
                          // Usamos el nombre de la columna (o índice genérico) como valor
                          <MenuItem key={`${index}-${colName}`} value={colName}>{colName}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  {/* Desplegable para Nombre */}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth required error={!!formError && !columnMapping.name}>
                      <InputLabel id="name-column-label">Name Column *</InputLabel>
                      <Select
                        labelId="name-column-label"
                        label="Name Column *"
                        value={columnMapping.name}
                        onChange={(e) => { setColumnMapping(prev => ({ ...prev, name: e.target.value })); setFormError(''); }} // Limpia error al seleccionar
                      >
                        <MenuItem value=""><em>-- Select Column --</em></MenuItem>
                        {csvPreview.columns.map((colName, index) => (
                          <MenuItem key={`${index}-${colName}`} value={colName}>{colName}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                {/* --- Fin Desplegables de Mapeo --- */}
              </>
            ) : !isPreviewLoading && campaignId ? ( // Muestra un mensaje si falló la carga del preview
                <Alert severity="warning" sx={{mt: 2}}>Could not load CSV preview. Please check the file format or try uploading again.</Alert>
            ) : null /* Fin csvPreview / !isPreviewLoading */}
          </Collapse>
          </Paper>
        )}

        {/* Campos Comunes */}
        <TextField fullWidth label="Email Subject" variant="outlined" value={subject} onChange={(e) => setSubject(e.target.value)} margin="normal" required />

        {/* Toggle Código/Vista Previa */}
        <Box sx={{display: 'flex', justifyContent: 'flex-end', my: 1}}>
            <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewChange} size="small">
                <ToggleButton value="code" aria-label="code view"><CodeIcon sx={{mr:1}}/> Code</ToggleButton>
                <ToggleButton value="preview" aria-label="preview"><VisibilityIcon sx={{mr:1}}/> Preview</ToggleButton>
            </ToggleButtonGroup>
        </Box>

        {/* Editor o Vista Previa */}
        {viewMode === 'code' ? (
            <TextField fullWidth label="Email Body (HTML)" variant="outlined" multiline rows={10} value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} required />
        ) : (
            <EmailPreview subject={subject} htmlBody={htmlBody} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
    {/* Cambia el texto del botón si estamos en la fase de mapeo */}
    {showMapping ? 'Confirm Mapping & Save' : 'Save Campaign'}
</Button>
      </DialogActions>
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
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    // Si no estamos en modo loading inicial, evitamos mostrar el spinner principal
    // para los refrescos automáticos, pero sí actualizamos los datos.
    // setLoading(true); // <-- Comentamos o eliminamos esta línea si estaba

    try {
      // Forzamos que no use caché para obtener siempre el estado más reciente
      const response = await apiClient.get('/sender/campaigns', {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
      });
      setCampaigns(response.data);
      // Limpiamos errores previos si la carga fue exitosa
      setError(null);
    } catch (err) {
      setError('Failed to load campaigns.');
      console.error(err);
    } finally {
      // Solo desactivamos el loading inicial la primera vez
      if (loading) setLoading(false);
    }
  }, [loading]); // Añadimos loading como dependencia para controlar el estado inicial

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // El fetch inicial solo se ejecuta una vez

  // Polling para campañas 'Sending'
  useEffect(() => {
    const isCampaignSending = campaigns.some(c => c.status === 'Sending');
    if (!isCampaignSending) return;

    console.log("Polling active for sending campaigns...");
    const intervalId = setInterval(() => {
      console.log("Polling for campaign updates...");
      fetchCampaigns(); // Llama a fetchCampaigns sin activar el loading principal
    }, 5000); // Revisa cada 5 segundos

    return () => {
      console.log("Polling stopped.");
      clearInterval(intervalId); // Limpia el intervalo al desmontar o si ya no hay campañas enviando
    }
  }, [campaigns, fetchCampaigns]);


  const handleSaveCampaign = async (
    campaignDataFromForm: any,
    // El mapeo es opcional y solo viene en la Etapa 2
    mapping?: { email: string; name: string; has_header: boolean }
  ) => {
    // Extrae el archivo y tipo de fuente SÓLO si es la Etapa 1
    // En Etapa 2, csvFile vendrá como undefined desde CampaignForm, lo cual está bien.
    const { csvFile, ...campaignBaseDataWithSource } = campaignDataFromForm; // <-- Cambio aquí
    const source_type = campaignBaseDataWithSource.source_type;
    setError(null); // Limpia errores previos

    try {
        // --- ETAPA 2: Guardar el Mapeo ---
        // Si viene el objeto 'mapping', significa que estamos confirmando
        if (mapping && editingCampaignId && source_type === 'csv') {
            console.log("Etapa 2: Confirmando mapeo para:", editingCampaignId, mapping);
            setSnackbarMessage(`Saving column mapping for campaign ${editingCampaignId}...`);

            // !!! PRÓXIMAMENTE: Llamada al endpoint para guardar el mapeo !!!
            // await apiClient.post(`/sender/campaigns/${editingCampaignId}/save-mapping`, mapping);
            try {
                // Llama al nuevo endpoint del backend, enviando el objeto 'mapping'
                // El backend espera 'email', 'name', 'has_header'
                await apiClient.post(`/sender/campaigns/${editingCampaignId}/save-mapping`, mapping);

                setSnackbarMessage(`Column mapping saved successfully for campaign ${editingCampaignId}!`);
                setIsModalOpen(false); // Cierra el modal
                setEditingCampaignId(null); // Limpia el ID en edición
                fetchCampaigns(); // Refresca la lista principal
                return; // Termina la ejecución aquí

            } catch (err: any) {
                // Si falla específicamente el guardado del mapeo
                console.error("Error saving mapping:", err);
                let mapError = err.response?.data?.detail || 'Failed to save column mapping.';
                setError(mapError); // Muestra el error
                // Mantenemos el modal abierto y el ID para reintentar? Opcional.
                // setIsModalOpen(false);
                // setEditingCampaignId(null);
                return; // Detiene la ejecución en caso de error
            }
        }

        // --- ETAPA 1: Crear Campaña y/o Subir Archivo ---
        // Si NO viene 'mapping', estamos en la primera etapa.

        // Solo necesitamos crear la campaña si aún no tenemos un ID
        let campaignId = editingCampaignId; // Usa el ID si ya existe (ej. si falla la subida y reintentan)
        if (!campaignId) {
            console.log("Etapa 1: Creando configuración de campaña...");
            setSnackbarMessage(`Saving campaign configuration...`);
            const createResponse = await apiClient.post('/sender/campaigns', campaignBaseDataWithSource);
            const newCampaign = createResponse.data;
            campaignId = newCampaign.id;
            setEditingCampaignId(campaignId); // <-- Guarda el ID nuevo en el estado
            console.log(`Etapa 1: Configuración guardada (ID: ${campaignId})`);
            setSnackbarMessage(`Configuration saved (ID: ${campaignId})...`);
        } else {
             console.log(`Etapa 1: Usando campaignId existente: ${campaignId}`);
        }


        // Si es tipo CSV y tenemos un archivo para subir (viene en campaignDataFromForm.csvFile)
        if (source_type === 'csv' && csvFile && campaignId) {
            console.log(`Etapa 1: Subiendo archivo CSV para ${campaignId}...`);
            setSnackbarMessage(`Uploading CSV file for campaign ${campaignId}...`);
            const formData = new FormData();
            formData.append('csv_file', csvFile, csvFile.name);

            // Llamada al endpoint de subida que ya creamos
            await apiClient.post(`/sender/campaigns/${campaignId}/upload-csv`, formData);

            console.log(`Etapa 1: CSV subido para ${campaignId}`);
            setSnackbarMessage(`CSV uploaded! Please map columns below.`);
            // IMPORTANTE: NO cerramos el modal.
            // El useEffect dentro de CampaignForm se activará porque
            // editingCampaignId (pasado como initialCampaignId) ahora tiene valor,
            // y llamará a fetchCsvPreview.
        } else if (source_type === 'airtable') {
            // Si es Airtable, la creación fue todo, cerramos el modal.
            console.log("Etapa 1: Campaña Airtable creada. Cerrando modal.");
            setIsModalOpen(false);
            setEditingCampaignId(null); // Limpia ID
            fetchCampaigns(); // Refresca lista
        }

    } catch (err: any) {
        console.error("Error en handleSaveCampaign:", err);
        let errorMessage = 'Failed operation.';
        if (err.response) {
            errorMessage = err.response.data?.detail || `Server error: ${err.response.status}`;
        } else if (err.request) {
            errorMessage = 'No response from server. Check network connection.';
        } else {
            errorMessage = `Error setting up request: ${err.message}`;
        }
        setError(errorMessage); // Muestra el error en la UI principal
        // Considerar si resetear `editingCampaignId` si la creación inicial falla
        // if (!mapping) setEditingCampaignId(null);
    } finally {
       // setLoading(false); // Podríamos quitar el loading general si ya no lo usamos
    }
};

  const handleLaunchCampaign = async (campaignId: string) => {
    // Podríamos añadir un estado de loading específico para el botón si quisiéramos
    try {
      const response = await apiClient.post(`/sender/campaigns/${campaignId}/launch`);
      setSnackbarMessage(response.data.message || 'Campaign launch initiated!');
      // Esperar un poco antes de refrescar para dar tiempo al backend a cambiar el estado
      setTimeout(fetchCampaigns, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to launch campaign.');
      console.error(err);
    }
  };

  // --- Renderizado ---
  // Muestra el spinner principal solo en la carga inicial
  if (loading && campaigns.length === 0) return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <CircularProgress />
      </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}> {/* Añadido margen superior e inferior */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}> {/* Aumentado margen inferior */}
        <Typography variant="h4" component="h1">
          Campaign Manager
        </Typography>
        <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => { setEditingCampaignId(null); setIsModalOpen(true);}}>
          Create New Campaign
        </Button>
      </Box>

      {/* Muestra error general si existe y no es durante la carga inicial */}
      {error && !loading && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Created At</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Source</TableCell> {/* <-- NUEVA COLUMNA */}
                <TableCell>Target Info</TableCell> {/* <-- Renombrada */}
                <TableCell>Status</TableCell>
                <TableCell sx={{minWidth: 200}}>Progress</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 && !loading ? (
                  <TableRow>
                      <TableCell colSpan={7} align="center">
                          No campaigns found. Create one to get started!
                      </TableCell>
                  </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}> {/* Evita doble borde */}
                    <TableCell>{new Date(campaign.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                    <TableCell sx={{fontWeight: 500}}>
                      <Link component={RouterLink} to={`/campaign/${campaign.id}`} underline="hover" color="inherit">
                        {campaign.subject || '(No Subject)'}
                      </Link>
                    </TableCell>
                    {/* --- NUEVO: Mostrar Fuente --- */}
                    <TableCell>
                        <Chip
                            label={campaign.source_type?.toUpperCase()}
                            size="small"
                            color={campaign.source_type === 'airtable' ? 'info' : 'secondary'}
                            variant="outlined"
                        />
                    </TableCell>
                    {/* --- NUEVO: Mostrar Info de Target --- */}
                    <TableCell>
                      {campaign.source_type === 'airtable'
                        ? `${campaign.region} (Bounced: ${campaign.is_bounced ? 'Yes' : 'No'})`
                        : campaign.csv_filename || 'CSV file'}{/* Mostraremos nombre del CSV luego */}
                    </TableCell>
                    <TableCell>
                      <Chip label={campaign.status} color={campaign.status === 'Completed' ? 'success' : campaign.status === 'Sending' ? 'warning' : 'default'} size="small"/>
                    </TableCell>
                    <TableCell>
                      {/* Mostrar progreso solo si hay contactos definidos */}
                      {(campaign.progress && campaign.progress.total > 0) || campaign.status === 'Sending' ? (
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box sx={{ width: '100%', mr: 1 }}>
                            <LinearProgress
                                variant="determinate"
                                // Asegurarse que el valor es numérico y está entre 0 y 100
                                value={Math.min(100, Math.max(0, Number(campaign.progress?.percentage) || 0))}
                                color={campaign.status === 'Sending' ? 'warning' : 'primary'}
                            />
                          </Box>
                          <Box sx={{ minWidth: 70 }}>
                            <Typography variant="body2" color="text.secondary">{`${campaign.progress?.sent || 0} / ${campaign.progress?.total || '?'}`}</Typography>
                          </Box>
                        </Box>
                      ) : campaign.source_type === 'csv' && campaign.status === 'Draft' ? (
                         <Typography variant="caption" color="text.secondary">Waiting for CSV...</Typography>
                      ) : (
                          <Typography variant="caption" color="text.secondary">N/A</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {/* Lógica de Habilitación del Botón */}
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RocketLaunchIcon />}
                        onClick={() => handleLaunchCampaign(campaign.id)}
                        // --- MODIFICA ESTA CONDICIÓN ---
                        disabled={
                          campaign.status === 'Sending' || // No lanzar si ya está enviando
                          (campaign.status === 'Completed' && campaign.progress?.sent === campaign.progress?.total) || // No lanzar si ya completó todo
                          // Permitir lanzar si es Draft Y NO ES CSV (solo Airtable)
                          // O si es CSV y NO ESTÁ en estado 'Ready'
                          (campaign.status === 'Draft' && campaign.source_type === 'csv') // <-- Cambio clave: Deshabilitado en Draft SOLO si es CSV
                          // Alternativamente, podrías habilitarlo solo si status es 'Ready' o 'Draft' (para Airtable)
                          // !['Ready', 'Draft'].includes(campaign.status) || (campaign.source_type === 'csv' && campaign.status !== 'Ready')
                        }
                        // --- FIN MODIFICACIÓN ---
                      >
                        {campaign.status === 'Sending' ? 'Sending...' : 'Launch'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modal para Crear Campaña */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} fullWidth maxWidth="md">
        {/* Pasamos las props al componente del formulario */}
        <CampaignForm
          onSave={handleSaveCampaign} // Aún no hemos modificado esta función
          onCancel={() => setIsModalOpen(false)}
          initialCampaignId={editingCampaignId} // <-- Pasa el estado aquí
        />
      </Dialog>

      {/* Snackbar para notificaciones */}
      <Snackbar
          open={!!snackbarMessage}
          autoHideDuration={6000}
          onClose={() => setSnackbarMessage(null)}
          message={snackbarMessage}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} // Posición
      />
    </Container>
  );
};

export default EmailSenderPage; // Asegúrate que la exportación default esté presente