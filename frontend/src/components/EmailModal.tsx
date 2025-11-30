import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Stack,
    IconButton,
    Box,
    Typography,
    useTheme,
    alpha,
    Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';

interface EmailFormData {
    id?: number;
    campaign_id: number;
    title: string;
    subject: string;
    button_name: string;
    link_donation: string;
    link_contact_us: string;
    custom_links: string;
}

interface EmailModalProps {
    open: boolean;
    email: EmailFormData | null;
    campaignId: number;
    onClose: () => void;
    onSave: (email: EmailFormData) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
}

export const EmailModal: React.FC<EmailModalProps> = ({
    open,
    email,
    campaignId,
    onClose,
    onSave,
    onDelete
}) => {
    const theme = useTheme();
    const [formData, setFormData] = useState<EmailFormData>({
        campaign_id: campaignId,
        title: '',
        subject: '',
        button_name: '',
        link_donation: '',
        link_contact_us: '',
        custom_links: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (email) {
            setFormData(email);
        } else {
            setFormData({
                campaign_id: campaignId,
                title: '',
                subject: '',
                button_name: '',
                link_donation: '',
                link_contact_us: '',
                custom_links: ''
            });
        }
        setError('');
    }, [email, campaignId, open]);

    const handleChange = (field: keyof EmailFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            setError('Title is required');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onSave(formData);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save email');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!email?.id) return;

        if (!window.confirm('Are you sure you want to delete this email? This will also delete all scheduled sends for this email.')) {
            return;
        }

        setLoading(true);
        try {
            if (onDelete) {
                await onDelete(email.id);
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to delete email');
        } finally {
            setLoading(false);
        }
    };

    const isEdit = !!email?.id;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: '16px',
                    background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                        theme.palette.background.paper,
                        0.95
                    )} 100%)`,
                    backdropFilter: 'blur(10px)'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                <Typography variant="h5" fontWeight={700}>
                    {isEdit ? 'Edit Email' : 'New Email'}
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    {error && (
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: '8px',
                                bgcolor: alpha(theme.palette.error.main, 0.1),
                                border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`
                            }}
                        >
                            <Typography variant="body2" color="error">
                                {error}
                            </Typography>
                        </Box>
                    )}

                    <TextField
                        label="Internal Title (e.g. 'Welcome Email')"
                        value={formData.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        fullWidth
                        required
                        autoFocus
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />

                    <TextField
                        label="Subject Line"
                        value={formData.subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        fullWidth
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />

                    <TextField
                        label="Button Name / Call to Action"
                        value={formData.button_name}
                        onChange={(e) => handleChange('button_name', e.target.value)}
                        fullWidth
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />

                    <Divider sx={{ my: 1 }}>
                        <Typography variant="caption" color="text.secondary">LINKS</Typography>
                    </Divider>

                    <TextField
                        label="Donation Link"
                        value={formData.link_donation}
                        onChange={(e) => handleChange('link_donation', e.target.value)}
                        fullWidth
                        size="small"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />

                    <TextField
                        label="Contact Us Link"
                        value={formData.link_contact_us}
                        onChange={(e) => handleChange('link_contact_us', e.target.value)}
                        fullWidth
                        size="small"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />

                    <TextField
                        label="Custom Links (Optional)"
                        value={formData.custom_links}
                        onChange={(e) => handleChange('custom_links', e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                        size="small"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />
                </Stack>
            </DialogContent>

            <DialogActions sx={{ p: 3, pt: 2, gap: 1 }}>
                {isEdit && onDelete && (
                    <Button
                        onClick={handleDelete}
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteIcon />}
                        disabled={loading}
                        sx={{
                            borderRadius: '12px',
                            textTransform: 'none',
                            fontWeight: 600,
                            mr: 'auto'
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button
                    onClick={onClose}
                    disabled={loading}
                    sx={{
                        borderRadius: '12px',
                        textTransform: 'none',
                        fontWeight: 600
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    startIcon={<SaveIcon />}
                    disabled={loading}
                    sx={{
                        borderRadius: '12px',
                        textTransform: 'none',
                        fontWeight: 600,
                        background: `linear-gradient(45deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`
                    }}
                >
                    {loading ? 'Saving...' : isEdit ? 'Save Email' : 'Create Email'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
