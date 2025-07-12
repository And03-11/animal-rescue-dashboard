// --- src/components/PrivateAdminRoute.tsx ---
import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { isTokenValid, isAdmin } from '../auth';
import { Box, Typography } from '@mui/material';

const PrivateAdminRoute = ({ children }: PropsWithChildren) => {
  const valid = isTokenValid();
  const admin = isAdmin();

  console.log("🔐 Token valid:", valid);
  console.log("👑 Is admin:", admin);

  if (!valid) {
    return <Navigate to="/login" replace />;
  }

  if (!admin) {
    return (
      <Box sx={{ textAlign: 'center', mt: 8 }}>
        <Typography variant="h4" color="error" gutterBottom>
          403 - Access Denied
        </Typography>
        <Typography>You do not have admin permissions to view this page.</Typography>
      </Box>
    );
  }

  return <>{children}</>;
};

export default PrivateAdminRoute;
