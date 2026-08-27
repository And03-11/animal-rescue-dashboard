import React, { useState } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar,
  useMediaQuery, AppBar, IconButton, Typography,
  Avatar, Tooltip, useTheme, Divider, Menu, MenuItem,
  Button, Chip, alpha,
} from '@mui/material';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

// Icons
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'; // For Templates
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded'; // For Funnel
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'; // ✅ Nuevo icono
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';

import { DarkModeToggleButton } from './DarkModeToggleButton';
import { logout } from '../auth';
import { useWebSocket } from '../context/webSocketContext';
import logoLight from '../assets/branding/animal-love-logo.svg';
import logoDark from '../assets/branding/animal-love-logo-dark.svg';
import brandMark from '../assets/branding/animal-love-mark.svg';
import { sidebarSections, type SidebarIconName } from '../navigation/sidebarNavigation';

const DRAWER_WIDTH = 280;
const COLLAPSED_DRAWER_WIDTH = 80;

const routeLabels: Record<string, { title: string; eyebrow: string }> = {
  '/dashboard': { title: 'Impact overview', eyebrow: 'Mission control' },
  '/funnel': { title: 'New Comer Funnel', eyebrow: 'CRM' },
  '/analytics': { title: 'Campaign Analytics', eyebrow: 'Insights' },
  '/comparison': { title: 'Campaign Comparison', eyebrow: 'Insights' },
  '/contact-search': { title: 'Contact Search', eyebrow: 'CRM' },
  '/email-sender': { title: 'Email Campaigns', eyebrow: 'Email Marketing' },
  '/templates': { title: 'Templates', eyebrow: 'Email Marketing' },
  '/email-studio': { title: 'Email Studio', eyebrow: 'Email Marketing' },
  '/template-search': { title: 'Template Search', eyebrow: 'Email Marketing' },
  '/settings': { title: 'Settings', eyebrow: 'Workspace' },
};

export const Layout: React.FC = () => {
  const theme = useTheme();
  const brandLogo = theme.palette.mode === 'dark' ? logoDark : logoLight;
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const reduceMotion = Boolean(useReducedMotion());
  const { isConnected } = useWebSocket();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = routeLabels[location.pathname] ?? (
    location.pathname.startsWith('/campaign/')
      ? { title: 'Campaign Details', eyebrow: 'Insights' }
      : { title: 'Animal love', eyebrow: 'Operations' }
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

  const sidebarIcons: Record<SidebarIconName, React.ReactNode> = {
    dashboard: <HomeRoundedIcon />,
    funnel: <FilterAltRoundedIcon />,
    analytics: <AnalyticsRoundedIcon />,
    comparison: <CompareArrowsRoundedIcon />,
    contacts: <PersonSearchRoundedIcon />,
    email: <EmailRoundedIcon />,
    templates: <ArticleRoundedIcon />,
  };

  const drawerContent = (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: theme.palette.mode === 'dark'
        ? `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.98)}, ${theme.palette.background.default})`
        : `linear-gradient(180deg, ${theme.palette.background.paper}, ${alpha(theme.palette.primary.main, 0.025)})`
    }}>
      <Toolbar sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        px: 2,
        minHeight: '88px !important',
        flexDirection: collapsed ? 'column' : 'row',
        gap: collapsed ? 1 : 0,
        py: collapsed ? 2 : 0
      }}>
        {!collapsed && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
          >
            <Box
              component="img"
              src={brandLogo}
              alt="Animal love Rescue Center Costa Rica"
              sx={{ display: 'block', width: 178, height: 'auto' }}
            />
          </motion.div>
        )}
        {collapsed && (
          <Box
            component="img"
            src={brandMark}
            alt="Animal love"
            sx={{ display: 'block', width: 44, height: 44, objectFit: 'contain' }}
          />
        )}

        {!isMobile && (
          <IconButton onClick={() => setCollapsed(!collapsed)} size="small">
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        )}
      </Toolbar>

      <Box sx={{ px: 1.5, flexGrow: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
        {sidebarSections.map((section, sectionIndex) => (
          <Box key={section.title}>
            {/* Section Header */}
            {!collapsed && (
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: 1.25, px: 1.25, mt: sectionIndex > 0 ? 2.5 : 0, mb: 0.75, display: 'block' }}
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
                        onClick={() => isMobile && setMobileOpen(false)}
                        sx={{
                          minHeight: 46,
                          justifyContent: collapsed ? 'center' : 'initial',
                          px: 2,
                          borderRadius: '13px',
                          backgroundColor: isActive ? 'action.selected' : 'transparent',
                          color: isActive ? 'primary.main' : 'text.primary',
                          position: 'relative',
                          '&::before': isActive ? {
                            content: '""', position: 'absolute', left: 4, width: 3, height: 22,
                            borderRadius: 3, bgcolor: 'primary.main',
                          } : undefined,
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            transform: collapsed ? 'none' : 'translateX(2px)',
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
                          {sidebarIcons[item.icon]}
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
      <Box sx={{ p: 1.5 }}>
        <Divider sx={{ mb: 1.25 }} />
        <ListItemButton
          onClick={handleLogout}
          sx={{
            minHeight: 44,
            borderRadius: '13px',
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
          bgcolor: alpha(theme.palette.background.default, 0.84),
          backdropFilter: 'blur(18px) saturate(140%)',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 76 }, px: { xs: 2, md: 3.5 } }}>
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.25 }, color: 'text.primary' }}>
            <Chip
              size="small"
              icon={<FiberManualRecordRoundedIcon />}
              label={isConnected ? 'Live' : 'Offline'}
              variant="outlined"
              sx={{
                display: { xs: 'none', lg: 'inline-flex' },
                color: isConnected ? 'success.main' : 'text.secondary',
                borderColor: alpha(isConnected ? theme.palette.success.main : theme.palette.text.secondary, 0.28),
                '& .MuiChip-icon': { color: 'inherit', fontSize: 10 },
              }}
            />
            <Button
              component={RouterLink}
              to="/contact-search"
              color="inherit"
              variant="outlined"
              startIcon={<SearchRoundedIcon />}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, borderColor: 'divider', color: 'text.secondary', bgcolor: alpha(theme.palette.background.paper, 0.62) }}
            >
              Find donor
            </Button>
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
          mt: { xs: 8, md: 9.5 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1540 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};
