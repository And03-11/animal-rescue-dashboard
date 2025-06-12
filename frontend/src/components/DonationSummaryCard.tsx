// src/components/DonationSummaryCard.tsx
import React from 'react';
import { Card, CardContent, Typography, Box, List, ListItem, ListItemText, ListItemAvatar, Avatar } from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

interface DonationSummaryCardProps {
  airtableProfile: any;
}

export const DonationSummaryCard: React.FC<DonationSummaryCardProps> = ({ airtableProfile }) => {
  if (!airtableProfile || !airtableProfile.found) {
    return <Typography sx={{mt: 2}}>This donor has no donation records in Airtable.</Typography>;
  }
  const { summary } = airtableProfile;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>Donation Summary (Airtable)</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5">${summary.total_donated.toFixed(2)}</Typography>
            <Typography color="text.secondary">Total Donated</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5">{summary.donation_count}</Typography>
            <Typography color="text.secondary"># of Donations</Typography>
          </Box>
        </Box>
        <Typography sx={{ mt: 2 }} color="text.secondary">History:</Typography>
        <List dense>
          {summary.donations.map((donation: any, index: number) => (
            <ListItem key={index}>
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: 'primary.light' }}>
                  <AttachMoneyIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText 
                primary={`$${donation.amount.toFixed(2)}`} 
                secondary={new Date(donation.date).toLocaleDateString('en-US')}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
};