// src/components/ThemeSelector.tsx
import { Select, MenuItem, FormControl, InputLabel, type SelectChangeEvent } from '@mui/material';
import { useThemeMode, type ThemeMode } from './themeModeContext';

const themeOptions = ['light', 'dark', 'lime', 'violet'] as const;

export const ThemeSelector = () => {
  const { mode, setCustomMode } = useThemeMode();

  const handleChange = (event: SelectChangeEvent<ThemeMode>) => {
    setCustomMode(event.target.value as ThemeMode);
  };

  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
      <InputLabel>Theme</InputLabel>
      <Select<ThemeMode> value={mode} onChange={handleChange} label="Theme">
        {themeOptions.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
