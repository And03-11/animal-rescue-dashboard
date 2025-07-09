// src/components/ThemeMenu.tsx
import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import { useThemeMode } from '../theme/ThemeToggleProvider';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import PaletteIcon from '@mui/icons-material/Palette';
import GrassIcon from '@mui/icons-material/Grass';
import BoltIcon from '@mui/icons-material/Bolt';

const themeOptions = [
  { key: 'light', icon: <Brightness7Icon fontSize="small" />, label: 'Light' },
  { key: 'dark', icon: <Brightness4Icon fontSize="small" />, label: 'Dark' },
  { key: 'lime', icon: <GrassIcon fontSize="small" />, label: 'Lime' },
  { key: 'violet', icon: <BoltIcon fontSize="small" />, label: 'Violet' },
];

export const ThemeMenu = () => {
  const { mode, setCustomMode } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (value: string) => {
    setCustomMode(value as any);
    localStorage.setItem('custom-theme', value);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Select Theme">
        <IconButton onClick={handleOpen} color="inherit">
          <PaletteIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        {themeOptions.map((opt) => (
          <MenuItem key={opt.key} selected={mode === opt.key} onClick={() => handleSelect(opt.key)}>
            <ListItemIcon>{opt.icon}</ListItemIcon>
            <ListItemText>{opt.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
