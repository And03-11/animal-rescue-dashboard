import { Card, CardContent, Typography, Box, Divider, useTheme, alpha } from '@mui/material';
import React from 'react';
import { motion } from 'framer-motion';

interface Metric {
  value: string;
  label: string;
  icon: React.ReactNode;
}

interface CombinedStatCardProps {
  title: string;
  metrics: Metric[];
}

export const CombinedStatCard: React.FC<CombinedStatCardProps> = ({ title, metrics }) => {
  const theme = useTheme();

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -4, boxShadow: theme.shadows[8] }}
      transition={{ type: "spring", stiffness: 300 }}
      sx={{
        flex: 1,
        minWidth: '300px',
        height: '100%',
        background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1.2} gutterBottom display="block" textAlign="center">
          {title}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', pt: 2 }}>
          {metrics.map((metric, index) => (
            <React.Fragment key={metric.label}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, p: 1 }}>
                <Box
                  sx={{
                    color: 'primary.main',
                    p: 1,
                    borderRadius: '50%',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    display: 'flex',
                  }}
                >
                  {metric.icon}
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" component="div" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                    {metric.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {metric.label}
                  </Typography>
                </Box>
              </Box>
              {index < metrics.length - 1 && (
                <Divider orientation="vertical" flexItem sx={{ height: '40px', alignSelf: 'center', opacity: 0.5 }} />
              )}
            </React.Fragment>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};