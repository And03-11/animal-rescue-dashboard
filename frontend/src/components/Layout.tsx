import React, { useState } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar,
  useMediaQuery, Zoom, AppBar, IconButton, Typography,
  Avatar, Tooltip, useTheme, Divider, Menu, MenuItem
} from '@mui/material';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

// Icons
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'; // For Templates
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'; // ✅ Nuevo icono
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

import logo from '../assets/Logo.png';
import { DarkModeToggleButton } from './DarkModeToggleButton';
import { FloatingThemeFab } from './FloatingThemeFab';
import { logout } from '../auth';

const DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 72;

export const Layout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Profile Menu State
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openMenu = Boolean(anchorEl);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSettings = () => {
    handleMenuClose();
    navigate('/settings');
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
  };

  const menuItems = [
    { text: 'Dashboard', icon: <HomeRoundedIcon />, path: '/dashboard' },
    { text: 'Analytics', icon: <AnalyticsRoundedIcon />, path: '/analytics' },
    { text: 'Comparison', icon: <CompareArrowsRoundedIcon />, path: '/comparison' },
    { text: 'Contacts', icon: <PersonSearchRoundedIcon />, path: '/contact-search' },
    { text: 'Scheduler', icon: <EventNoteRoundedIcon />, path: '/scheduler' },
    { text: 'Email', icon: <EmailRoundedIcon />, path: '/email-sender' },
    { text: 'Templates', icon: <ArticleRoundedIcon />, path: '/templates' },
  ];

  // ✅ ELIMINADO: "Users" ya no está en el menú lateral

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
        minHeight: '80px !important',
        flexDirection: collapsed ? 'column' : 'row',
        gap: collapsed ? 1 : 0,
        py: collapsed ? 2 : 0
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

        {!isMobile && (
          <IconButton onClick={() => setCollapsed(!collapsed)} size="small">
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
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

      {/* ✅ Logout button at bottom of sidebar remains as quick access */}
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
    </Box >
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

            {/* ✅ Profile Menu Trigger */}
            <Tooltip title="Account settings">
              <IconButton
                onClick={handleMenuOpen}
                size="small"
                sx={{ ml: 2 }}
                aria-controls={openMenu ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={openMenu ? 'true' : undefined}
              >
                <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>A</Avatar>
              </IconButton>
            </Tooltip>
          </Box>

          {/* ✅ Profile Menu Dropdown */}
          <Menu
            anchorEl={anchorEl}
            id="account-menu"
            open={openMenu}
            onClose={handleMenuClose}
            onClick={handleMenuClose}
            PaperProps={{
              elevation: 0,
              sx: {
                overflow: 'visible',
                filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                mt: 1.5,
                '& .MuiAvatar-root': {
                  width: 32,
                  height: 32,
                  ml: -0.5,
                  mr: 1,
                },
                '&:before': {
                  content: '""',
                  display: 'block',
                  position: 'absolute',
                  top: 0,
                  right: 14,
                  width: 10,
                  height: 10,
                  bgcolor: 'background.paper',
                  transform: 'translateY(-50%) rotate(45deg)',
                  zIndex: 0,
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <SettingsRoundedIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutRoundedIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>

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
