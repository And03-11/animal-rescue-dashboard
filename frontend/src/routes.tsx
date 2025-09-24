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
import CampaignComparisonPage from './pages/CampaignComparisonPage';


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
        {/* --- Ruta Pública --- */}
        <Route path="/login" element={<LoginForm />} />

        {/* --- Rutas Protegidas con Layout --- */}
        {/* ✅ El Layout ya protege a TODAS las rutas hijas que se definen dentro */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          
          {/* ✅ La ruta "index" es la página por defecto del layout */}
          <Route 
            path="dashboard" 
            element={<PageTransition><DashboardHomePage /></PageTransition>} 
          />
          
          {/* ✅ Ya no se necesita el <PrivateRoute> en las rutas hijas */}
          <Route 
            path="analytics" 
            element={<PageTransition><CampaignAnalyticsPage /></PageTransition>} 
          />
          <Route 
            path="comparison" 
            element={<PageTransition><CampaignComparisonPage /></PageTransition>} 
          />
          <Route 
            path="contact-search" 
            element={<PageTransition><ContactSearchPage /></PageTransition>} 
          />
          <Route 
            path="email-sender" 
            element={<PageTransition><EmailSenderPage /></PageTransition>} 
          />
          <Route 
            path="campaign/:campaignId" 
            element={<PageTransition><CampaignDetailPage /></PageTransition>} 
          />

          {/* ✅ Ruta de admin, protegida por su propio wrapper específico */}
          <Route 
            path="admin/users" 
            element={
              <PrivateAdminRoute>
                <PageTransition><UserManagementPage /></PageTransition>
              </PrivateAdminRoute>
            } 
          />

          {/* ✅ El 404 también queda protegido por el Layout */}
          <Route 
            path="*" 
            element={<PageTransition><NotFoundPage /></PageTransition>} 
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
