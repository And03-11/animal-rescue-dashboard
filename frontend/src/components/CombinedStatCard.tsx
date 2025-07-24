import { Card, CardContent, Typography, Box, Divider, useTheme } from '@mui/material';
import React from 'react';

// ✅ Ahora la métrica también acepta un ícono
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
    <Card sx={{
      flex: 1,
      minWidth: '320px',
      // Sutil borde que usa el color del tema
      border: '1px solid',
      borderColor: 'divider',
      // ✅ Efecto de transición suave para el hover
      transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[4],
      }
    }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="h6" color="text.secondary" gutterBottom textAlign="center">
          {title}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', pt: 1 }}>
          {metrics.map((metric, index) => (
            <React.Fragment key={metric.label}>
              {/* ✅ Nuevo layout interno para cada métrica */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1 }}>
                {/* Contenedor para el ícono con color primario */}
                <Box sx={{ color: 'primary.main' }}>
                  {metric.icon}
                </Box>
                <Box>
                  <Typography variant="h5" component="div" fontWeight="700">
                    {metric.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {metric.label}
                  </Typography>
                </Box>
              </Box>
              {index < metrics.length - 1 && <Divider orientation="vertical" flexItem />}
            </React.Fragment>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};