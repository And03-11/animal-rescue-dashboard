// src/components/DarkModeToggleButton.tsx
import { IconButton, Tooltip } from '@mui/material';
import { useThemeMode } from '../theme/themeModeContext';
import { motion, useReducedMotion } from 'motion/react';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';

export const DarkModeToggleButton = () => {
  const { mode, toggleMode } = useThemeMode();
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <Tooltip title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
      <motion.div
        key={mode}
        initial={reduceMotion ? false : { opacity: 0.55, rotate: -18, scale: 0.92 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
      >
        <IconButton aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} color="inherit" onClick={toggleMode} size="large">
          {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </motion.div>
    </Tooltip>
  );
};
