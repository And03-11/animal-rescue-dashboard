// src/App.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme/theme';
import { Layout } from './components/Layout';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { ContactSearchPage } from './pages/ContactSearchPage';
import { EmailSenderPage } from './pages/EmailSenderPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';

// ¡Nuevos imports!
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

function App() {
  return (
    // ¡Envolvemos todo en el LocalizationProvider!
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<DashboardHomePage />} />
              <Route path="/search" element={<ContactSearchPage />} />
              <Route path="/send-email" element={<EmailSenderPage />} />
              <Route path="/campaign/:campaignId" element={<CampaignDetailPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </LocalizationProvider>
  );
}
export default App;