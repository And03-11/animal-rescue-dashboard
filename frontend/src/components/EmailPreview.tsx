// src/components/EmailPreview.tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

interface EmailPreviewProps {
  subject: string;
  htmlBody: string;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ subject, htmlBody }) => {
  // Combinamos el CSS básico y el HTML del usuario en un documento completo
  const iframeContent = `
    <html>
      <head>
        <style>
          /* Estilos para que el preview se parezca a un email real */
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 16px; 
            color: #212121; /* Color de texto para modo claro por defecto */
          }
          /* Si el tema principal es oscuro, ajustamos el texto del preview */
          @media (prefers-color-scheme: dark) {
            body {
              color: #E0E0E0;
            }
          }
        </style>
      </head>
      <body>${htmlBody}</body>
    </html>
  `;

  return (
    <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, height: 'auto' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="body2">
          <strong>From:</strong> You (Authenticated User)
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          <strong>Subject:</strong> {subject || '(No subject)'}
        </Typography>
      </Box>
      <iframe 
      srcDoc={iframeContent} 
      title="Email Preview" 
      style={{ width: '100%', height: '400px', border: 'none' }} 
      sandbox="allow-scripts" 
      />
    </Box>
  );
};