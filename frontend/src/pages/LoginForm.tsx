import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, IconButton, InputAdornment,
  Paper, Stack, TextField, Typography, alpha,
} from '@mui/material';
import { motion } from 'framer-motion';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import apiClient from '../api/axiosConfig';
import logo from '../assets/Logo.png';

const getRequestMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const response = (error as { response?: { data?: { detail?: unknown } } }).response;
  return typeof response?.data?.detail === 'string' ? response.data.detail : fallback;
};

export default function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const successMessage = (location.state as { message?: string } | null)?.message;

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append('username', username);
      form.append('password', password);
      const response = await apiClient.post('/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      localStorage.setItem('token', response.data.access_token);
      navigate('/dashboard');
    } catch (requestError: unknown) {
      setError(getRequestMessage(requestError, 'We could not sign you in. Check your credentials and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(420px, 0.95fr) minmax(520px, 1.05fr)' }, bgcolor: 'background.default' }}>
      <Box
        component="section"
        sx={{
          display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', justifyContent: 'space-between',
          p: { lg: 6, xl: 8 }, color: '#F4FBF8', overflow: 'hidden', position: 'relative',
          background: `linear-gradient(145deg, #0B3D38 0%, #102923 62%, #17231F 100%)`,
          '&::after': { content: '""', position: 'absolute', width: 520, height: 520, right: -180, bottom: -220, borderRadius: '50%', border: `1px solid ${alpha('#FFFFFF', 0.1)}`, boxShadow: `0 0 0 72px ${alpha('#FFFFFF', 0.025)}, 0 0 0 144px ${alpha('#FFFFFF', 0.018)}` },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
          <Box component="img" src={logo} alt="Animal Love" sx={{ width: 46, height: 46, objectFit: 'contain' }} />
          <Box>
            <Typography variant="h6" sx={{ color: 'inherit' }}>Animal Love</Typography>
            <Typography variant="caption" sx={{ color: alpha('#FFFFFF', 0.68) }}>No-kill rescue center</Typography>
          </Box>
        </Stack>

        <Box sx={{ maxWidth: 560, position: 'relative', zIndex: 1 }}>
          <Typography variant="overline" sx={{ color: '#81E6D9' }}>Rescue operations</Typography>
          <Typography variant="h1" sx={{ color: 'inherit', mt: 1.5, mb: 2.5, fontSize: { lg: '2.6rem', xl: '3.25rem' } }}>
            Every action helps an animal find safety.
          </Typography>
          <Typography sx={{ color: alpha('#FFFFFF', 0.7), fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 500 }}>
            Campaigns, donor insights and outreach tools in one focused workspace for the team.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 4 }}>
            {['Track rescue campaign performance', 'Coordinate donor communications', 'Keep the team aligned'].map((item) => (
              <Stack key={item} direction="row" spacing={1.25} alignItems="center">
                <CheckCircleRoundedIcon sx={{ color: '#81E6D9', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: alpha('#FFFFFF', 0.82) }}>{item}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ color: alpha('#FFFFFF', 0.5), position: 'relative', zIndex: 1 }}>
          Animal welfare, supported by better information.
        </Typography>
      </Box>

      <Container component="main" maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', py: { xs: 4, sm: 7 }, px: { xs: 2, sm: 4 } }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} style={{ width: '100%' }}>
          <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 }, maxWidth: 500, mx: 'auto', bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ display: { lg: 'none' }, mb: 4 }}>
              <Box component="img" src={logo} alt="Animal Love" sx={{ width: 40, height: 40, objectFit: 'contain' }} />
              <Typography variant="h6">Animal Love</Typography>
            </Stack>

            <Typography variant="overline" color="primary.main">Secure workspace</Typography>
            <Typography variant="h2" sx={{ mt: 1, mb: 1 }}>Welcome back</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>Sign in to continue to rescue operations.</Typography>

            {successMessage && <Alert severity="success" sx={{ mb: 2.5 }}>{successMessage}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleLogin} noValidate>
              <Stack spacing={2.25}>
                <TextField
                  label="Email or username" value={username} onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username" autoFocus required fullWidth
                  InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineIcon color="action" /></InputAdornment> }}
                />
                <TextField
                  label="Password" value={password} onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'} autoComplete="current-password" required fullWidth
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockOutlinedIcon color="action" /></InputAdornment>,
                    endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment>,
                  }}
                />
                <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ minHeight: 50 }}>
                  {loading ? <CircularProgress size={22} color="inherit" aria-label="Signing in" /> : 'Sign in'}
                </Button>
              </Stack>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 3, flexWrap: 'wrap' }}>
              <Button size="small" color="inherit" onClick={() => window.alert('Please contact your administrator to reset your password.')}>Forgot password?</Button>
              <Button size="small" onClick={() => navigate('/register')}>Request an account</Button>
            </Box>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  );
}
