// src/App.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme/theme';
import { Layout } from './components/Layout'; // Nuestro nuevo Layout con menú
import { DashboardHomePage } from './pages/DashboardHomePage';
import { ContactSearchPage } from './pages/ContactSearchPage';
import { EmailSenderPage } from './pages/EmailSenderPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardHomePage />} />
            <Route path="/search" element={<ContactSearchPage />} />
            <Route path="/send-email" element={<EmailSenderPage />} />
            {/* V NUEVA RUTA V */}
            <Route path="/campaign/:campaignId" element={<CampaignDetailPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}
export default App;