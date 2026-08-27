import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'lime' | 'violet';

export interface ThemeModeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setCustomMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'light',
  toggleMode: () => {},
  setCustomMode: () => {},
});

export const useThemeMode = () => useContext(ThemeModeContext);
