// src/theme/theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark', // Activamos el modo oscuro

    primary: {
      main: '#38AECC', // Pacific cyan: un azul brillante para acciones
    },
    secondary: {
      main: '#046E8F', // Cerulean: un azul más profundo para acentos
    },
    background: {
      // Estos colores ahora serán usados por los componentes, no por el fondo global
      paper: 'rgba(13, 27, 42, 0.65)', // Color de las tarjetas: oscuro y semitransparente
      default: '#0A1929', // Un fondo base para otros elementos si fuera necesario
    },
    text: {
        primary: '#E0E6E9',
        secondary: '#BFACB5',
    }
  },
  typography: {
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 600, color: '#FFFFFF' },
    h6: { fontWeight: 600, color: '#E0E6E9' },
  },
  components: {
    // AQUÍ FORZAMOS EL FONDO CON GRADIENTE
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'linear-gradient(145deg, #022F40 0%, #0A1929 100%)',
          backgroundAttachment: 'fixed',
        },
      },
    },
    // AQUÍ APLICAMOS EL EFECTO "CRISTAL"
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(13, 27, 42, 0.65)',
          backdropFilter: 'blur(12px) saturate(180%)',
          border: '1px solid rgba(56, 174, 204, 0.2)',
          borderRadius: 12,
        },
      },
    },
    MuiDrawer: {
        styleOverrides: {
            paper: {
                backgroundColor: 'rgba(2, 47, 64, 0.4)',
                backdropFilter: 'blur(12px) saturate(180%)',
                borderRight: '1px solid rgba(56, 174, 204, 0.2)',
            }
        }
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
            boxShadow: '0 0 15px rgba(56, 174, 204, 0.4)',
        }
      },
    },
     MuiStepIcon: {
        styleOverrides: {
            root: {
                '&.Mui-active': { color: '#38AECC' },
                '&.Mui-completed': { color: '#38AECC' },
            }
        }
     }
  },
});