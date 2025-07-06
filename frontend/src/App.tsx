import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme/theme';
import { Layout } from './components/Layout';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { ContactSearchPage } from './pages/ContactSearchPage';
import { EmailSenderPage } from './pages/EmailSenderPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';
import { FormTitleSearchPage } from './pages/FormTitleSearchPage'; // <-- Importa la nueva página

import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<DashboardHomePage />} />
              <Route path="/search" element={<ContactSearchPage />} />
              <Route path="/send-email" element={<EmailSenderPage />} />
              <Route path="/form-title-search" element={<FormTitleSearchPage />} /> {/* <-- Añade la nueva ruta */}
              <Route path="/campaign/:campaignId" element={<CampaignDetailPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </LocalizationProvider>
  );
}
export default App;
