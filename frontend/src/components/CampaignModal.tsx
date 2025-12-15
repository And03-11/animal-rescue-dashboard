import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Stack,
    IconButton,
    Box,
    Typography,
    useTheme,
    alpha
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs, { Dayjs } from 'dayjs';

interface CampaignFormData {
    id?: number;
    title: string;
    start_date: Dayjs;
    end_date: Dayjs;
    category: string;
    notes: string;
    segmentation_mode: 'bc_single' | 'bc_split' | 'standard';
}

interface CampaignModalProps {
    open: boolean;
    campaign: CampaignFormData | null;
    onClose: () => void;
    onSave: (campaign: CampaignFormData) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
}

const CATEGORIES = [
    'Big Campaigns',
    'NBC',
    'Unsubscribers',
    'Tagless',
    'Influencers in Progress',
    'Fundraising',
    'Other'
];

export const CampaignModal: React.FC<CampaignModalProps> = ({
    open,
    campaign,
    onClose,
    onSave,
    onDelete
}) => {
    const theme = useTheme();
    const [formData, setFormData] = useState<CampaignFormData>({
        title: '',
        start_date: dayjs(),
        end_date: dayjs(),
        category: 'Other',
        notes: '',
        segmentation_mode: 'standard'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (campaign) {
            setFormData({
                ...campaign,
                start_date: dayjs(campaign.start_date),
                end_date: dayjs(campaign.end_date),
                // Ensure segmentation_mode is valid, default to standard if not
                segmentation_mode: (['bc_single', 'bc_split', 'standard'].includes(campaign.segmentation_mode)
                    ? campaign.segmentation_mode
                    : 'standard') as any
            });
        } else {
            setFormData({
                title: '',
                start_date: dayjs(),
                end_date: dayjs(),
                category: 'Other',
                notes: '',
                segmentation_mode: 'standard'
            });
        }
        setError('');
    }, [campaign, open]);

    const handleChange = (field: keyof CampaignFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            setError('Title is required');
            return;
        }

        if (formData.start_date.isAfter(formData.end_date)) {
            setError('Start date must be before end date');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onSave(formData);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save campaign');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!campaign?.id) return;

        if (!window.confirm('Are you sure you want to delete this campaign? This will also delete all associated emails and sends.')) {
            return;
        }

        setLoading(true);
        try {
            if (onDelete) {
                await onDelete(campaign.id);
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to delete campaign');
        } finally {
            setLoading(false);
        }
    };

    const isEdit = !!campaign?.id;

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
                    {isEdit ? 'Edit Campaign' : 'New Campaign'}
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
                        label="Campaign Title"
                        value={formData.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        fullWidth
                        required
                        autoFocus
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
                    />

                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <DatePicker
                            label="Start Date"
                            value={formData.start_date}
                            onChange={(newValue) => handleChange('start_date', newValue)}
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '12px'
                                        }
                                    }
                                }
                            }}
                        />
                        <DatePicker
                            label="End Date"
                            value={formData.end_date}
                            onChange={(newValue) => handleChange('end_date', newValue)}
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '12px'
                                        }
                                    }
                                }
                            }}
                        />
                    </Box>

                    <FormControl fullWidth>
                        <InputLabel>Category</InputLabel>
                        <Select
                            value={formData.category}
                            label="Category"
                            onChange={(e) => handleChange('category', e.target.value)}
                            sx={{ borderRadius: '12px' }}
                        >
                            {CATEGORIES.map((cat) => (
                                <MenuItem key={cat} value={cat}>
                                    {cat}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth>
                        <InputLabel>Segmentation Mode</InputLabel>
                        <Select
                            value={formData.segmentation_mode}
                            label="Segmentation Mode"
                            onChange={(e) => handleChange('segmentation_mode', e.target.value)}
                            sx={{ borderRadius: '12px' }}
                        >
                            <MenuItem value="bc_single">Big Campaign - Unified Time (All Tags)</MenuItem>
                            <MenuItem value="bc_split">Big Campaign - Split Time (USA/EUR/Yahoo)</MenuItem>
                            <MenuItem value="standard">Standard - Select Region (USA/EUR)</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        label="Notes"
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        fullWidth
                        multiline
                        rows={3}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
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
                        background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`
                    }}
                >
                    {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Campaign'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
