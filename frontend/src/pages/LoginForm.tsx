import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Alert, CircularProgress,
  useTheme, alpha, InputAdornment, IconButton, GlobalStyles, useMediaQuery
} from "@mui/material";
import { motion } from "framer-motion";
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import apiClient from "../api/axiosConfig";
import logo from '../assets/Logo.png';

export default function LoginForm() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);

      const response = await apiClient.post("/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });

      const { access_token } = response.data;
      localStorage.setItem("token", access_token);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <GlobalStyles styles={{
        'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active': {
          transition: 'background-color 5000s ease-in-out 0s',
          WebkitTextFillColor: '#fff !important',
          caretColor: '#fff',
          WebkitBoxShadow: '0 0 0 1000px transparent inset !important',
        }
      }} />

      {/* Left Side - Branding (Hidden on mobile) */}
      {!isMobile && (
        <Box
          sx={{
            flex: 1,
            background: '#0a0b1e',
            backgroundImage: `
              radial-gradient(circle at 10% 20%, ${alpha(theme.palette.primary.main, 0.2)} 0%, transparent 40%),
              radial-gradient(circle at 90% 80%, ${alpha(theme.palette.secondary.main, 0.2)} 0%, transparent 40%),
              linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)
            `,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Decorative Circles */}
          <Box sx={{
            position: 'absolute',
            top: '20%',
            left: '10%',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: alpha(theme.palette.primary.main, 0.1),
            filter: 'blur(60px)',
            zIndex: 0
          }} />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{ zIndex: 1, textAlign: 'center' }}
          >
            <img src={logo} alt="Logo" style={{ height: '120px', marginBottom: '40px' }} />
            <Typography variant="h3" fontWeight={800} sx={{ color: '#fff', mb: 2, letterSpacing: '-1px' }}>
              Animal Love
            </Typography>
            <Typography variant="h4" fontWeight={600} sx={{ color: alpha('#fff', 0.85), mb: 1 }}>
              No-Kill Rescue Center
            </Typography>
            <Typography variant="h6" sx={{ color: alpha('#fff', 0.6), fontWeight: 400, fontStyle: 'italic' }}>
              Dashboard, Analytics & More
            </Typography>
          </motion.div>
        </Box>
      )}

      {/* Right Side - Login Form */}
      <Box
        sx={{
          flex: isMobile ? 1 : '0 0 550px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#121422',
          p: 4,
          position: 'relative'
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          style={{ width: '100%', maxWidth: '400px' }}
        >
          <Box sx={{ mb: 5 }}>
            {isMobile && <img src={logo} alt="Logo" style={{ height: '40px', marginBottom: '20px' }} />}
            <Typography variant="h4" fontWeight={700} sx={{ color: '#fff', mb: 1 }}>
              Sign In
            </Typography>
            <Typography variant="body1" sx={{ color: alpha('#fff', 0.6) }}>
              Enter your credentials to access the admin panel.
            </Typography>
          </Box>

          <form onSubmit={handleLogin}>
            <TextField
              label="Username"
              fullWidth
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              required
              autoFocus
              variant="outlined"
              InputLabelProps={{ sx: { color: alpha('#fff', 0.7) } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonOutlineIcon sx={{ color: alpha('#fff', 0.7) }} />
                  </InputAdornment>
                ),
                sx: {
                  color: '#fff',
                  borderRadius: '12px',
                  bgcolor: alpha('#000', 0.2),
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#fff', 0.1) },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#fff', 0.3) },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main },
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: `0 0 0 100px ${alpha('#000', 0.2)} inset !important`,
                    WebkitTextFillColor: '#fff !important',
                    borderRadius: '12px',
                  }
                }
              }}
            />
            <TextField
              label="Password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              required
              variant="outlined"
              InputLabelProps={{ sx: { color: alpha('#fff', 0.7) } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon sx={{ color: alpha('#fff', 0.7) }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ color: alpha('#fff', 0.7) }}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
                sx: {
                  color: '#fff',
                  borderRadius: '12px',
                  bgcolor: alpha('#000', 0.2),
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#fff', 0.1) },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#fff', 0.3) },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main },
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: `0 0 0 100px ${alpha('#000', 0.2)} inset !important`,
                    WebkitTextFillColor: '#fff !important',
                    borderRadius: '12px',
                  }
                }
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, mb: 4 }}>
              <Button
                size="small"
                sx={{
                  textTransform: 'none',
                  color: alpha('#fff', 0.5),
                  '&:hover': { color: '#fff', bgcolor: 'transparent' }
                }}
                onClick={() => alert("Please contact your administrator to reset your password.")}
              >
                Forgot Password?
              </Button>
            </Box>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <Alert severity="error" variant="filled" sx={{ mb: 3, borderRadius: '10px' }}>{error}</Alert>
              </motion.div>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              fullWidth
              size="large"
              sx={{
                height: 56,
                borderRadius: '16px',
                fontSize: '1.1rem',
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: '0 4px 14px 0 rgba(0,118,255,0.39)',
                background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 20px rgba(0,118,255,0.23)'
                }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Sign In"}
            </Button>
          </form>
        </motion.div>
      </Box>
    </Box>
  );
}