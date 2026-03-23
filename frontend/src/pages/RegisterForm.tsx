import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Alert, CircularProgress,
  useTheme, alpha, InputAdornment, IconButton, Paper, Container
} from "@mui/material";
import { motion } from "framer-motion";
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import { styled } from '@mui/material/styles';
import apiClient from "../api/axiosConfig";
import logo from '../assets/Logo.png';

const StyledPaper = styled(Paper)(() => ({
  padding: '40px',
  borderRadius: '24px',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  '@media (max-width:600px)': {
    padding: '24px',
  },
}));

const ActionButton = styled(Button)(() => ({
  background: 'linear-gradient(45deg, #4cc9f0 30%, #4361ee 90%)',
  border: 0,
  borderRadius: 16,
  color: 'white',
  height: 56,
  padding: '0 30px',
  boxShadow: '0 3px 5px 2px rgba(76, 201, 240, .3)',
  fontSize: '1.1rem',
  fontWeight: 700,
  textTransform: 'none',
  '&:hover': {
    background: 'linear-gradient(45deg, #4361ee 30%, #4cc9f0 90%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 12px rgba(76, 201, 240, .4)',
  },
  transition: 'all 0.3s ease',
  '&:disabled': {
    background: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.3)'
  }
}));

export default function RegisterForm() {
  const theme = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/register", {
        username: username,
        password: password
      });

      // After successful registration, login automatically or redirect to login
      navigate("/login", { state: { message: "Registro exitoso. ¡Ahora puedes iniciar sesión!" } });
    } catch (err: any) {
      console.error("Register error:", err);
      setError(err.response?.data?.detail || "Error al crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0b1e',
        backgroundImage: `
          radial-gradient(circle at 10% 20%, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 40%),
          radial-gradient(circle at 90% 80%, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 40%)
        `,
        padding: '20px'
      }}
    >
      <Container maxWidth="xs" sx={{ p: 0 }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <StyledPaper elevation={0}>
            <Box sx={{ mb: 4, textAlign: 'center' }}>
              <img src={logo} alt="Logo" style={{ height: '60px', marginBottom: '20px' }} />
              <Typography variant="h4" fontWeight={800} sx={{ color: '#fff', mb: 1 }}>
                Crear Cuenta
              </Typography>
              <Typography variant="body1" sx={{ color: alpha('#fff', 0.5) }}>
                Unete al panel administrativo
              </Typography>
            </Box>

            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <Alert 
                  severity="error" 
                  variant="outlined" 
                  sx={{ 
                    mb: 3, 
                    borderRadius: '12px', 
                    bgcolor: 'rgba(211, 47, 47, 0.1)',
                    color: '#ff5252',
                    borderColor: 'rgba(211, 47, 47, 0.3)'
                  }}
                >
                  {error}
                </Alert>
              </motion.div>
            )}

            <form onSubmit={handleRegister}>
              <TextField
                fullWidth
                label="Nombre de Usuario"
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                type="email"
                autoComplete="email"
                margin="normal"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon sx={{ color: alpha('#fff', 0.4) }} />
                    </InputAdornment>
                  ),
                }}
                sx={textFieldStyles()}
              />

              <TextField
                fullWidth
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                margin="normal"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: alpha('#fff', 0.4) }} />
                    </InputAdornment>
                  ),
                }}
                sx={textFieldStyles()}
              />

              <TextField
                fullWidth
                label="Confirmar Contraseña"
                type={showPassword ? "text" : "password"}
                variant="outlined"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                margin="normal"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: alpha('#fff', 0.4) }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: alpha('#fff', 0.4) }}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={textFieldStyles()}
              />

              <ActionButton
                fullWidth
                size="large"
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{ mt: 4 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : "Crear mi Cuenta"}
              </ActionButton>
            </form>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: alpha('#fff', 0.5) }}>
                ¿Ya tienes cuenta?{' '}
                <Button 
                  onClick={() => navigate('/login')}
                  sx={{ color: '#4cc9f0', fontWeight: 700, textTransform: 'none', px: 1, fontSize: '0.9rem' }}
                >
                  Inicia sesión
                </Button>
              </Typography>
            </Box>
          </StyledPaper>
        </motion.div>
      </Container>
    </Box>
  );
}

const textFieldStyles = () => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: '16px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    transition: 'all 0.3s ease',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
    '&.Mui-focused fieldset': { borderColor: '#4cc9f0' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)', '&.Mui-focused': { color: '#4cc9f0' } },
  '& .MuiInputBase-input': { color: 'white', py: 2 },
});
