// --- File: src/pages/UserManagementPage.tsx (Versión Corregida) ---
import { useEffect, useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField, Typography, Paper, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, CircularProgress, Alert, Checkbox, FormControlLabel
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import apiClient from "../api/axiosConfig";

interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, username: "", password: "", is_admin: false });
  const [editMode, setEditMode] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/users/list");
      setUsers(res.data);
      setError("");
    } catch {
      setError("Error loading users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpen = (user?: User) => {
    if (user) {
      setForm({ id: user.id, username: user.username, password: "", is_admin: user.is_admin });
      setEditMode(true);
    } else {
      setForm({ id: 0, username: "", password: "", is_admin: false });
      setEditMode(false);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setError("");
  };

  const handleSubmit = async () => {
    if (!form.username) {
        setError("Username cannot be empty.");
        return;
    }
    if (!editMode && !form.password) {
        setError("Password is required for new users.");
        return;
    }

    try {
      if (editMode) {
        const payload: any = { username: form.username, is_admin: form.is_admin };
        if (form.password) {
            payload.password = form.password;
        }
        // La petición PUT para actualizar ya espera JSON por defecto, no necesita cambio.
        await apiClient.put(`/users/${form.id}`, payload);
      } else {
        // ✅ CORRECCIÓN: Especificamos que el Content-Type para esta petición es JSON.
        // Esto sobreescribe la configuración del interceptor de axios y soluciona el error 422.
        await apiClient.post("/users/register", form, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      handleClose();
      fetchUsers();
    } catch (err: any) {
       setError(err.response?.data?.detail || "Error saving user");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await apiClient.delete(`/users/${id}`);
      fetchUsers();
    } catch (err: any) {
       setError(err.response?.data?.detail || "Error deleting user");
    }
  };

  // ... el resto del componente (JSX) no necesita cambios ...
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>User Management</Typography>
      <Button variant="contained" onClick={() => handleOpen()}>New User</Button>

      {error && !open && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {loading ? <CircularProgress sx={{ mt: 4, display: 'block' }} /> : (
        <TableContainer component={Paper} sx={{ mt: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.is_admin ? "Yes" : "No"}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpen(user)} aria-label="edit"><EditIcon /></IconButton>
                    <IconButton onClick={() => handleDelete(user.id)} aria-label="delete"><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Form Dialog */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{editMode ? "Edit User" : "New User"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            required
            margin="dense"
            label="Username"
            type="text"
            fullWidth
            variant="outlined"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="off"
          />
          <TextField
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            variant="outlined"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editMode ? "Leave blank to keep current password" : ""}
            required={!editMode}
            autoComplete="new-password"
          />
          <FormControlLabel
            control={
                <Checkbox
                    checked={form.is_admin}
                    onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
                />
            }
            label="Is Admin?"
            sx={{ mt: 1, display: 'block' }}
          />
        </DialogContent>
        <DialogActions sx={{ p: '0 24px 16px', justifyContent: 'space-between' }}>
          {error && <Typography color="error" sx={{ mr: 'auto', fontSize: '0.9rem', flexGrow: 1 }}>{error}</Typography>}
          <Box>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmit}>Save</Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
}