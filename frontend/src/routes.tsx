// src/routes.tsx
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

import { Layout } from './components/Layout';

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

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

const routes = [
  { path: '/', element: lazy(() => import('./pages/DashboardHomePage')), index: true },
  { path: 'campaign-stats', element: lazy(() => import('./pages/CampaignStatsPage')) },
  { path: 'form-title-search', element: lazy(() => import('./pages/FormTitleSearchPage')) },
  { path: 'contact-search', element: lazy(() => import('./pages/ContactSearchPage')) },
  { path: 'email-sender', element: lazy(() => import('./pages/EmailSenderPage')) },
  { path: 'campaign-detail', element: lazy(() => import('./pages/CampaignDetailPage')) },
];

export function AppRoutes() {
  return (
    <Suspense fallback={<SpinnerFallback />}>
      <Routes>
        <Route path="/" element={<Layout />}>
          {routes.map(({ path, element: Component, index }) => (
            <Route
              key={path}
              path={index ? undefined : path}
              index={!!index}
              element={<PageTransition><Component /></PageTransition>}
            />
          ))}
          <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
        </Route>
      </Routes>
    </Suspense>
  );
}


