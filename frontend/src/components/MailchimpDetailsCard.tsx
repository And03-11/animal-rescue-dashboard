// src/components/MailchimpDetailsCard.tsx
import React from 'react';
import { Card, CardContent, Typography, List, ListItem, ListItemText, ListItemIcon } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

interface MailchimpDetailsCardProps {
  mailchimpProfile: any;
}

export const MailchimpDetailsCard: React.FC<MailchimpDetailsCardProps> = ({ mailchimpProfile }) => {
  if (!mailchimpProfile || mailchimpProfile.email_count === 0) {
    return <Typography sx={{mt: 2}}>This donor has no registered emails.</Typography>;
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>Mailchimp Status</Typography>
        <List dense>
          {mailchimpProfile.details.map((detail: any, index: number) => (
            <ListItem key={index}>
              <ListItemIcon>
                {detail.found ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
              </ListItemIcon>
              <ListItemText 
                primary={detail.email}
                secondary={detail.found ? `Found with tags: ${detail.tags.join(', ')}` : 'Not found in Mailchimp'}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
};