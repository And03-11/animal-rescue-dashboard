"""
Patch to show CSV mapping immediately after file upload (client-side parsing)
"""
filepath = 'frontend/src/pages/EmailSenderPage.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

# Replace handleFileChange to parse CSV locally
old_handler = '''  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    // ... (sin cambios respecto a lo anterior) ...
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
        setFormError('Please select a valid CSV file.'); // Usar formError en lugar de alert
        setCsvFile(null);
        setCsvFileName('');
        event.target.value = '';
        return;
      }
      setCsvFile(file);
      setCsvFileName(file.name);
      setFormError(''); // Limpia error si el archivo es válido
      console.log("Archivo CSV seleccionado:", file.name, file.type, file.size);
    } else {
      setCsvFile(null);
      setCsvFileName('');
    }
  };'''

new_handler = '''  // Función para parsear CSV localmente
  const parseCSVLocally = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      // Detectar delimitador
      const firstLine = text.split('\\n')[0];
      let delimiter = ',';
      if (firstLine.includes(';')) delimiter = ';';
      else if (firstLine.includes('\\t')) delimiter = '\\t';
      
      // Parsear filas
      const lines = text.split('\\n').filter(line => line.trim());
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
  };'''

if old_handler in content:
    content = content.replace(old_handler, new_handler)
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('SUCCESS: Updated handleFileChange to parse CSV locally')
else:
    print('ERROR: Pattern not found')
    # Debug
    if 'handleFileChange' in content:
        print('  - handleFileChange exists in file')
    if 'setCsvFile(file)' in content:
        print('  - setCsvFile(file) exists')
