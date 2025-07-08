// src/App.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme/theme';
import { Layout } from './components/Layout';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { ContactSearchPage } from './pages/ContactSearchPage';
import { EmailSenderPage } from './pages/EmailSenderPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';
import { FormTitleSearchPage } from './pages/FormTitleSearchPage';
import { CampaignStatsPage } from './pages/CampaignStatsPage'; // Asegúrate de importar la página de estadísticas

import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            {/* --- ESTRUCTURA DE RUTA CORREGIDA --- */}
            <Route path="/" element={<Layout />}>
              {/* La ruta del dashboard ahora es una "index route" */}
              <Route index element={<DashboardHomePage />} />
              <Route path="search" element={<ContactSearchPage />} />
              <Route path="send-email" element={<EmailSenderPage />} />
              <Route path="form-title-search" element={<FormTitleSearchPage />} />
              <Route path="campaign-stats" element={<CampaignStatsPage />} />
              <Route path="campaign/:campaignId" element={<CampaignDetailPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </LocalizationProvider>
  );
}

export default App;