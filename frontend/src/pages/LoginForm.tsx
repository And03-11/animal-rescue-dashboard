// src/pages/LoginForm.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Paper, Alert, CircularProgress
} from "@mui/material";
import axios from "axios";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      
      const response = await axios.post("/api/v1/login", form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })
      const { access_token } = response.data;
      localStorage.setItem("token", access_token);
      navigate("/dashboard"); // redirigir al dashboard o ruta protegida
    } catch (err: any) {
      setError("Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ maxWidth: 400, mx: "auto", mt: 8, p: 4 }}>
      <Typography variant="h5" mb={2}>Login</Typography>
      <form onSubmit={handleLogin}>
        <TextField
          label="Email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <TextField
          label="Contraseña"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            fullWidth
          >
            {loading ? <CircularProgress size={24} /> : "Ingresar"}
          </Button>
        </Box>
      </form>
    </Paper>
  );
}
