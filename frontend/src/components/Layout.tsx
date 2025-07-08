// src/components/Layout.tsx
import React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router-dom'; // <-- Se importa Outlet

// Iconos para el menú
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import MailIcon from '@mui/icons-material/Mail';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BarChartIcon from '@mui/icons-material/BarChart';
import logo from '../assets/Logo.png';

const drawerWidth = 240;

export const Layout: React.FC = () => { // Ya no necesita la prop 'children'

  // Definimos los items del menú en un array para un fácil mantenimiento
  const menuItems = [
    { text: 'Dashboard', icon: <HomeIcon />, path: '/' },
    { text: 'Campaign Stats', icon: <BarChartIcon />, path: '/campaign-stats' },
    { text: 'Custom Reports', icon: <AssessmentIcon />, path: '/form-title-search' },
    { text: 'Contact Search', icon: <SearchIcon />, path: '/search' },
    { text: 'Send Email', icon: <MailIcon />, path: '/send-email' },
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
            backgroundColor: 'rgba(2, 47, 64, 0.4)', // Estilo del tema
            backdropFilter: 'blur(12px) saturate(180%)',
            borderRight: '1px solid rgba(56, 174, 204, 0.2)',
          },
        }}
      >
        <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
            <img src={logo} alt="Animal Rescue Center Logo" style={{ height: '70px' }} />
        </Toolbar>
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                {/* Usamos component={RouterLink} para una navegación SPA correcta */}
                <ListItemButton component={RouterLink} to={item.path}>
                  <ListItemIcon sx={{ color: 'text.primary' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} sx={{ color: 'text.primary' }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* --- ÁREA DE CONTENIDO PRINCIPAL --- */}
      <Box
        component="main"
        sx={{ 
          flexGrow: 1, 
          px: 3, 
          py: 2,
          width: `calc(100% - ${drawerWidth}px)`,
          // Centramos el contenedor de la página, pero permitimos que la página se expanda
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* LA CLAVE DE LA SOLUCIÓN: Outlet renderiza aquí la página actual */}
        <Outlet />
      </Box>
    </Box>
  );
};