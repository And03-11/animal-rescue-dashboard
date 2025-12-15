import { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    IconButton,
    Stack,
    Chip,
    MenuItem,
    useTheme,
    alpha
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import dayjs from 'dayjs';

// Import shared types
import type { Campaign, CampaignEmail, ScheduledSend } from '../types/scheduler.types';

interface CampaignDetailsPanelProps {
    campaign: Campaign | null;
    onUpdateEmail: (email: CampaignEmail) => Promise<void>;
    onAddSend: (send: Partial<ScheduledSend>) => Promise<void>;
    onUpdateSend: (send: ScheduledSend) => Promise<void>;
    onDeleteSend: (id: number) => Promise<void>;
    onDeleteCampaign: () => Promise<void>;
    onUpdateCampaign: (campaign: Campaign) => Promise<void>;
}

export const CampaignDetailsPanel: React.FC<CampaignDetailsPanelProps> = ({
    campaign,
    onUpdateEmail,
    onAddSend,
    onUpdateSend,
    onDeleteSend,
    onDeleteCampaign,
    onUpdateCampaign
}) => {
    console.log('CampaignDetailsPanel rendering with:', campaign);
    const theme = useTheme();
    const [editingSend, setEditingSend] = useState<number | null>(null);
    const [editingSendData, setEditingSendData] = useState<ScheduledSend | null>(null);
    const [editingEmail, setEditingEmail] = useState<CampaignEmail | null>(null);
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editData, setEditData] = useState<Partial<Campaign>>({});

    useEffect(() => {
        if (campaign) {
            setEditData(campaign);
        }
    }, [campaign]);

    const handleSaveDetails = async () => {
        if (campaign && editData) {
            await onUpdateCampaign({ ...campaign, ...editData } as Campaign);
            setIsEditingDetails(false);
        }
    };

    if (!campaign) {
        return (
            <Paper
                elevation={0}
                sx={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '16px',
                    background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                        theme.palette.background.paper,
                        0.95
                    )} 100%)`,
                }}
            >
                <Typography variant="h6" color="text.secondary">
                    Select a campaign to view details
                </Typography>
            </Paper>
        );
    }

    const handleAddSend = () => {
        const newSend: Partial<ScheduledSend> = {
            send_at: dayjs(),
            service: 'Other',
            status: 'pending',
            segment_tag: ''
        };
        onAddSend(newSend);
    };

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Big Campaigns': '#FF8F00',
            'NBC': '#D32F2F',
            'Unsubscribers': '#C2185B',
            'Tagless': '#7B1FA2',
            'Fundraising': '#303F9F',
        };
        return colors[category] || '#5D4037';
    };

    const getServiceColor = (service: any) => {
        if (typeof service !== 'string') return '#757575';
        const colors: Record<string, string> = {
            'Mailchimp': '#fbb254',
            'Brevo': '#0b996e',
            'Automation': '#6c5ce7',
            'Internal': '#38AECC',
        };
        return colors[service] || '#757575';
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                    theme.palette.background.paper,
                    0.95
                )} 100%)`,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                borderRadius: '16px',
                overflow: 'hidden'
            }}
        >
            {/* Header */}
            <Box sx={{ p: 3, borderBottom: `1px solid ${theme.palette.divider}` }}>
                {isEditingDetails ? (
                    <Stack spacing={2}>
                        <TextField
                            label="Campaign Title"
                            value={editData.title || ''}
                            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                            fullWidth
                            size="small"
                        />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                select
                                label="Category"
                                value={editData.category || 'Other'}
                                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                size="small"
                                sx={{ width: 150 }}
                            >
                                <MenuItem value="Big Campaigns">Big Campaigns</MenuItem>
                                <MenuItem value="NBC">NBC</MenuItem>
                                <MenuItem value="Unsubscribers">Unsubscribers</MenuItem>
                                <MenuItem value="Tagless">Tagless</MenuItem>
                                <MenuItem value="Fundraising">Fundraising</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </TextField>
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <DateTimePicker
                                    label="Start Date"
                                    value={dayjs(editData.start_date)}
                                    onChange={(newValue) => setEditData({ ...editData, start_date: newValue?.toISOString() || '' })}
                                    slotProps={{ textField: { size: 'small' } }}
                                />
                                <DateTimePicker
                                    label="End Date"
                                    value={dayjs(editData.end_date)}
                                    onChange={(newValue) => setEditData({ ...editData, end_date: newValue?.toISOString() || '' })}
                                    slotProps={{ textField: { size: 'small' } }}
                                />
                            </LocalizationProvider>
                        </Box>
                        <TextField
                            label="Notes"
                            value={editData.notes || ''}
                            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                            multiline
                            rows={3}
                            fullWidth
                            size="small"
                        />
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button onClick={() => setIsEditingDetails(false)}>Cancel</Button>
                            <Button variant="contained" onClick={handleSaveDetails}>Save Changes</Button>
                        </Box>
                    </Stack>
                ) : (
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Typography variant="h5" fontWeight={700}>
                                        {campaign.title}
                                    </Typography>
                                    <IconButton size="small" onClick={() => setIsEditingDetails(true)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                <Chip
                                    label={campaign.category}
                                    size="small"
                                    sx={{
                                        borderRadius: '6px',
                                        bgcolor: alpha(getCategoryColor(campaign.category), 0.2),
                                        color: getCategoryColor(campaign.category),
                                        fontWeight: 600
                                    }}
                                />
                            </Box>
                        </Box>

                        <Typography variant="body2" color="text.secondary">
                            {dayjs(campaign.start_date).format('MMM D, YYYY')} - {dayjs(campaign.end_date).format('MMM D, YYYY')}
                        </Typography>

                        {campaign.notes && (
                            <Paper sx={{ p: 2, mt: 2, bgcolor: alpha(theme.palette.info.main, 0.05), borderRadius: '12px' }}>
                                <Typography variant="body2" color="text.secondary">
                                    {campaign.notes}
                                </Typography>
                            </Paper>
                        )}
                    </>
                )}
            </Box>

            {/* Scrollable Content */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                <Stack spacing={3}>
                    {/* Scheduled Sends Section */}

                    {/* Scheduled Sends Section */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" fontWeight={700}>
                                Scheduled Sends ({campaign.sends?.length || 0})
                            </Typography>
                            <Button
                                startIcon={<AddIcon />}
                                onClick={handleAddSend}
                                variant="outlined"
                                size="small"
                                sx={{ borderRadius: '8px', textTransform: 'none' }}
                            >
                                Add Send
                            </Button>
                        </Box>

                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <Stack spacing={2}>
                                {campaign.sends && campaign.sends.length > 0 ? (
                                    campaign.sends.map((send, index) => {
                                        const sendEmail = campaign.emails?.find(e => e.id === send.campaign_email_id);
                                        const isEditing = send.id && editingSend === send.id;
                                        const sendKey = (typeof send.id === 'string' || typeof send.id === 'number') ? send.id : `send-${index}`;

                                        return (
                                            <Paper
                                                key={sendKey}
                                                sx={{
                                                    p: 2,
                                                    borderRadius: '12px',
                                                    border: `2px solid ${alpha(getServiceColor(send.service), 0.3)}`,
                                                    bgcolor: alpha(getServiceColor(send.service), 0.05),
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {isEditing && editingSendData ? (
                                                    // Edit Mode
                                                    <Stack spacing={2}>
                                                        <DateTimePicker
                                                            label="Send Date & Time"
                                                            value={dayjs(editingSendData.send_at)}
                                                            onChange={(newValue) => {
                                                                if (newValue) {
                                                                    setEditingSendData({ ...editingSendData, send_at: newValue });
                                                                }
                                                            }}
                                                            slotProps={{
                                                                textField: {
                                                                    size: 'small',
                                                                    fullWidth: true,
                                                                    sx: { '& .MuiOutlinedInput-root': { borderRadius: '8px' } }
                                                                }
                                                            }}
                                                        />

                                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                                            <TextField
                                                                select
                                                                label="Service"
                                                                value={editingSendData.service}
                                                                onChange={(e) => setEditingSendData({ ...editingSendData, service: e.target.value })}
                                                                size="small"
                                                                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                                                            >
                                                                <MenuItem value="Mailchimp">Mailchimp</MenuItem>
                                                                <MenuItem value="Brevo">Brevo</MenuItem>
                                                                <MenuItem value="Automation">Automation</MenuItem>
                                                                <MenuItem value="Internal">Internal</MenuItem>
                                                                <MenuItem value="Other">Other</MenuItem>
                                                            </TextField>

                                                            <TextField
                                                                label="Segment Tag"
                                                                value={editingSendData.segment_tag || ''}
                                                                onChange={(e) => setEditingSendData({ ...editingSendData, segment_tag: e.target.value })}
                                                                size="small"
                                                                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                                                            />
                                                        </Box>

                                                        {/* Email Content Editing */}
                                                        {editingEmail && (
                                                            <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                                                <Typography variant="caption" fontWeight={700} color="text.secondary" gutterBottom>
                                                                    EMAIL CONTENT
                                                                </Typography>
                                                                <Stack spacing={2} mt={1}>
                                                                    <TextField
                                                                        label="Subject"
                                                                        value={editingEmail.subject || ''}
                                                                        onChange={(e) => setEditingEmail({ ...editingEmail, subject: e.target.value })}
                                                                        size="small"
                                                                        fullWidth
                                                                    />
                                                                    <TextField
                                                                        label="Button Name"
                                                                        value={editingEmail.button_name || ''}
                                                                        onChange={(e) => setEditingEmail({ ...editingEmail, button_name: e.target.value })}
                                                                        size="small"
                                                                        fullWidth
                                                                    />
                                                                </Stack>
                                                            </Box>
                                                        )}

                                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                            <Button
                                                                size="small"
                                                                onClick={async () => {
                                                                    if (editingSendData) await onUpdateSend(editingSendData);
                                                                    if (editingEmail) await onUpdateEmail(editingEmail);
                                                                    setEditingSend(null);
                                                                    setEditingSendData(null);
                                                                    setEditingEmail(null);
                                                                }}
                                                                variant="contained"
                                                                sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                            >
                                                                Done
                                                            </Button>
                                                        </Box>
                                                    </Stack>
                                                ) : (
                                                    // View Mode
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                                        <Box sx={{ flex: 1 }}>
                                                            <Typography variant="subtitle2" fontWeight={600}>
                                                                {dayjs.isDayjs(send.send_at) ? send.send_at.format('MMM D, YYYY • h:mm A') : dayjs(send.send_at).format('MMM D, YYYY • h:mm A')}
                                                            </Typography>

                                                            {/* Display Email Subject/Button */}
                                                            {sendEmail && (
                                                                <Box sx={{ mt: 1, mb: 1 }}>
                                                                    <Typography variant="body2" color="text.primary">
                                                                        <strong>Subject:</strong> {sendEmail.subject}
                                                                    </Typography>
                                                                    {sendEmail.button_name && (
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            Button: {sendEmail.button_name}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            )}

                                                            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                                                                <Chip
                                                                    label={typeof send.service === 'string' ? send.service : 'Unknown'}
                                                                    size="small"
                                                                    sx={{
                                                                        height: '22px',
                                                                        fontSize: '0.75rem',
                                                                        borderRadius: '6px',
                                                                        bgcolor: alpha(getServiceColor(send.service), 0.2),
                                                                        color: getServiceColor(send.service)
                                                                    }}
                                                                />
                                                                {send.segment_tag && (
                                                                    <Chip
                                                                        label={typeof send.segment_tag === 'string' ? send.segment_tag : ''}
                                                                        size="small"
                                                                        sx={{
                                                                            height: '22px',
                                                                            fontSize: '0.75rem',
                                                                            borderRadius: '6px'
                                                                        }}
                                                                    />
                                                                )}
                                                                <Chip
                                                                    label={typeof send.status === 'string' ? send.status : 'pending'}
                                                                    size="small"
                                                                    sx={{
                                                                        height: '22px',
                                                                        fontSize: '0.75rem',
                                                                        borderRadius: '6px',
                                                                        bgcolor: send.status === 'sent' ? alpha(theme.palette.success.main, 0.2) : alpha(theme.palette.warning.main, 0.2),
                                                                        color: send.status === 'sent' ? theme.palette.success.main : theme.palette.warning.main
                                                                    }}
                                                                />
                                                            </Box>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                            <IconButton
                                                                size="small"
                                                                color="primary"
                                                                onClick={() => {
                                                                    setEditingSend(send.id);
                                                                    setEditingSendData(send);
                                                                    if (sendEmail) setEditingEmail(sendEmail);
                                                                }}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                color="primary"
                                                                onClick={() => {
                                                                    // Duplicate send
                                                                    const sendDate = dayjs.isDayjs(send.send_at) ? send.send_at : dayjs(send.send_at);
                                                                    onAddSend({
                                                                        send_at: sendDate.add(1, 'day'),
                                                                        service: send.service,
                                                                        status: 'pending',
                                                                        segment_tag: send.segment_tag
                                                                    });
                                                                }}
                                                            >
                                                                <ContentCopyIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => send.id && onDeleteSend(send.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Box>
                                                    </Box>
                                                )}
                                            </Paper>
                                        );
                                    })
                                ) : (
                                    <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                                        No scheduled sends yet. Click "Add Send" to schedule one.
                                    </Typography>
                                )}
                            </Stack>
                        </LocalizationProvider>
                    </Box>

                    {/* Notes Section Removed (Moved to Header/Edit Form) */}
                </Stack>
            </Box>

            {/* Quick Actions Footer */}
            <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', gap: 1 }}>
                <Button
                    startIcon={<DeleteIcon />}
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={onDeleteCampaign}
                    sx={{ borderRadius: '8px', textTransform: 'none' }}
                >
                    Delete Campaign
                </Button>
                <Button
                    startIcon={<ContentCopyIcon />}
                    variant="outlined"
                    size="small"
                    sx={{ borderRadius: '8px', textTransform: 'none' }}
                >
                    Duplicate
                </Button>
                <Button
                    startIcon={<EmailIcon />}
                    variant="outlined"
                    size="small"
                    sx={{ borderRadius: '8px', textTransform: 'none' }}
                >
                    Send Test
                </Button>
            </Box>
        </Paper>
    );
};
