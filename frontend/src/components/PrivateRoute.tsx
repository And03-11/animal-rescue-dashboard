// src/components/PrivateRoute.tsx
import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';

const PrivateRoute = ({ children }: PropsWithChildren) => {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

export default PrivateRoute;
