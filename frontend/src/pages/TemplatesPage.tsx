// --- File: src/pages/TemplatesPage.tsx ---
import { useEffect, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent,
    DialogTitle, TextField, Typography, Paper, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, CircularProgress, Alert, Container, Snackbar,
    ToggleButton, ToggleButtonGroup, Tooltip, DialogContentText
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiClient from "../api/axiosConfig";
import { EmailPreview } from "../components/EmailPreview";

interface Template {
    id: number;
    name: string;
    content: string;
    created_at: string;
}

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form Dialog
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState({ id: 0, name: "", content: "<h1>New Template</h1>\n<p>Your content here...</p>" });
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');

    // Delete Dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Send Test Dialog
    const [sendTestDialogOpen, setSendTestDialogOpen] = useState(false);
    const [templateToTest, setTemplateToTest] = useState<Template | null>(null);
    const [testEmails, setTestEmails] = useState("");
    const [testSubject, setTestSubject] = useState("Test Email");
    const [sendingTest, setSendingTest] = useState(false);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get("/templates");
            setTemplates(res.data);
            setError("");
        } catch {
            setError("Error loading templates");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleOpenForm = (template?: Template) => {
        if (template) {
            setForm({ id: template.id, name: template.name, content: template.content });
            setEditMode(true);
        } else {
            setForm({ id: 0, name: "", content: "<h1>New Template</h1>\n<p>Your content here...</p>" });
            setEditMode(false);
        }
        setViewMode('code');
        setFormOpen(true);
    };

    const handleCloseForm = () => {
        setFormOpen(false);
        setError("");
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            setError("Template name is required.");
            return;
        }
        if (!form.content.trim()) {
            setError("Template content is required.");
            return;
        }

        setSaving(true);
        setError("");
        try {
            if (editMode) {
                await apiClient.put(`/templates/${form.id}`, { name: form.name, content: form.content });
                setSuccessMessage("Template updated successfully!");
            } else {
                await apiClient.post("/templates", { name: form.name, content: form.content });
                setSuccessMessage("Template created successfully!");
            }
            handleCloseForm();
            fetchTemplates();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Error saving template");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (template: Template) => {
        setTemplateToDelete(template);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!templateToDelete) return;
        setDeleting(true);
        try {
            await apiClient.delete(`/templates/${templateToDelete.id}`);
            setSuccessMessage(`Template "${templateToDelete.name}" deleted.`);
            setDeleteDialogOpen(false);
            setTemplateToDelete(null);
            fetchTemplates();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Error deleting template");
        } finally {
            setDeleting(false);
        }
    };

    const handleSendTestClick = (template: Template) => {
        setTemplateToTest(template);
        setTestEmails("");
        setTestSubject(`Test: ${template.name}`);
        setSendTestDialogOpen(true);
    };

    const handleSendTest = async () => {
        if (!templateToTest) return;
        if (!testEmails.trim()) {
            setError("At least one email address is required.");
            return;
        }

        const emailList = testEmails.split(",").map(e => e.trim()).filter(e => e);
        if (emailList.length === 0) {
            setError("Invalid email addresses.");
            return;
        }

        setSendingTest(true);
        setError("");
        try {
            const res = await apiClient.post(`/templates/${templateToTest.id}/send-test`, {
                emails: emailList,
                subject: testSubject
            });
            setSuccessMessage(res.data.message);
            setSendTestDialogOpen(false);
            setTemplateToTest(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Error sending test email");
        } finally {
            setSendingTest(false);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">Email Templates</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenForm()}>
                    New Template
                </Button>
            </Box>

            {error && !formOpen && !deleteDialogOpen && !sendTestDialogOpen && (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                </Box>
            ) : templates.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No templates yet. Create one to get started!</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Created</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {templates.map(template => (
                                <TableRow key={template.id} hover>
                                    <TableCell sx={{ fontWeight: 500 }}>{template.name}</TableCell>
                                    <TableCell>
                                        {new Date(template.created_at).toLocaleDateString('en-US', {
                                            dateStyle: 'medium'
                                        })}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Edit">
                                            <IconButton onClick={() => handleOpenForm(template)} size="small">
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Send Test">
                                            <IconButton onClick={() => handleSendTestClick(template)} size="small" color="secondary">
                                                <SendIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton onClick={() => handleDeleteClick(template)} size="small" color="error">
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="md" fullWidth>
                <DialogTitle>{editMode ? "Edit Template" : "New Template"}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        required
                        margin="dense"
                        label="Template Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        disabled={saving}
                        sx={{ mb: 2 }}
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                        <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
                            <ToggleButton value="code"><CodeIcon sx={{ mr: 0.5 }} /> Code</ToggleButton>
                            <ToggleButton value="preview"><VisibilityIcon sx={{ mr: 0.5 }} /> Preview</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {viewMode === 'code' ? (
                        <TextField
                            label="HTML Content"
                            multiline
                            rows={12}
                            fullWidth
                            variant="outlined"
                            value={form.content}
                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                            disabled={saving}
                            sx={{
                                '& .MuiInputBase-root': {
                                    fontFamily: '"Fira Code", "Roboto Mono", monospace',
                                    fontSize: '0.875rem',
                                    backgroundColor: '#1e1e1e',
                                    color: '#d4d4d4',
                                },
                            }}
                        />
                    ) : (
                        <Paper variant="outlined" sx={{ p: 2, minHeight: '300px', bgcolor: '#f5f5f5' }}>
                            <EmailPreview subject={form.name} htmlBody={form.content} />
                        </Paper>
                    )}

                    {error && formOpen && (
                        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseForm} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={saving}>
                        {saving ? <CircularProgress size={24} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
                <DialogTitle>Delete Template</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete <strong>"{templateToDelete?.name}"</strong>? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" disabled={deleting}>
                        {deleting ? <CircularProgress size={24} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Send Test Dialog */}
            <Dialog open={sendTestDialogOpen} onClose={() => !sendingTest && setSendTestDialogOpen(false)}>
                <DialogTitle>Send Test Email</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Send a test email using template <strong>"{templateToTest?.name}"</strong>.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Email Addresses"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={testEmails}
                        onChange={(e) => setTestEmails(e.target.value)}
                        placeholder="test@example.com, another@example.com"
                        disabled={sendingTest}
                        helperText="Separate multiple emails with commas"
                    />
                    <TextField
                        margin="dense"
                        label="Subject"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={testSubject}
                        onChange={(e) => setTestSubject(e.target.value)}
                        disabled={sendingTest}
                        sx={{ mt: 2 }}
                    />
                    {error && sendTestDialogOpen && (
                        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSendTestDialogOpen(false)} disabled={sendingTest}>Cancel</Button>
                    <Button variant="contained" color="secondary" onClick={handleSendTest} disabled={sendingTest}>
                        {sendingTest ? <CircularProgress size={24} /> : 'Send Test'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Success Snackbar */}
            <Snackbar
                open={!!successMessage}
                autoHideDuration={4000}
                onClose={() => setSuccessMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
                    {successMessage}
                </Alert>
            </Snackbar>
        </Container>
    );
}
