import React, { useState, useMemo } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar,
  useMediaQuery, Zoom, AppBar, IconButton, Typography,
  Avatar, Tooltip, useTheme, Divider
} from '@mui/material';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Icons
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

import logo from '../assets/Logo.png';
import { DarkModeToggleButton } from './DarkModeToggleButton';
import { FloatingThemeFab } from './FloatingThemeFab';
import { logout, isAdmin } from '../auth';

const DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 72;

export const Layout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isUserAdmin = useMemo(() => isAdmin(), []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    logout();
  };

  const menuItems = [
    { text: 'Dashboard', icon: <HomeRoundedIcon />, path: '/dashboard' },
    { text: 'Analytics', icon: <AnalyticsRoundedIcon />, path: '/analytics' },
    { text: 'Comparison', icon: <CompareArrowsRoundedIcon />, path: '/comparison' },
    { text: 'Contacts', icon: <PersonSearchRoundedIcon />, path: '/contact-search' },
    { text: 'Scheduler', icon: <EventNoteRoundedIcon />, path: '/scheduler' },
    { text: 'Email', icon: <EmailRoundedIcon />, path: '/email-sender' },
  ];

  if (isUserAdmin) {
    menuItems.push({ text: 'Users', icon: <AdminPanelSettingsRoundedIcon />, path: '/admin/users' });
  }

  const drawerContent = (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent' // Theme handles the glass effect
    }}>
      <Toolbar sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        px: 2,
        minHeight: '80px !important'
      }}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <img src={logo} alt="Logo" style={{ height: '40px' }} />
          </motion.div>
        )}
        {collapsed && <img src={logo} alt="Logo" style={{ height: '32px' }} />}

        {!isMobile && !collapsed && (
          <IconButton onClick={() => setCollapsed(true)} size="small">
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Toolbar>

      <Box sx={{ px: 2, mb: 2 }}>
        {!collapsed && (
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1.2 }}>
            Menu
          </Typography>
        )}
      </Box>

      <List sx={{ px: 1.5, flexGrow: 1 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
              <Tooltip title={collapsed ? item.text : ""} placement="right" arrow>
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  sx={{
                    minHeight: 48,
                    justifyContent: collapsed ? 'center' : 'initial',
                    px: 2.5,
                    borderRadius: '12px',
                    backgroundColor: isActive ? 'primary.main' : 'transparent',
                    color: isActive ? 'primary.contrastText' : 'text.primary',
                    '&:hover': {
                      backgroundColor: isActive ? 'primary.dark' : 'rgba(0,0,0,0.04)',
                    },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: collapsed ? 0 : 2,
                      justifyContent: 'center',
                      color: isActive ? 'inherit' : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontWeight: isActive ? 600 : 500,
                        fontSize: '0.95rem'
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ p: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <ListItemButton
          onClick={handleLogout}
          sx={{
            borderRadius: '12px',
            justifyContent: collapsed ? 'center' : 'initial',
            color: 'error.main',
            '&:hover': { backgroundColor: 'error.light', color: 'error.contrastText' }
          }}
        >
          <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 2, color: 'inherit' }}>
            <LogoutRoundedIcon />
          </ListItemIcon>
          {!collapsed && <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 600 }} />}
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Mobile Header */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px)` },
          ml: { md: `${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px` },
          bgcolor: 'transparent',
          backdropFilter: 'blur(10px)',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' }, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <DarkModeToggleButton />
            <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>A</Avatar>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: 'none',
              boxShadow: 4
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH,
              borderRight: '1px solid',
              borderColor: 'divider',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px)` },
          mt: 8, // AppBar height
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Outlet />
        <Zoom in={!isMobile} timeout={400}>
          <Box sx={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1000 }}>
            <FloatingThemeFab />
          </Box>
        </Zoom>
      </Box>
    </Box>
  );
};
