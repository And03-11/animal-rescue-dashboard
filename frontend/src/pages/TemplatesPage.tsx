import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import apiClient from '../api/axiosConfig';
import { EmailPreview } from '../components/EmailPreview';
import { WorkspacePageHeader } from '../components/WorkspacePageHeader';
import { WorkspaceStatePanel } from '../components/WorkspaceStatePanel';

interface Template {
  id: number;
  name: string;
  content: string;
  created_at: string;
}

const emptyTemplate = {
  id: 0,
  name: '',
  content: '<h1>New Template</h1>\n<p>Your content here...</p>',
};

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString('en-US', { dateStyle: 'medium' });
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError<{ detail?: string }>(error)) return fallback;
  return error.response?.data?.detail || fallback;
};

export default function TemplatesPage() {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyTemplate);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sendTestDialogOpen, setSendTestDialogOpen] = useState(false);
  const [templateToTest, setTemplateToTest] = useState<Template | null>(null);
  const [testEmails, setTestEmails] = useState('');
  const [testSubject, setTestSubject] = useState('Test Email');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<Template[]>('/templates');
      setTemplates(response.data);
      setError('');
    } catch {
      setError('Templates could not be loaded. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleOpenForm = (template?: Template) => {
    setForm(template
      ? { id: template.id, name: template.name, content: template.content }
      : emptyTemplate);
    setEditMode(Boolean(template));
    setViewMode('code');
    setError('');
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!form.content.trim()) {
      setError('Template content is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name.trim(), content: form.content };
      if (editMode) {
        await apiClient.put(`/templates/${form.id}`, payload);
        setSuccessMessage('Template updated.');
      } else {
        await apiClient.post('/templates', payload);
        setSuccessMessage('Template created.');
      }
      setFormOpen(false);
      await fetchTemplates();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Template could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setError('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/templates/${templateToDelete.id}`);
      setSuccessMessage(`“${templateToDelete.name}” deleted.`);
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      await fetchTemplates();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Template could not be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleSendTestClick = (template: Template) => {
    setTemplateToTest(template);
    setTestEmails('');
    setTestSubject(`Test: ${template.name}`);
    setError('');
    setSendTestDialogOpen(true);
  };

  const handleSendTest = async () => {
    if (!templateToTest) return;
    const emailList = testEmails.split(',').map((email) => email.trim()).filter(Boolean);
    if (emailList.length === 0) {
      setError('Enter at least one email address.');
      return;
    }

    setSendingTest(true);
    setError('');
    try {
      const response = await apiClient.post(`/templates/${templateToTest.id}/send-test`, {
        emails: emailList,
        subject: testSubject.trim(),
      });
      setSuccessMessage(response.data.message || 'Test email sent.');
      setSendTestDialogOpen(false);
      setTemplateToTest(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Test email could not be sent.'));
    } finally {
      setSendingTest(false);
    }
  };

  const templateActions = (template: Template) => (
    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
      <Tooltip title="Edit template">
        <IconButton aria-label={`Edit ${template.name}`} onClick={() => handleOpenForm(template)} size="small">
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Send a test">
        <IconButton
          aria-label={`Send a test for ${template.name}`}
          onClick={() => handleSendTestClick(template)}
          size="small"
          color="primary"
        >
          <SendOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete template">
        <IconButton
          aria-label={`Delete ${template.name}`}
          onClick={() => handleDeleteClick(template)}
          size="small"
          color="error"
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      <WorkspacePageHeader
        eyebrow="Communications"
        title="Email templates"
        description="Create, preview and validate reusable messages before they enter a donor campaign."
        icon={<ArticleOutlinedIcon />}
        meta={!loading && (
          <Chip
            size="small"
            variant="outlined"
            label={`${templates.length} ${templates.length === 1 ? 'template' : 'templates'}`}
          />
        )}
        actions={(
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => handleOpenForm()}>
            New template
          </Button>
        )}
      />

      {error && !formOpen && !deleteDialogOpen && !sendTestDialogOpen && (
        <Alert
          severity="error"
          action={(
            <Button color="inherit" size="small" startIcon={<RefreshRoundedIcon />} onClick={fetchTemplates}>
              Retry
            </Button>
          )}
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Stack divider={<Divider flexItem />}>
            {[0, 1, 2].map((item) => (
              <Stack key={item} direction="row" alignItems="center" gap={2} sx={{ px: 2.5, py: 2.25 }}>
                <Skeleton variant="rounded" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="42%" />
                  <Skeleton width="24%" />
                </Box>
                <Skeleton variant="rounded" width={112} height={32} />
              </Stack>
            ))}
          </Stack>
        </Paper>
      ) : templates.length === 0 ? (
        <WorkspaceStatePanel
          dashed
          icon={<InboxOutlinedIcon />}
          title="No templates yet"
          description="Create a reusable email template to keep campaign messaging consistent and easier to test."
          action={(
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => handleOpenForm()}>
              Create first template
            </Button>
          )}
        />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table aria-label="Email templates">
              <TableHead>
                <TableRow>
                  <TableCell>Template</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} hover>
                    <TableCell>
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        <Box
                          sx={{
                            display: 'grid',
                            placeItems: 'center',
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            color: 'primary.main',
                            bgcolor: 'action.selected',
                          }}
                        >
                          <ArticleOutlinedIcon fontSize="small" />
                        </Box>
                        <Typography fontWeight={600}>{template.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatCreatedAt(template.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{templateActions(template)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {templates.map((template) => (
              <Paper key={template.id} variant="outlined" sx={{ p: 2.25 }}>
                <Stack spacing={2}>
                  <Stack direction="row" gap={1.5} alignItems="flex-start">
                    <Box
                      sx={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: 2,
                        color: 'primary.main',
                        bgcolor: 'action.selected',
                      }}
                    >
                      <ArticleOutlinedIcon fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={600} noWrap>{template.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Created {formatCreatedAt(template.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                  <Divider />
                  {templateActions(template)}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      <Dialog
        open={formOpen}
        onClose={handleCloseForm}
        maxWidth="md"
        fullWidth
        fullScreen={isSmallScreen}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {editMode ? 'Edit template' : 'Create template'}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Write the HTML message, then review the inbox preview before saving.
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Stack spacing={2.5}>
            <TextField
              autoFocus
              required
              label="Template name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              disabled={saving}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
              <Box>
                <Typography variant="subtitle2">Message content</Typography>
                <Typography variant="caption" color="text.secondary">
                  Use the preview to check spacing and readability.
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, value) => value && setViewMode(value)}
                size="small"
                aria-label="Template view"
              >
                <ToggleButton value="code" aria-label="Edit HTML">
                  <CodeRoundedIcon fontSize="small" sx={{ mr: 0.75 }} /> Code
                </ToggleButton>
                <ToggleButton value="preview" aria-label="Preview email">
                  <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} /> Preview
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            {viewMode === 'code' ? (
              <TextField
                aria-label="HTML content"
                multiline
                minRows={14}
                fullWidth
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                disabled={saving}
                sx={{
                  '& .MuiInputBase-root': {
                    alignItems: 'flex-start',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
                    fontSize: '0.875rem',
                    lineHeight: 1.65,
                    bgcolor: alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.72 : 0.9),
                  },
                }}
              />
            ) : (
              <Paper
                variant="outlined"
                sx={{ minHeight: 360, p: { xs: 1.5, sm: 2.5 }, bgcolor: '#f7f8f8', color: '#17211f' }}
              >
                <EmailPreview subject={form.name || 'Untitled template'} htmlBody={form.content} />
              </Paper>
            )}

            {error && formOpen && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseForm} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saving}>
            {saving ? <CircularProgress size={20} color="inherit" /> : editMode ? 'Save changes' : 'Create template'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete template?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{templateToDelete?.name}” will be permanently removed. Existing campaigns that depend on it may need attention.
          </DialogContentText>
          {error && deleteDialogOpen && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} disabled={deleting}>
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Delete template'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sendTestDialogOpen} onClose={() => !sendingTest && setSendTestDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send a test email</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2.5 }}>
            Validate “{templateToTest?.name}” in a real inbox before using it in a campaign.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField
              autoFocus
              label="Email addresses"
              value={testEmails}
              onChange={(event) => setTestEmails(event.target.value)}
              placeholder="team@example.com, reviewer@example.com"
              helperText="Separate multiple addresses with commas."
              disabled={sendingTest}
              fullWidth
            />
            <TextField
              label="Subject"
              value={testSubject}
              onChange={(event) => setTestSubject(event.target.value)}
              disabled={sendingTest}
              fullWidth
            />
            {error && sendTestDialogOpen && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendTestDialogOpen(false)} disabled={sendingTest}>Cancel</Button>
          <Button variant="contained" onClick={handleSendTest} disabled={sendingTest} startIcon={!sendingTest && <SendOutlinedIcon />}>
            {sendingTest ? <CircularProgress size={20} color="inherit" /> : 'Send test'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
