// src/components/StatCard.tsx
import { Card, Typography, Box, useTheme, alpha } from '@mui/material';
import { motion } from 'framer-motion';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
}

export function StatCard({ title, value, icon, trend }: StatCardProps) {
  const theme = useTheme();

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -2, boxShadow: theme.shadows[2] }}
      transition={{ duration: 0.18 }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 3,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          mr: 3,
          p: 1.5,
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ zIndex: 1 }}>
        <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
          {title}
        </Typography>
        <Typography variant="h4" component="div" fontWeight="700" sx={{ letterSpacing: '-0.02em' }}>
          {value}
        </Typography>
        {trend && (
          <Typography variant="caption" color={trend.value >= 0 ? 'success.main' : 'error.main'} fontWeight={600}>
            {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
          </Typography>
        )}
      </Box>

    </Card>
  );
};
