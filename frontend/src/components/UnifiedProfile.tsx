// src/components/UnifiedProfile.tsx
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
  const { contact_details, airtable_summary, mailchimp_summary, brevo_summary } = profileData;

  const averageDonation = airtable_summary.donation_count > 0 
    ? airtable_summary.total_donated / airtable_summary.donation_count 
    : 0;

  return (
    <Card variant="outlined" sx={{ p: 1 }}> {/* Añadimos un poco de padding general */}
      <CardContent>
        {/* --- SECCIÓN DE IDENTIDAD --- */}
        <Typography variant="h5" component="div">
          {contact_details?.Name} {contact_details?.["Last Name"]}
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Unified Donor Profile
        </Typography>
        
        <Divider sx={{ my: 2 }} />

        {/* --- SECCIÓN DE MÉTRICAS NUMÉRICAS --- */}
        <Grid container spacing={2} sx={{ textAlign: 'center', mb: 2 }}>
          <Grid item xs={4}>
            <MonetizationOnIcon color="primary" sx={{ fontSize: 40 }}/>
            <Typography variant="h6">${airtable_summary.total_donated.toFixed(2)}</Typography>
            <Typography variant="caption" color="text.secondary">Total Donated since {airtable_summary.first_donation_date ? new Date(airtable_summary.first_donation_date).toLocaleDateString('en-US') : 'N/A'}</Typography>
          </Grid>
          <Grid item xs={4}>
            <PeopleIcon color="primary" sx={{ fontSize: 40 }}/>
            <Typography variant="h6">{airtable_summary.donation_count}</Typography>
            <Typography variant="caption" color="text.secondary">Total Donations</Typography>
          </Grid>
           <Grid item xs={4}>
            <TrendingUpIcon color="primary" sx={{ fontSize: 40 }}/>
            <Typography variant="h6">${averageDonation.toFixed(2)}</Typography>
            <Typography variant="caption" color="text.secondary">Average Donation</Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        
        {/* --- NUEVA SECCIÓN DE IDENTIFICADORES (DISEÑO MEJORADO) --- */}
        <Box sx={{ mb: 2 }}>
            <Typography color="text.secondary" gutterBottom sx={{fontSize: '0.9rem'}}>Platform Identifiers</Typography>
            <Grid container spacing={1} alignItems="center">
                {/* Brevo Big Campaign */}
                {brevo_summary.campaign !== "None" && (
                    <>
                        <Grid item xs={3} textAlign="right"><Typography variant="body2" color="text.secondary">Brevo Campaign:</Typography></Grid>
                        <Grid item xs={9}><Chip label={brevo_summary.campaign} size="small" variant="outlined" /></Grid>
                    </>
                )}
                {/* Mailchimp Tag */}
                {contact_details?.["Tag (Mailchimp)"] && (
                     <>
                        <Grid item xs={3} textAlign="right"><Typography variant="body2" color="text.secondary">Mailchimp Tag:</Typography></Grid>
                        <Grid item xs={9}><Chip label={contact_details["Tag (Mailchimp)"]} size="small" color="primary" /></Grid>
                    </>
                )}
                {/* Airtable Tag */}
                {contact_details?.Tag && (
                     <>
                        <Grid item xs={3} textAlign="right"><Typography variant="body2" color="text.secondary">Airtable Tag:</Typography></Grid>
                        <Grid item xs={9}><Chip label={contact_details.Tag} size="small" /></Grid>
                    </>
                )}
            </Grid>
        </Box>


        <Divider sx={{ my: 2 }} />

        {/* --- SECCIÓN DE ESTADO DE EMAILS --- */}
        <Grid container spacing={3}>
            {/* Columna de Mailchimp */}
            <Grid item xs={12} md={6}>
                <Typography color="text.secondary" gutterBottom>Mailchimp Email Status</Typography>
                <List dense sx={{p: 0}}>
                    {mailchimp_summary.details.map((detail: any, index: number) => (
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
            <Grid item xs={12} md={6}>
                 <Typography color="text.secondary" gutterBottom>Brevo Email Status</Typography>
                <List dense sx={{p: 0}}>
                    {brevo_summary.details.map((detail: any, index: number) => (
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
