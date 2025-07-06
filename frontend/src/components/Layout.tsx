import React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Link } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import MailIcon from '@mui/icons-material/Mail';
import HomeIcon from '@mui/icons-material/Home';
// ¡NUEVO ÍCONO IMPORTADO!
import AssessmentIcon from '@mui/icons-material/Assessment'; 
import logo from '../assets/Logo.png';

const drawerWidth = 240;

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', p: 1, justifyContent: 'center' }}>
            <img src={logo} alt="Animal Rescue Center Logo" style={{ height: '70px' }} />
        </Box>
        <Box sx={{ overflow: 'auto' }}>
          <List>
            <ListItem disablePadding>
              <ListItemButton component={Link} to="/">
                <ListItemIcon sx={{ color: 'text.primary' }}><HomeIcon /></ListItemIcon>
                <ListItemText primary="Dashboard" sx={{ color: 'text.primary' }} />
              </ListItemButton>
            </ListItem>
            {/* ¡AQUÍ ESTÁ EL CAMBIO! */}
            <ListItem disablePadding>
              <ListItemButton component={Link} to="/form-title-search">
                {/* Ícono cambiado */}
                <ListItemIcon sx={{ color: 'text.primary' }}><AssessmentIcon /></ListItemIcon>
                {/* Texto cambiado */}
                <ListItemText primary="Custom Reports" sx={{ color: 'text.primary' }} />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton component={Link} to="/search">
                <ListItemIcon sx={{ color: 'text.primary' }}><SearchIcon /></ListItemIcon>
                <ListItemText primary="Contact Search" sx={{ color: 'text.primary' }} />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton component={Link} to="/send-email">
                <ListItemIcon sx={{ color: 'text.primary' }}><MailIcon /></ListItemIcon>
                <ListItemText primary="Send Email" sx={{ color: 'text.primary' }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{ 
          flexGrow: 1, 
          px: 3, 
          py: 2,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {children}
      </Box>
    </Box>
  );
};
