// src/theme/ThemeToggleProvider.tsx
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { darkTheme, lightTheme, limeTheme, violetTheme, prefersDarkMode } from './theme';
import { ThemeModeContext, type ThemeMode } from './themeModeContext';

const themeMap = {
  light: lightTheme,
  dark: darkTheme,
  lime: limeTheme,
  violet: violetTheme,
};

export const ThemeToggleProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('custom-theme');
    if (stored && stored in themeMap) return stored as ThemeMode;
    return prefersDarkMode ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('custom-theme', mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setCustomMode = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
  }, []);

  const theme = useMemo(() => themeMap[mode], [mode]);
  const contextValue = useMemo(
    () => ({ mode, toggleMode, setCustomMode }),
    [mode, setCustomMode, toggleMode],
  );

  return (
    <ThemeModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};
