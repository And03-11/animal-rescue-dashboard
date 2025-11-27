// src/theme/theme.ts
import { createTheme, alpha } from "@mui/material/styles";
import type { ThemeOptions } from "@mui/material/styles";

// --- Constants & Utilities ---
const GLASS_BG_DARK = "rgba(18, 18, 28, 0.75)";
const GLASS_BORDER_DARK = "rgba(255, 255, 255, 0.08)";
const GLASS_BLUR = "20px";

const GLASS_BG_LIGHT = "rgba(255, 255, 255, 0.85)";
const GLASS_BORDER_LIGHT = "rgba(255, 255, 255, 0.6)";

export const prefersDarkMode =
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

// Helper to get common component overrides
const getBaseComponents = (mode: 'light' | 'dark'): ThemeOptions['components'] => {
  const isDark = mode === 'dark';
  const glassBg = isDark ? GLASS_BG_DARK : GLASS_BG_LIGHT;
  const glassBorder = isDark ? GLASS_BORDER_DARK : GLASS_BORDER_LIGHT;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          transition: 'background-color 0.3s ease, color 0.3s ease',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(150, 150, 150, 0.3)',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: 'rgba(150, 150, 150, 0.5)',
            },
          },
          ...(isDark && {
            backgroundColor: '#0f172a',
            backgroundImage: 'radial-gradient(at 50% 0%, #1e293b 0%, #0f172a 70%)',
            backgroundAttachment: 'fixed',
          }),
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: '10px',
          padding: '8px 20px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
        contained: {
          boxShadow: '0 4px 14px 0 rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          transition: 'box-shadow 0.3s ease, background-color 0.3s ease',
          backgroundColor: glassBg,
          backdropFilter: `blur(${GLASS_BLUR})`,
          border: `1px solid ${glassBorder}`,
          ...(isDark && {
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
          }),
        },
        rounded: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          overflow: 'hidden',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${alpha('#888', 0.1)}`,
          padding: '16px 24px',
        },
        head: {
          fontWeight: 700,
          textTransform: 'uppercase',
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
          ...(isDark && {
            backgroundColor: alpha('#1e293b', 0.8),
            color: '#94a3b8',
          }),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: '8px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            transition: 'all 0.2s ease',
            '& fieldset': {
              borderColor: alpha('#888', 0.2),
            },
            '&:hover fieldset': {
              borderColor: alpha('#888', 0.4),
            },
            '&.Mui-focused fieldset': {
              borderWidth: 2,
            },
          },
        },
      },
    },
  };
};

// --- Light Theme ---
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6366f1', // Indigo
      light: '#818cf8',
      dark: '#4f46e5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ec4899', // Pink
      light: '#f472b6',
      dark: '#db2777',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f3f4f6', // Cool Gray 100
      paper: '#ffffff',
    },
    text: {
      primary: '#111827', // Gray 900
      secondary: '#6b7280', // Gray 500
    },
    divider: alpha('#000', 0.06),
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 16,
  },
  components: getBaseComponents('light'),
});

// --- Dark Theme ---
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#818cf8', // Indigo 400
      light: '#a5b4fc',
      dark: '#6366f1',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#f472b6', // Pink 400
      light: '#fbcfe8',
      dark: '#ec4899',
      contrastText: '#ffffff',
    },
    background: {
      default: '#0f172a', // Slate 900
      paper: '#1e293b', // Slate 800
    },
    text: {
      primary: '#f8fafc', // Slate 50
      secondary: '#94a3b8', // Slate 400
    },
    divider: alpha('#fff', 0.08),
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 16,
  },
  components: getBaseComponents('dark'),
});

// --- Other Themes (Kept for compatibility but modernized) ---
export const limeTheme = createTheme({
  ...lightTheme,
  palette: {
    ...lightTheme.palette,
    primary: { main: '#84cc16' }, // Lime 500
    secondary: { main: '#06b6d4' }, // Cyan 500
  },
  components: getBaseComponents('light'),
});

export const violetTheme = createTheme({
  ...darkTheme,
  palette: {
    ...darkTheme.palette,
    primary: { main: '#a78bfa' }, // Violet 400
    secondary: { main: '#c084fc' }, // Purple 400
    background: {
      default: '#2e1065', // Violet 950
      paper: '#4c1d95', // Violet 900
    },
  },
  components: {
    ...getBaseComponents('dark'),
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'linear-gradient(to bottom right, #2e1065, #000000)',
        },
      },
    },
  },
});
