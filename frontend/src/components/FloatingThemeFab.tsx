// src/components/FloatingThemeFab.tsx
import React, { useState } from 'react';
import {
  Fab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import GrassIcon from '@mui/icons-material/Grass';
import BoltIcon from '@mui/icons-material/Bolt';
import { useThemeMode } from '../theme/ThemeToggleProvider';

const themeOptions = [
  { key: 'light', label: 'Light', icon: <Brightness7Icon fontSize="small" /> },
  { key: 'dark', label: 'Dark', icon: <Brightness4Icon fontSize="small" /> },
  { key: 'lime', label: 'Lime', icon: <GrassIcon fontSize="small" /> },
  { key: 'violet', label: 'Violet', icon: <BoltIcon fontSize="small" /> },
];

export const FloatingThemeFab = () => {
  const { mode, setCustomMode } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleSelect = (key: string) => {
    setCustomMode(key as any);
    localStorage.setItem('custom-theme', key);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Change Theme">
        <Fab
          onClick={handleOpen}
          color="primary"
          size="medium"
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1300,
          }}
        >
          <PaletteIcon />
        </Fab>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        {themeOptions.map(({ key, label, icon }) => (
          <MenuItem key={key} selected={mode === key} onClick={() => handleSelect(key)}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
