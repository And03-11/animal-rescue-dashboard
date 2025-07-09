// src/theme/ThemeToggleProvider.tsx
import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { darkTheme, lightTheme, limeTheme, violetTheme, prefersDarkMode } from './theme';

const themeMap = {
  light: lightTheme,
  dark: darkTheme,
  lime: limeTheme,
  violet: violetTheme,
};

export type ThemeMode = keyof typeof themeMap;

interface ThemeContextType {
  mode: ThemeMode;
  toggleMode: () => void;
  setCustomMode: (m: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleMode: () => {},
  setCustomMode: () => {},
});

export const useThemeMode = () => useContext(ThemeModeContext);

export const ThemeToggleProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('custom-theme');
    if (stored && stored in themeMap) return stored as ThemeMode;
    return prefersDarkMode ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('custom-theme', mode);
  }, [mode]);

  const toggleMode = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setCustomMode = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const theme = useMemo(() => themeMap[mode], [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode, setCustomMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};
