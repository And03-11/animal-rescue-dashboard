"""
Patch to fix frontend CSV flow - call save-mapping after upload
"""
filepath = 'frontend/src/pages/EmailSenderPage.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

# Find the upload block and append mapping save logic
old_upload_block = '''      // Subir CSV si aplica
      if (source_type === 'csv' && csvFile && campaignId) {
        console.log(`Etapa 1: Subiendo archivo CSV para ${campaignId}...`);
        setSnackbarMessage(`Uploading CSV file for campaign ${campaignId}...`);
        const formData = new FormData();
        formData.append('csv_file', csvFile, csvFile.name);
        try {
          await apiClient.post(`/sender/campaigns/${campaignId}/upload-csv`, formData);
          console.log(`Etapa 1: CSV subido para ${campaignId}`);
          setSnackbarMessage(`CSV uploaded! Please map columns below.`);
          // IMPORTANTE: NO CERRAMOS EL MODAL.
          // El useEffect en CampaignForm se activará y llamará a fetchCsvPreview.
        } catch (uploadErr: any) {
           console.error("Error uploading CSV:", uploadErr);
           setError(uploadErr.response?.data?.detail || 'Failed to upload CSV file.');
           setSnackbarMessage(null);
           // Podríamos resetear editingCampaignId si la subida falla y era una campaña nueva?
           // if (!editingCampaignId) setEditingCampaignId(null); // Opcional
           return; // Detiene
        }

      }'''

new_upload_block = '''      // Subir CSV si aplica
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

      }'''

if old_upload_block in content:
    content = content.replace(old_upload_block, new_upload_block)
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('SUCCESS: Updated handleSaveCampaign to call save-mapping')
else:
    print('ERROR: Pattern not found')
    # Debug
    if 'formData.append(\'csv_file\'' in content:
        print('  - Found formData append')
