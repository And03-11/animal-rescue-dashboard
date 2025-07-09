// src/components/Layout.tsx
import React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, useMediaQuery, Zoom } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import MailIcon from '@mui/icons-material/Mail';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BarChartIcon from '@mui/icons-material/BarChart';
import logo from '../assets/Logo.png';
import { DarkModeToggleButton } from './DarkModeToggleButton';
import { FloatingThemeFab } from './FloatingThemeFab';

const drawerWidth = 240;

export const Layout: React.FC = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  const menuItems = [
    { text: 'Dashboard', icon: <HomeIcon />, path: '/' },
    { text: 'Campaign Stats', icon: <BarChartIcon />, path: '/campaign-stats' },
    { text: 'Custom Reports', icon: <AssessmentIcon />, path: '/form-title-search' },
    { text: 'Contact Search', icon: <SearchIcon />, path: '/contact-search' },
    { text: 'Send Email', icon: <MailIcon />, path: '/email-sender' },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: 'rgba(2, 47, 64, 0.4)',
            backdropFilter: 'blur(12px) saturate(180%)',
            borderRight: '1px solid rgba(56, 174, 204, 0.2)',
          },
        }}
      >
        <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1 }}>
          <img src={logo} alt="Animal Rescue Center Logo" style={{ height: '50px' }} />
          <DarkModeToggleButton />
        </Toolbar>
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton component={RouterLink} to={item.path}>
                  <ListItemIcon sx={{ color: 'text.primary' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} sx={{ color: 'text.primary' }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: 3,
          py: 2,
          width: `calc(100% - ${drawerWidth}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Outlet />
        <Zoom in={!isMobile} timeout={400}>
          <Box>
            <FloatingThemeFab />
          </Box>
        </Zoom>
      </Box>
    </Box>
  );
};
