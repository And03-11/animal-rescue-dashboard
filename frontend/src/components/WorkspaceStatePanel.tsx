import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

interface WorkspaceStatePanelProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  dashed?: boolean;
}

export function WorkspaceStatePanel({
  icon,
  title,
  description,
  action,
  dashed = false,
}: WorkspaceStatePanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: { xs: 2.5, sm: 4 },
        py: { xs: 5, sm: 6 },
        textAlign: 'center',
        bgcolor: dashed ? 'transparent' : 'background.paper',
        borderStyle: dashed ? 'dashed' : 'solid',
      }}
    >
      <Stack alignItems="center" spacing={1.5}>
        <Box
          aria-hidden="true"
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 56,
            height: 56,
            borderRadius: 3,
            color: 'primary.main',
            bgcolor: 'action.selected',
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, lineHeight: 1.65 }}>
          {description}
        </Typography>
        {action && <Box sx={{ pt: 1 }}>{action}</Box>}
      </Stack>
    </Paper>
  );
}
