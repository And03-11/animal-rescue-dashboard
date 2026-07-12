import React, { useState } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar,
  useMediaQuery, AppBar, IconButton, Typography,
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
import ManageSearchRoundedIcon from '@mui/icons-material/ManageSearchRounded'; // For Template Search
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded'; // For Funnel
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'; // ✅ Nuevo icono
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

import logo from '../assets/Logo.png';
import { DarkModeToggleButton } from './DarkModeToggleButton';
import { logout } from '../auth';

const DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 72;

const routeLabels: Record<string, { title: string; eyebrow: string }> = {
  '/dashboard': { title: 'Dashboard', eyebrow: 'Overview' },
  '/funnel': { title: 'New Comer Funnel', eyebrow: 'CRM' },
  '/analytics': { title: 'Campaign Analytics', eyebrow: 'Insights' },
  '/comparison': { title: 'Campaign Comparison', eyebrow: 'Insights' },
  '/contact-search': { title: 'Contact Search', eyebrow: 'CRM' },
  '/email-sender': { title: 'Email Campaigns', eyebrow: 'Email Marketing' },
  '/templates': { title: 'Templates', eyebrow: 'Email Marketing' },
  '/template-search': { title: 'Template Search', eyebrow: 'Email Marketing' },
  '/settings': { title: 'Settings', eyebrow: 'Workspace' },
};

export const Layout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = routeLabels[location.pathname] ?? (
    location.pathname.startsWith('/campaign/')
      ? { title: 'Campaign Details', eyebrow: 'Insights' }
      : { title: 'Animal Love', eyebrow: 'Operations' }
  );

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

  // Menu sections for organized navigation
  const menuSections = [
    {
      title: 'CRM',
      items: [
        { text: 'Dashboard', icon: <HomeRoundedIcon />, path: '/dashboard' },
        { text: 'New Comer Funnel', icon: <FilterAltRoundedIcon />, path: '/funnel' },
        { text: 'Analytics', icon: <AnalyticsRoundedIcon />, path: '/analytics' },
        { text: 'Comparison', icon: <CompareArrowsRoundedIcon />, path: '/comparison' },
        { text: 'Contacts', icon: <PersonSearchRoundedIcon />, path: '/contact-search' },
      ]
    },
    {
      title: 'Email Marketing',
      items: [
        { text: 'Scheduler', icon: <EventNoteRoundedIcon />, path: '/scheduler' },
        { text: 'Email', icon: <EmailRoundedIcon />, path: '/email-sender' },
        { text: 'Templates', icon: <ArticleRoundedIcon />, path: '/templates' },
        { text: 'Template Search', icon: <ManageSearchRoundedIcon />, path: '/template-search' },
      ]
    }
  ];

  const drawerContent = (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'background.paper'
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box component="img" src={logo} alt="Animal Love" sx={{ width: 36, height: 36, objectFit: 'contain' }} />
              <Box>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>Animal Love</Typography>
                <Typography variant="caption" color="text.secondary">Rescue operations</Typography>
              </Box>
            </Box>
          </motion.div>
        )}
        {collapsed && <Box component="img" src={logo} alt="Animal Love" sx={{ width: 32, height: 32, objectFit: 'contain' }} />}

        {!isMobile && (
          <IconButton onClick={() => setCollapsed(!collapsed)} size="small">
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        )}
      </Toolbar>

      <Box sx={{ px: 1.5, flexGrow: 1, overflowY: 'auto' }}>
        {menuSections.map((section, sectionIndex) => (
          <Box key={section.title}>
            {/* Section Header */}
            {!collapsed && (
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: 1.2, px: 1, mt: sectionIndex > 0 ? 2 : 0, display: 'block' }}
              >
                {section.title}
              </Typography>
            )}
            {collapsed && sectionIndex > 0 && <Divider sx={{ my: 1 }} />}

            <List disablePadding>
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                    <Tooltip title={collapsed ? item.text : ""} placement="right" arrow>
                      <ListItemButton
                        component={RouterLink}
                        to={item.path}
                        sx={{
                          minHeight: 44,
                          justifyContent: collapsed ? 'center' : 'initial',
                          px: 2,
                          borderRadius: '10px',
                          backgroundColor: isActive ? 'action.selected' : 'transparent',
                          color: isActive ? 'primary.main' : 'text.primary',
                          position: 'relative',
                          '&::before': isActive ? {
                            content: '""', position: 'absolute', left: 5, width: 3, height: 20,
                            borderRadius: 3, bgcolor: 'primary.main',
                          } : undefined,
                          '&:hover': {
                            backgroundColor: 'action.hover',
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
                              fontSize: '0.9rem'
                            }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* ✅ Logout button at bottom of sidebar remains as quick access */}
      <Box sx={{ p: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <ListItemButton
          onClick={handleLogout}
          sx={{
            borderRadius: '12px',
            justifyContent: collapsed ? 'center' : 'initial',
            color: 'error.main',
            '&:hover': { backgroundColor: 'rgba(200,71,71,0.09)' }
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
        color="transparent"
        sx={{
          width: { md: `calc(100% - ${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px)` },
          ml: { md: `${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px` },
          bgcolor: 'background.default',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 72 }, px: { xs: 2, md: 3 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' }, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {currentRoute.eyebrow}
            </Typography>
            <Typography variant="h6" color="text.primary" noWrap sx={{ lineHeight: 1.2 }}>
              {currentRoute.title}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.primary' }}>
            <DarkModeToggleButton />

            {/* ✅ Profile Menu Trigger */}
            <Tooltip title="Account settings">
              <IconButton
                onClick={handleMenuOpen}
                size="small"
                sx={{ ml: { xs: 0, sm: 1 } }}
                aria-controls={openMenu ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={openMenu ? 'true' : undefined}
              >
                <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 34, height: 34, fontSize: 14, fontWeight: 700 }}>AL</Avatar>
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
          px: { xs: 2, sm: 3, xl: 4 },
          py: { xs: 2.5, md: 3.5 },
          width: { md: `calc(100% - ${collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH}px)` },
          mt: { xs: 8, md: 9 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1440 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};
