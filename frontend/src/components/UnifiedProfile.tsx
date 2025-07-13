import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Divider, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import Grid from '@mui/material/Grid';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

interface UnifiedProfileProps {
  profileData: any;
}

export const UnifiedProfile: React.FC<UnifiedProfileProps> = ({ profileData }) => {
  // ✅ CORRECCIÓN: Usamos los nombres de propiedad correctos que envía la API.
  const { contact, airtable_summary, mailchimp, brevo } = profileData;

  // Accedemos a los campos del donante desde el objeto 'contact'
  const contactFields = contact?.fields || {};

  const averageDonation = airtable_summary.count > 0 
    ? airtable_summary.total / airtable_summary.count 
    : 0;

  return (
    <Card variant="outlined" sx={{ p: 1 }}>
      <CardContent>
        {/* --- SECCIÓN DE IDENTIDAD --- */}
        <Typography variant="h5" component="div">
          {/* ✅ CORRECCIÓN: Leemos el nombre desde 'contactFields' */}
          {contactFields.Name} {contactFields["Last Name"]}
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Unified Donor Profile
        </Typography>
        
        <Divider sx={{ my: 2 }} />

        {/* --- SECCIÓN DE MÉTRICAS NUMÉRICAS --- */}
        <Grid container spacing={2} sx={{ textAlign: 'center', mb: 2 }}>
          <Grid size={{ xs: 4 }}>
            <MonetizationOnIcon color="primary" sx={{ fontSize: 40 }}/>
            {/* ✅ CORRECCIÓN: Usamos 'airtable_summary.total' y 'airtable_summary.first_date' */}
            <Typography variant="h6">${airtable_summary.total.toFixed(2)}</Typography>
            <Typography variant="caption" color="text.secondary">Total Donated since {airtable_summary.first_date ? new Date(airtable_summary.first_date).toLocaleDateString('en-US') : 'N/A'}</Typography>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <PeopleIcon color="primary" sx={{ fontSize: 40 }}/>
            {/* ✅ CORRECCIÓN: Usamos 'airtable_summary.count' */}
            <Typography variant="h6">{airtable_summary.count}</Typography>
            <Typography variant="caption" color="text.secondary">Total Donations</Typography>
          </Grid>
           <Grid size={{ xs: 4 }}>
            <TrendingUpIcon color="primary" sx={{ fontSize: 40 }}/>
            <Typography variant="h6">${averageDonation.toFixed(2)}</Typography>
            <Typography variant="caption" color="text.secondary">Average Donation</Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        
        {/* --- SECCIÓN DE IDENTIFICADORES --- */}
        {/* No necesita cambios, ya que lee de 'contactFields' que ya corregimos */}
        <Box sx={{ mb: 2 }}>
            <Typography color="text.secondary" gutterBottom sx={{fontSize: '0.9rem'}}>Platform Identifiers</Typography>
            <Grid container spacing={1} alignItems="center">
                {/* Mailchimp Tag */}
                {contactFields?.["Tag (Mailchimp)"] && (
                     <>
                        <Grid size={{ xs: 3 }} textAlign="right"><Typography variant="body2" color="text.secondary">Mailchimp Tag:</Typography></Grid>
                        <Grid size={{ xs: 9 }}><Chip label={contactFields["Tag (Mailchimp)"]} size="small" color="primary" /></Grid>
                    </>
                )}
                {/* Airtable Tag */}
                {contactFields?.Tag && (
                     <>
                        <Grid size={{ xs: 3 }} textAlign="right"><Typography variant="body2" color="text.secondary">Airtable Tag:</Typography></Grid>
                        <Grid size={{ xs: 9 }}><Chip label={contactFields.Tag} size="small" /></Grid>
                    </>
                )}
            </Grid>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* --- SECCIÓN DE ESTADO DE EMAILS --- */}
        <Grid container spacing={3}>
            {/* Columna de Mailchimp */}
            <Grid size={{ xs: 12, md: 6 }}>
                <Typography color="text.secondary" gutterBottom>Mailchimp Email Status</Typography>
                <List dense sx={{p: 0}}>
                    {/* ✅ CORRECCIÓN: Iteramos sobre el array 'mailchimp' */}
                    {mailchimp.map((detail: any, index: number) => (
                        <ListItem key={index} disablePadding>
                            <ListItemIcon sx={{minWidth: '32px'}}>
                                {detail.found ? <CheckCircleIcon fontSize="small" color="success" /> : <CancelIcon fontSize="small" color="error" />}
                            </ListItemIcon>
                            <ListItemText primary={detail.email} />
                        </ListItem>
                    ))}
                </List>
            </Grid>
            {/* Columna de Brevo */}
            <Grid size={{ xs: 12, md: 6 }}>
                 <Typography color="text.secondary" gutterBottom>Brevo Email Status</Typography>
                <List dense sx={{p: 0}}>
                    {/* ✅ CORRECCIÓN: Iteramos sobre el array 'brevo' */}
                    {brevo.map((detail: any, index: number) => (
                        <ListItem key={index} disablePadding>
                            <ListItemIcon sx={{minWidth: '32px'}}>
                                {detail.found ? <CheckCircleIcon fontSize="small" color="success" /> : <CancelIcon fontSize="small" color="error" />}
                            </ListItemIcon>
                            <ListItemText primary={detail.email} />
                        </ListItem>
                    ))}
                </List>
            </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default UnifiedProfile;