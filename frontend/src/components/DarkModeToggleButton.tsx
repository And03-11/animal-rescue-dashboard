// src/components/DarkModeToggleButton.tsx
import { IconButton, Tooltip } from '@mui/material';
import { useThemeMode } from '../theme/ThemeToggleProvider';
import { motion } from 'framer-motion';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';

export const DarkModeToggleButton = () => {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Tooltip title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
      <motion.div
        initial={{ rotate: 0 }}
        animate={{ rotate: mode === 'dark' ? 360 : -360 }}
        transition={{ duration: 0.6 }}
      >
        <IconButton color="inherit" onClick={toggleMode} size="large">
          {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </motion.div>
    </Tooltip>
  );
};
