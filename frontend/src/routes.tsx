// src/routes.tsx
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const DashboardHomePage = lazy(() => import('./pages/DashboardHomePage'));
const ContactSearchPage = lazy(() => import('./pages/ContactSearchPage'));
const EmailSenderPage = lazy(() => import('./pages/EmailSenderPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const FormTitleSearchPage = lazy(() => import('./pages/FormTitleSearchPage'));
const CampaignStatsPage = lazy(() => import('./pages/CampaignStatsPage'));

import { Layout } from './components/Layout';

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<Layout />}> 
          <Route index element={<DashboardHomePage />} />
          <Route path="campaign-stats" element={<CampaignStatsPage />} />
          <Route path="form-title-search" element={<FormTitleSearchPage />} />
          <Route path="contact-search" element={<ContactSearchPage />} />
          <Route path="email-sender" element={<EmailSenderPage />} />
          <Route path="campaign-detail" element={<CampaignDetailPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// src/App.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './theme/theme';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { AppRoutes } from './routes';

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </LocalizationProvider>
  );
}

export default App;
