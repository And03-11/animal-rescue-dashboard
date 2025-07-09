// src/components/ThemeSelector.tsx
import { useState, useEffect } from 'react';
import { Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { useThemeMode } from '../theme/ThemeToggleProvider';

const themeOptions = ['light', 'dark', 'lime', 'violet'] as const;

export const ThemeSelector = () => {
  const { mode, setCustomMode } = useThemeMode();
  const [theme, setTheme] = useState<string>(mode);

  useEffect(() => {
    const stored = localStorage.getItem('custom-theme');
    if (stored && themeOptions.includes(stored as typeof themeOptions[number])) {
      setTheme(stored);
      setCustomMode(stored as typeof themeOptions[number]);
    }
  }, []);

  const handleChange = (e: any) => {
    const selected = e.target.value;
    setTheme(selected);
    setCustomMode(selected);
    localStorage.setItem('custom-theme', selected);
  };

  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
      <InputLabel>Theme</InputLabel>
      <Select value={theme} onChange={handleChange} label="Theme">
        {themeOptions.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
