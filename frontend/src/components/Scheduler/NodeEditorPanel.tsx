import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Drawer,
    Stack,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    useTheme,
    alpha,
    Switch,
    FormControlLabel,
    Tooltip
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { Dayjs } from 'dayjs';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';

interface NodeEditorPanelProps {
    open: boolean;
    nodeData: any;
    nodeType: 'campaign' | 'email' | null;
    onClose: () => void;
    onSave: (newData: any) => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({
    open,
    nodeData,
    nodeType,
    onClose,
    onSave,
    onDelete,
    onDuplicate
}) => {
    const theme = useTheme();
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        if (nodeData) {
            setFormData({ ...nodeData });
        }
    }, [nodeData]);

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    if (!nodeType) return null;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: 400,
                    p: 3,
                    background: theme.palette.background.paper,
                    boxShadow: theme.shadows[10]
                }
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>
                    {nodeType === 'campaign' ? 'Edit Campaign' : 'Edit Email Send'}
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </Box>

            <Stack spacing={3} sx={{ flexGrow: 1, overflowY: 'auto', pb: 2 }}>
                {nodeType === 'campaign' ? (
                    <>
                        <TextField
                            label="Campaign Title"
                            fullWidth
                            value={formData.title || ''}
                            onChange={(e) => handleChange('title', e.target.value)}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select
                                value={formData.category || 'Other'}
                                label="Category"
                                onChange={(e) => handleChange('category', e.target.value)}
                            >
                                <MenuItem value="Big Campaigns">Big Campaigns</MenuItem>
                                <MenuItem value="NBC">NBC</MenuItem>
                                <MenuItem value="Unsubscribers">Unsubscribers</MenuItem>
                                <MenuItem value="Tagless">Tagless</MenuItem>
                                <MenuItem value="Influencers in Progress">Influencers in Progress</MenuItem>
                                <MenuItem value="Fundraising">Fundraising</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            label="Notes"
                            fullWidth
                            multiline
                            rows={4}
                            value={formData.notes || ''}
                            onChange={(e) => handleChange('notes', e.target.value)}
                        />
                    </>
                ) : (
                    <>
                        <TextField
                            label="Subject / Name"
                            fullWidth
                            value={formData.label || ''}
                            onChange={(e) => handleChange('label', e.target.value)}
                        />

                        <TextField
                            label="Link Name (Button)"
                            fullWidth
                            value={formData.buttonName || ''}
                            onChange={(e) => handleChange('buttonName', e.target.value)}
                            placeholder="e.g., For Menik's aid"
                        />

                        <Divider textAlign="left" sx={{ my: 2 }}><Typography variant="caption" color="text.secondary">Scheduling</Typography></Divider>

                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <DateTimePicker
                                label="Send Date & Time"
                                value={formData.sendDate ? dayjs(formData.sendDate) : null}
                                onChange={(newValue: Dayjs | null) => handleChange('sendDate', newValue ? newValue.toISOString() : null)}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Box>

                        {/* DNR Section */}
                        <Box sx={{ mt: 2, p: 2, borderRadius: '12px', bgcolor: alpha(theme.palette.secondary.main, 0.05), border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: formData.isDnr ? 2 : 0 }}>
                                <Typography variant="subtitle2" fontWeight={700} color="secondary.main">
                                    ❤️ DNR (Donor) Send
                                </Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.isDnr || false}
                                            onChange={(e) => handleChange('isDnr', e.target.checked)}
                                            color="secondary"
                                        />
                                    }
                                    label={formData.isDnr ? "Active" : "Inactive"}
                                />
                            </Box>

                            {formData.isDnr && (
                                <DateTimePicker
                                    label="DNR Send Date"
                                    value={formData.dnrDate ? dayjs(formData.dnrDate) : null}
                                    onChange={(newValue: Dayjs | null) => handleChange('dnrDate', newValue ? newValue.toISOString() : null)}
                                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                />
                            )}
                        </Box>

                        <Divider textAlign="left" sx={{ my: 2 }}><Typography variant="caption" color="text.secondary">Configuration</Typography></Divider>

                        <FormControl fullWidth>
                            <InputLabel>Service</InputLabel>
                            <Select
                                value={formData.service || 'Automation'}
                                label="Service"
                                onChange={(e) => handleChange('service', e.target.value)}
                            >
                                <MenuItem value="Automation">Automation</MenuItem>
                                <MenuItem value="Brevo">Brevo</MenuItem>
                                <MenuItem value="Mailchimp">Mailchimp</MenuItem>
                                <MenuItem value="SalesHandy">SalesHandy</MenuItem>
                                <MenuItem value="smartlead">smartlead</MenuItem>
                                <MenuItem value="GetResponse">GetResponse</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </Select>
                        </FormControl>

                        {formData.service === 'Other' && (
                            <TextField
                                label="Specify Service"
                                fullWidth
                                value={formData.customService || ''}
                                onChange={(e) => handleChange('customService', e.target.value)}
                                sx={{ mt: 2 }}
                            />
                        )}

                        <TextField
                            label="Sending Account"
                            fullWidth
                            value={formData.account || 'Default'}
                            onChange={(e) => handleChange('account', e.target.value)}
                        />

                        <FormControl fullWidth>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={formData.status || 'pending'}
                                label="Status"
                                onChange={(e) => handleChange('status', e.target.value)}
                            >
                                <MenuItem value="pending">Pending</MenuItem>
                                <MenuItem value="scheduled">Scheduled</MenuItem>
                                <MenuItem value="sent">Sent</MenuItem>
                                <MenuItem value="failed">Failed</MenuItem>
                                <MenuItem value="draft">Draft</MenuItem>
                            </Select>
                        </FormControl>
                    </>
                )}
            </Stack>

            <Box sx={{ mt: 'auto', pt: 2, display: 'flex', gap: 2 }}>
                {onDelete && (
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={onDelete}
                        sx={{ borderRadius: '12px' }}
                    >
                        Delete
                    </Button>
                )}
                {onDuplicate && (
                    <Tooltip title={!nodeData?.originalSend ? "Save this node first to duplicate it" : "Duplicate this send"}>
                        <span>
                            <Button
                                variant="outlined"
                                color="primary"
                                onClick={() => {
                                    console.log('Duplicate button clicked in NodeEditorPanel');
                                    if (onDuplicate) {
                                        console.log('Executing onDuplicate callback');
                                        onDuplicate();
                                    } else {
                                        console.error('onDuplicate prop is missing');
                                    }
                                }}
                                disabled={!nodeData?.originalSend}
                                sx={{ borderRadius: '12px' }}
                            >
                                Duplicate
                            </Button>
                        </span>
                    </Tooltip>
                )}
                <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    fullWidth
                    sx={{
                        borderRadius: '12px',
                        background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`
                    }}
                >
                    Save Changes
                </Button>
            </Box>
        </Drawer >
    );
};
