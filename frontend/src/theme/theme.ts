
// src/theme/theme.ts
import { createTheme, ThemeOptions } from '@mui/material/styles';

export const prefersDarkMode =
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const baseComponents: ThemeOptions['components'] = {
  MuiListItemIcon: {
    styleOverrides: {
      root: {
        transition: 'all 0.3s ease',
        color: 'inherit',
        '&:hover': {
          color: '#6c5ce7',
          transform: 'scale(1.1)',
        },
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          transition: 'border 0.3s ease',
          '&.Mui-focused fieldset': {
            borderColor: 'currentColor',
            boxShadow: '0 0 5px currentColor',
          },
        },
      },
    },
  },
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        transition: 'all 0.3s ease',
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        transition: 'all 0.3s ease',
        borderRadius: 12,
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        transition: 'all 0.3s ease',
        fontWeight: 500,
      },
      containedPrimary: {
        boxShadow: '0 0 10px rgba(0,0,0,0.2)',
        '&:hover': {
          transform: 'scale(1.03)',
        },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        transition: 'all 0.3s ease',
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: 'currentColor',
          boxShadow: '0 0 5px currentColor',
        },
      },
    },
  },
  MuiListItemButton: {
  styleOverrides: {
    root: {
      '&:hover .MuiListItemIcon-root': {
        color: '#6c5ce7',
        transform: 'scale(1.1)',
      },
    }
  }
}
};

export const lightTheme = createTheme({
  shape: { borderRadius: 12 },
  spacing: 8,
  palette: {
    mode: 'light',
    primary: { main: '#0A66C2' },
    secondary: { main: '#0369a1' },
    background: {
      default: '#fdfdfc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#4a4a4a',
    },
  },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#fdfdfc',
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  shape: { borderRadius: 12 },
  spacing: 8,
  palette: {
    mode: 'dark',
    primary: { main: '#38AECC' },
    secondary: { main: '#046E8F' },
    background: {
      default: '#0A1929',
      paper: 'rgba(13, 27, 42, 0.65)',
    },
    text: {
      primary: '#E0E6E9',
      secondary: '#BFACB5',
    },
  },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'linear-gradient(145deg, #022F40 0%, #0A1929 100%)',
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(13, 27, 42, 0.65)',
          backdropFilter: 'blur(12px) saturate(180%)',
          border: '1px solid rgba(56, 174, 204, 0.2)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(2, 47, 64, 0.4)',
          backdropFilter: 'blur(12px) saturate(180%)',
          borderRight: '1px solid rgba(56, 174, 204, 0.2)',
        },
      },
    },
  },
});

export const limeTheme = createTheme({
  shape: { borderRadius: 12 },
  spacing: 8,
  palette: {
    mode: 'light',
    primary: { main: '#A3CB38' },
    secondary: { main: '#1289A7' },
    background: {
      default: '#f7fdf4',
      paper: '#ffffff',
    },
    text: {
      primary: '#1b2b1b',
      secondary: '#4b6b4b',
    },
  },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'linear-gradient(to bottom right, #eaffea, #ffffff)',
        },
      },
    },
  },
});

export const violetTheme = createTheme({
  shape: { borderRadius: 12 },
  spacing: 8,
  palette: {
    mode: 'dark',
    primary: { main: '#9b59b6' },
    secondary: { main: '#6c5ce7' },
    background: {
      default: '#1e1b2e',
      paper: '#2c2540',
    },
    text: {
      primary: '#ecf0f1',
      secondary: '#bdc3c7',
    },
  },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'linear-gradient(135deg, #9b59b6, #6c5ce7)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #2c2540, #3a2e4d)',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      },
    },
  },
});
