// src/components/BrevoCard.tsx
import React from 'react';
import { Card, CardContent, Typography, Box, List, ListItem, ListItemText, Chip } from '@mui/material';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';

interface BrevoCardProps {
  brevoProfile: any;
}

export const BrevoCard: React.FC<BrevoCardProps> = ({ brevoProfile }) => {
  if (!brevoProfile || !brevoProfile.found) {
    return <Typography sx={{mt: 2}}>This donor was not found in Brevo.</Typography>;
  }

  const { details } = brevoProfile;
  const attributes = details.attributes || {};
  const listIds = details.listIds || [];

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>Brevo Profile</Typography>
        
        <Chip 
          icon={details.emailBlacklisted ? <DoNotDisturbOnIcon /> : <MarkEmailReadIcon />}
          label={details.emailBlacklisted ? "Email Blacklisted" : "Email Active"}
          color={details.emailBlacklisted ? "error" : "success"}
          variant="outlined"
          sx={{ mb: 2 }}
        />

        <Typography sx={{ mt: 2, mb: 1 }} color="text.secondary">Attributes:</Typography>
        <List dense>
          {Object.entries(attributes).map(([key, value]) => (
            <ListItem key={key} sx={{ pl: 0 }}>
              <ListItemText primary={value as string} secondary={key} />
            </ListItem>
          ))}
        </List>

        <Typography sx={{ mt: 2, mb: 1 }} color="text.secondary">List Subscriptions:</Typography>
        <Typography variant="body1">
          The contact is in <strong>{listIds.length}</strong> list(s).
        </Typography>
        
      </CardContent>
    </Card>
  );
};