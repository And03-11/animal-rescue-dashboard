// src/components/StatCard.tsx
import { Card, Typography, Box } from '@mui/material';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
}

export function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <Card sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
      <Box sx={{ mr: 2 }}>
        {icon}
      </Box>
      <Box>
        <Typography color="text.secondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h4" component="div" fontWeight="600">
          {value}
        </Typography>
      </Box>
    </Card>
  );
};