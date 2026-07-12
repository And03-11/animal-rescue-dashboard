import React from 'react';
import { Alert, AlertTitle, Box, Button, Paper, Typography } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary caught an error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 560, p: { xs: 3, sm: 4 } }}>
          <Typography variant="overline" color="error.main">Application error</Typography>
          <Typography variant="h3" sx={{ mt: 1, mb: 2 }}>This page could not be displayed</Typography>
          <Alert severity="error" sx={{ mb: 3 }}>
            <AlertTitle>Something went wrong</AlertTitle>
            Your data has not been changed. Reload the workspace to try again.
          </Alert>
          <Button variant="contained" startIcon={<RefreshRoundedIcon />} onClick={() => window.location.reload()}>
            Reload workspace
          </Button>
        </Paper>
      </Box>
    );
  }
}
