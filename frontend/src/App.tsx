// src/App.tsx
import { BrowserRouter } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { ThemeToggleProvider } from './theme/ThemeToggleProvider';
import { AppRoutes } from './routes';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ThemeToggleProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </ThemeToggleProvider>
    </LocalizationProvider>
  );
}

export default App;
