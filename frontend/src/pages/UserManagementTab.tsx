// --- File: src/pages/UserManagementTab.tsx ---
import { useEffect, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent,
    DialogTitle, TextField, Typography, Paper, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, CircularProgress, Alert, Checkbox, FormControlLabel,
    useTheme, alpha, Chip, Avatar
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import apiClient from "../api/axiosConfig";

interface User {
    id: number;
    username: string;
    is_admin: boolean;
}

export default function UserManagementTab() {
    const theme = useTheme();
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
                await apiClient.put(`/users/${form.id}`, payload);
            } else {
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

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Team Members</Typography>
                    <Typography variant="body2" color="text.secondary">Manage who has access to the dashboard</Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpen()}
                    sx={{ borderRadius: '10px', px: 3 }}
                >
                    Add Member
                </Button>
            </Box>

            {error && !open && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {loading ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} /> : (
                <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}
                >
                    <Table>
                        <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map(user => (
                                <TableRow key={user.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Avatar sx={{ bgcolor: user.is_admin ? 'secondary.main' : 'primary.main', width: 32, height: 32 }}>
                                                {user.username.charAt(0).toUpperCase()}
                                            </Avatar>
                                            <Typography fontWeight={500}>{user.username}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        {user.is_admin ? (
                                            <Chip
                                                icon={<AdminPanelSettingsIcon sx={{ fontSize: '16px !important' }} />}
                                                label="Admin"
                                                size="small"
                                                color="secondary"
                                                variant="outlined"
                                            />
                                        ) : (
                                            <Chip
                                                icon={<PersonIcon sx={{ fontSize: '16px !important' }} />}
                                                label="Viewer"
                                                size="small"
                                                variant="outlined"
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton onClick={() => handleOpen(user)} aria-label="edit" size="small" sx={{ mr: 1 }}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton onClick={() => handleDelete(user.id)} aria-label="delete" size="small" color="error">
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {users.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Form Dialog */}
            <Dialog
                open={open}
                onClose={handleClose}
                PaperProps={{
                    sx: { borderRadius: '16px', p: 1 }
                }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>{editMode ? "Edit User" : "New User"}</DialogTitle>
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
                        sx={{ mb: 2, mt: 1 }}
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
                        helperText={editMode ? "Only enter to change password" : ""}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={form.is_admin}
                                onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
                            />
                        }
                        label="Grant Admin Privileges"
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleClose} sx={{ borderRadius: '8px' }}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} sx={{ borderRadius: '8px', px: 3 }}>Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
