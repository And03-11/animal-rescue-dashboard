"""
Patch to fix CSV mapping flow - combine upload + mapping in single step
"""
filepath = 'frontend/src/pages/EmailSenderPage.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

# Fix the handleSave logic for CSV with local preview
old_logic = '''    // --- Lógica de Etapas (CSV) ---
    if (showMapping && sourceType === 'csv') {
      // --- ETAPA 2: Confirmar Mapeo ---
      if (!columnMapping.email) { setFormError('Please select the column containing Email addresses.'); return; }
      if (!columnMapping.name) { setFormError('Please select the column containing the recipient Name.'); return; }
      if (columnMapping.email === columnMapping.name) { setFormError('Email and Name must be mapped to different columns.'); return; }

      console.log('Etapa 2: Llamando a onSave con mapeo:', { ...columnMapping, has_header: csvPreview?.has_header ?? false });
      // Llama a onSave (en EmailSenderPage) pasando el payload base Y el objeto de mapeo
      onSave(payload, {
          email: columnMapping.email,
          name: columnMapping.name,
          has_header: csvPreview?.has_header ?? false
      });

    } else {
      // --- ETAPA 1: Guardar Configuración / Subir Archivo ---
      if (sourceType === 'csv' && !csvFile && !campaignId) {
          setFormError('Please select a CSV file.'); return;
      }

      console.log('Etapa 1: Llamando a onSave solo con payload (config/archivo/sender_config)');
      // Llama a onSave (en EmailSenderPage) solo con el payload base
      onSave(payload);
    }'''

new_logic = '''    // --- Lógica para CSV ---
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
    }'''

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('SUCCESS: Fixed handleSave logic for CSV mapping')
else:
    print('ERROR: Pattern not found')
    if 'ETAPA 2: Confirmar Mapeo' in content:
        print('  - Found "ETAPA 2" text')
    if 'showMapping && sourceType' in content:
        print('  - Found showMapping condition')
