// src/routes.tsx
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

import { Layout } from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import LoginForm from './pages/LoginForm';

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const DashboardHomePage = lazy(() => import('./pages/DashboardHomePage'));
const CampaignStatsPage = lazy(() => import('./pages/CampaignStatsPage'));
const FormTitleSearchPage = lazy(() => import('./pages/FormTitleSearchPage'));
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
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <PrivateRoute>
                <PageTransition><DashboardHomePage /></PageTransition>
              </PrivateRoute>
            }
          />
          <Route path="campaign-stats" element={
            <PrivateRoute>
              <PageTransition><CampaignStatsPage /></PageTransition>
            </PrivateRoute>
          } />
          <Route path="form-title-search" element={
            <PrivateRoute>
              <PageTransition><FormTitleSearchPage /></PageTransition>
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
          <Route path="campaign-detail" element={
            <PrivateRoute>
              <PageTransition><CampaignDetailPage /></PageTransition>
            </PrivateRoute>
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
