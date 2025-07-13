// --- File: src/pages/LoginForm.tsx ---
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Paper, Alert, CircularProgress
} from "@mui/material";
import apiClient from "../api/axiosConfig";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // ✅ CAMBIO: Enviamos 'username' en lugar de 'email'
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
    <Paper sx={{ maxWidth: 400, mx: "auto", mt: 8, p: 4 }}>
      <Typography variant="h5" mb={2}>Login</Typography>
      <form onSubmit={handleLogin}>
        {/* ✅ CAMBIO: El campo ahora es para 'Username' y de tipo 'text' */}
        <TextField
          label="Username"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          type="text"
          required
          autoFocus
        />
        <TextField
          label="Password"
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
            {loading ? <CircularProgress size={24} /> : "Login"}
          </Button>
        </Box>
      </form>
    </Paper>
  );
}