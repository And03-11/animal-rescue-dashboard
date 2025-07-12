// --- Archivo: src/pages/UserManagementPage.tsx ---
import { useEffect, useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField, Typography, Paper, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, CircularProgress, Alert
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import apiClient from "../api/axiosConfig";

interface User {
  id: number;
  email: string;
  is_admin: boolean;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, email: "", password: "", is_admin: false });
  const [editMode, setEditMode] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await apiClient.get("/users/list");
      setUsers(res.data);
    } catch {
      setError("Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpen = (user?: User) => {
    if (user) {
      setForm({ id: user.id, email: user.email, password: "", is_admin: user.is_admin });
      setEditMode(true);
    } else {
      setForm({ id: 0, email: "", password: "", is_admin: false });
      setEditMode(false);
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editMode) {
        await apiClient.put(`/users/${form.id}`, form);
      } else {
        await apiClient.post("/users/register", form);
      }
      setOpen(false);
      fetchUsers();
    } catch {
      setError("Error al guardar usuario");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar este usuario?")) return;
    try {
      await apiClient.delete(`/users/${id}`);
      fetchUsers();
    } catch {
      setError("Error al eliminar usuario");
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>Gestión de Usuarios</Typography>
      <Button variant="contained" onClick={() => handleOpen()}>Nuevo Usuario</Button>
      {loading ? <CircularProgress sx={{ mt: 4 }} /> : (
        <TableContainer component={Paper} sx={{ mt: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.is_admin ? "Sí" : "No"}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpen(user)}><EditIcon /></IconButton>
                    <IconButton onClick={() => handleDelete(user.id)}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Formulario Modal */}
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{editMode ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
        <DialogContent>
          <TextField
            label="Email"
            fullWidth
            margin="normal"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextField
            label="Contraseña"
            type="password"
            fullWidth
            margin="normal"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <TextField
            label="¿Es admin? (true/false)"
            fullWidth
            margin="normal"
            value={String(form.is_admin)}
            onChange={(e) => setForm({ ...form, is_admin: e.target.value === "true" })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubmit}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
}
