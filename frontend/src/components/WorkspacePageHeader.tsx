import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface WorkspacePageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  icon,
  meta,
  actions,
}: WorkspacePageHeaderProps) {
  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
      justifyContent="space-between"
      gap={2.5}
    >
      <Stack direction="row" gap={1.75} alignItems="flex-start" sx={{ minWidth: 0 }}>
        {icon && (
          <Box
            aria-hidden="true"
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 44,
              height: 44,
              mt: 0.25,
              flexShrink: 0,
              borderRadius: 2.5,
              color: 'primary.main',
              bgcolor: 'action.selected',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {icon}
          </Box>
        )}

        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography variant="overline" color="primary.main">
              {eyebrow}
            </Typography>
          )}
          <Typography component="h1" variant="h4" sx={{ mb: 0.75 }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 680, lineHeight: 1.65 }}>
            {description}
          </Typography>
          {meta && <Box sx={{ mt: 1.5 }}>{meta}</Box>}
        </Box>
      </Stack>

      {actions && (
        <Box sx={{ flexShrink: 0, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          {actions}
        </Box>
      )}
    </Stack>
  );
}
