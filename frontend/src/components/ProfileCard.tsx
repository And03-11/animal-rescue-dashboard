// src/components/ProfileCard.tsx
import React from 'react';
import { Card, CardContent, Typography, Box, Chip } from '@mui/material';

interface ProfileCardProps {
  contactDetails: any;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ contactDetails }) => {
  if (!contactDetails) {
    return null;
  }
  const { Name, "Last Name": LastName, Tag, "Tag (Mailchimp)": MailchimpTag } = contactDetails;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h5" component="div">
          {Name} {LastName}
        </Typography>
        <Typography sx={{ mb: 1.5 }} color="text.secondary">
          Donor Profile
        </Typography>
        <Box sx={{ mt: 2 }}>
          {Tag && <Chip label={`Airtable Tag: ${Tag}`} sx={{ mr: 1, mb: 1 }} />}
          {MailchimpTag && <Chip label={`Mailchimp Tag: ${MailchimpTag}`} color="primary" sx={{ mr: 1, mb: 1 }} />}
        </Box>
      </CardContent>
    </Card>
  );
};