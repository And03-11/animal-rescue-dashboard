import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, IconButton, InputAdornment,
  Paper, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { motion } from 'framer-motion';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import apiClient from '../api/axiosConfig';
import logoLight from '../assets/branding/animal-love-logo.svg';
import logoDark from '../assets/branding/animal-love-logo-dark.svg';

const getRequestMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const response = (error as { response?: { data?: { detail?: unknown } } }).response;
  return typeof response?.data?.detail === 'string' ? response.data.detail : fallback;
};

export default function RegisterForm() {
  const theme = useTheme();
  const interfaceLogo = theme.palette.mode === 'dark' ? logoDark : logoLight;
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/register', { username, password });
      navigate('/login', { state: { message: 'Account created. You can now sign in.' } });
    } catch (requestError: unknown) {
      setError(getRequestMessage(requestError, 'We could not create the account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Button startIcon={<ArrowBackRoundedIcon />} color="inherit" onClick={() => navigate('/login')} sx={{ mb: 2 }}>Back to sign in</Button>
          <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 } }}>
            <Box
              component="img"
              src={interfaceLogo}
              alt="Animal love Rescue Center Costa Rica"
              sx={{ display: 'block', width: 260, maxWidth: '82%', height: 'auto', mb: 4 }}
            />

            <Typography variant="overline" color="primary.main">Team access</Typography>
            <Typography variant="h2" sx={{ mt: 1, mb: 1 }}>Create your account</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>Use your organization email to join the administrative workspace.</Typography>

            {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleRegister} noValidate>
              <Stack spacing={2.25}>
                <TextField label="Organization email" type="email" autoComplete="email" value={username} onChange={(event) => setUsername(event.target.value)} required fullWidth InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineIcon color="action" /></InputAdornment> }} />
                <TextField label="Password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required fullWidth InputProps={{ startAdornment: <InputAdornment position="start"><LockOutlinedIcon color="action" /></InputAdornment> }} />
                <TextField label="Confirm password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required fullWidth InputProps={{
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon color="action" /></InputAdornment>,
                  endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} onClick={() => setShowPassword((value) => !value)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment>,
                }} />
                <Typography variant="caption" color="text.secondary">Use at least 8 characters. Avoid reusing a personal password.</Typography>
                <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ minHeight: 50, mt: 1 }}>
                  {loading ? <CircularProgress size={22} color="inherit" aria-label="Creating account" /> : 'Create account'}
                </Button>
              </Stack>
            </Box>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  );
}
