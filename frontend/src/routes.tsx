// --- Archivo: src/routes.tsx ---
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

import { Layout } from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
// import PrivateAdminRoute from './components/PrivateAdminRoute'; // Ya no se usa directamente aquí, o se puede reusar para settings
import LoginForm from './pages/LoginForm';
// import UserManagementPage from './pages/UserManagementPage'; // Eliminado
import CampaignComparisonPage from './pages/CampaignComparisonPage';


const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const DashboardHomePage = lazy(() => import('./pages/DashboardHomePage'));
const CampaignAnalyticsPage = lazy(() => import('./pages/CampaignAnalyticsPage'));
const ContactSearchPage = lazy(() => import('./pages/ContactSearchPage'));
const EmailSenderPage = lazy(() => import('./pages/EmailSenderPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const CampaignSchedulerPage = lazy(() => import('./pages/CampaignSchedulerPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SharedAnalyticsPage = lazy(() => import('./pages/SharedAnalyticsPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));

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
        <Route path="/shared/:token" element={<SharedAnalyticsPage />} />

        {/* --- Standalone Private Routes (No Layout) --- */}
        <Route
          path="/scheduler"
          element={
            <PrivateRoute>
              <CampaignSchedulerPage />
            </PrivateRoute>
          }
        />

        {/* --- Rutas Protegidas con Layout --- */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>

          <Route
            path="dashboard"
            element={<PageTransition><DashboardHomePage /></PageTransition>}
          />

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


          {/* Email Templates Route */}
          <Route
            path="templates"
            element={<PageTransition><TemplatesPage /></PageTransition>}
          />

          {/* ✅ NUEVA RUTA DE SETTINGS (Accesible a todos, el tab interno controla permisos si es necesario) */}
          <Route
            path="settings"
            element={<PageTransition><SettingsPage /></PageTransition>}
          />

          {/* El 404 también queda protegido por el Layout */}
          <Route
            path="*"
            element={<PageTransition><NotFoundPage /></PageTransition>}
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
