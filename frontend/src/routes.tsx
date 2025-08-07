// --- Archivo: src/routes.tsx ---
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

import { Layout } from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import PrivateAdminRoute from './components/PrivateAdminRoute'; // ✅ nuevo
import LoginForm from './pages/LoginForm';
import UserManagementPage from './pages/UserManagementPage';

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const DashboardHomePage = lazy(() => import('./pages/DashboardHomePage'));
const CampaignAnalyticsPage = lazy(() => import('./pages/CampaignAnalyticsPage'));
const ContactSearchPage = lazy(() => import('./pages/ContactSearchPage'));
const EmailSenderPage = lazy(() => import('./pages/EmailSenderPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));

const SpinnerFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress color="primary" size={48} thickness={4} />
  </Box>
);

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
        style={{ width: '100%' }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <Box sx={{ flexGrow: 1, maxWidth: '1280px', width: '100%' }}>
            {children}
          </Box>
        </Box>
      </motion.div>
    </AnimatePresence>
  );
};

export function AppRoutes() {
  return (
    <Suspense fallback={<SpinnerFallback />}>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route
            index
            element={
              <PrivateRoute>
                <PageTransition><DashboardHomePage /></PageTransition>
              </PrivateRoute>
            }
          />
          <Route path="dashboard" element={
            <PrivateRoute>
              <PageTransition><DashboardHomePage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="analytics" element={
            <PrivateRoute>
              <PageTransition><CampaignAnalyticsPage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="contact-search" element={
            <PrivateRoute>
              <PageTransition><ContactSearchPage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="email-sender" element={
            <PrivateRoute>
              <PageTransition><EmailSenderPage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="campaign/:campaignId" element={
            <PrivateRoute>
              <PageTransition><CampaignDetailPage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="admin/users" element={
            <PrivateAdminRoute>
              <PageTransition><UserManagementPage /></PageTransition>
            </PrivateAdminRoute>
          } />
          <Route path="*" element={
            <PrivateRoute>
              <PageTransition><NotFoundPage /></PageTransition>
            </PrivateRoute>
          } />
        </Route>
      </Routes>
    </Suspense>
  );
}
