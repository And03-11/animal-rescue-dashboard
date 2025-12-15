import { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Tabs,
    Tab,
    Chip,
    IconButton,
    Button,
    Collapse,
    useTheme,
    alpha,
    Stack
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EmailIcon from '@mui/icons-material/Email';
import ScheduleIcon from '@mui/icons-material/Schedule';
import LinkIcon from '@mui/icons-material/Link';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import dayjs from 'dayjs';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end?: string;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    extendedProps: {
        type: 'campaign' | 'send';
        campaign_id: number;
        campaign_email_id?: number;
        send_id?: number;
        notes?: string;
        category?: string;
        service?: string;
        status?: string;
        segment_tag?: string;
        parent_title?: string;
        parent_category?: string;
        segmentation_mode?: string;
    };
}

interface SchedulerDetailsPanelProps {
    selectedEvent: CalendarEvent | null;
    allEvents: CalendarEvent[];
    onClose: () => void;
    onEdit?: (event: CalendarEvent) => void;
    onAddEmail?: (campaignId: number) => void;
    onEditEmail?: (emailEvent: CalendarEvent) => void;
}

export const SchedulerDetailsPanel: React.FC<SchedulerDetailsPanelProps> = ({
    selectedEvent,
    allEvents,
    onClose,
    onEdit,
    onAddEmail,
    onEditEmail
}) => {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState(0);

    if (!selectedEvent) return null;

    const isCampaign = selectedEvent.extendedProps.type === 'campaign';
    const campaignId = selectedEvent.extendedProps.campaign_id;

    // Get all emails for this campaign
    const campaignEmails = allEvents.filter(
        (e) =>
            e.extendedProps.type === 'send' &&
            e.extendedProps.campaign_id === campaignId
    );

    // Group sends by email
    const emailGroups = campaignEmails.reduce((acc, send) => {
        const emailId = send.extendedProps.campaign_email_id;
        if (!emailId) return acc;

        if (!acc[emailId]) {
            acc[emailId] = {
                emailId,
                title: send.extendedProps.parent_title || 'Untitled Email',
                sends: []
            };
        }
        acc[emailId].sends.push(send);
        return acc;
    }, {} as Record<number, { emailId: number; title: string; sends: CalendarEvent[] }>);



    return (
        <AnimatePresence>
            <Paper
                component={motion.div}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ duration: 0.3 }}
                sx={{
                    p: 0,
                    background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                        theme.palette.background.paper,
                        0.95
                    )} 100%)`,
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    boxShadow: theme.shadows[8]
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        p: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: `1px solid ${theme.palette.divider}`
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        <Box
                            sx={{
                                width: 4,
                                height: 40,
                                borderRadius: 2,
                                bgcolor: selectedEvent.backgroundColor
                            }}
                        />
                        <Box>
                            <Typography variant="h6" fontWeight={700}>
                                {selectedEvent.title}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                <Chip
                                    label={isCampaign ? 'Campaign' : 'Email Send'}
                                    size="small"
                                    color={isCampaign ? 'primary' : 'secondary'}
                                    sx={{ borderRadius: '6px', fontWeight: 600 }}
                                />
                                {selectedEvent.extendedProps.category && (
                                    <Chip
                                        label={selectedEvent.extendedProps.category}
                                        size="small"
                                        variant="outlined"
                                        sx={{ borderRadius: '6px' }}
                                    />
                                )}
                                {selectedEvent.extendedProps.status && (
                                    <Chip
                                        label={selectedEvent.extendedProps.status}
                                        size="small"
                                        color={selectedEvent.extendedProps.status === 'sent' ? 'success' : 'warning'}
                                        icon={
                                            selectedEvent.extendedProps.status === 'sent' ? (
                                                <CheckCircleIcon />
                                            ) : (
                                                <PendingIcon />
                                            )
                                        }
                                        sx={{ borderRadius: '6px', fontWeight: 600 }}
                                    />
                                )}
                            </Box>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {onEdit && isCampaign && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => onEdit(selectedEvent)}
                                sx={{ borderRadius: '8px', textTransform: 'none' }}
                            >
                                Edit
                            </Button>
                        )}
                        <IconButton onClick={() => setExpanded(!expanded)} size="small">
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                        <IconButton onClick={onClose} size="small" sx={{ ml: 0.5 }}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>

                <Collapse in={expanded}>
                    {/* Tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
                            <Tab icon={<InfoOutlinedIcon />} iconPosition="start" label="Overview" />
                            {isCampaign && <Tab icon={<EmailIcon />} iconPosition="start" label="Emails" />}
                            {isCampaign && <Tab icon={<ScheduleIcon />} iconPosition="start" label="Schedule" />}
                            <Tab icon={<LinkIcon />} iconPosition="start" label="Links" />
                        </Tabs>
                    </Box>

                    {/* Tab Content */}
                    <Box sx={{ p: 3 }}>
                        {/* Overview Tab */}
                        {activeTab === 0 && (
                            <Stack spacing={2}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                        DATE RANGE
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                        {dayjs(selectedEvent.start).format('MMM D, YYYY')}
                                        {selectedEvent.end && ` - ${dayjs(selectedEvent.end).format('MMM D, YYYY')}`}
                                        {!isCampaign && ` at ${dayjs(selectedEvent.start).format('h:mm A')}`}
                                    </Typography>
                                </Box>

                                {selectedEvent.extendedProps.notes && (
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                            NOTES
                                        </Typography>
                                        <Typography variant="body2">{selectedEvent.extendedProps.notes}</Typography>
                                    </Box>
                                )}

                                {selectedEvent.extendedProps.service && (
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                            SERVICE
                                        </Typography>
                                        <Chip
                                            label={selectedEvent.extendedProps.service}
                                            size="small"
                                            sx={{ mt: 0.5, borderRadius: '6px' }}
                                        />
                                    </Box>
                                )}

                                {selectedEvent.extendedProps.segment_tag && (
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                            SEGMENT
                                        </Typography>
                                        <Chip
                                            label={selectedEvent.extendedProps.segment_tag}
                                            size="small"
                                            color="info"
                                            sx={{ mt: 0.5, borderRadius: '6px' }}
                                        />
                                    </Box>
                                )}
                            </Stack>
                        )}

                        {/* Emails Tab (Campaign only) */}
                        {activeTab === 1 && isCampaign && (
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        startIcon={<AddIcon />}
                                        size="small"
                                        variant="contained"
                                        onClick={() => onAddEmail?.(campaignId)}
                                        sx={{
                                            borderRadius: '8px',
                                            textTransform: 'none',
                                            background: `linear-gradient(45deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`
                                        }}
                                    >
                                        Add Email
                                    </Button>
                                </Box>

                                {Object.values(emailGroups).length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                                        No emails scheduled for this campaign yet
                                    </Typography>
                                ) : (
                                    Object.values(emailGroups).map((group) => (
                                        <Paper
                                            key={group.emailId}
                                            variant="outlined"
                                            sx={{
                                                p: 2,
                                                borderRadius: '12px',
                                                bgcolor: alpha(theme.palette.background.default, 0.5),
                                                position: 'relative'
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                                                        {group.title}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {group.sends.length} send{group.sends.length !== 1 ? 's' : ''} scheduled
                                                    </Typography>
                                                </Box>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => {
                                                        const sampleSend = group.sends[0];
                                                        if (onEditEmail && sampleSend) {
                                                            onEditEmail(sampleSend);
                                                        }
                                                    }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        </Paper>
                                    ))
                                )}
                            </Stack>
                        )}

                        {/* Schedule Tab (Campaign only) */}
                        {activeTab === 2 && isCampaign && (
                            <Stack spacing={1.5}>
                                {campaignEmails.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                                        No sends scheduled yet
                                    </Typography>
                                ) : (
                                    campaignEmails
                                        .sort((a, b) => dayjs(a.start).unix() - dayjs(b.start).unix())
                                        .map((send) => (
                                            <Box
                                                key={send.id}
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    p: 1.5,
                                                    borderRadius: '8px',
                                                    bgcolor: alpha(send.backgroundColor, 0.1),
                                                    border: `1px solid ${alpha(send.borderColor, 0.3)}`
                                                }}
                                            >
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {send.title}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {dayjs(send.start).format('MMM D, YYYY • h:mm A')}
                                                    </Typography>
                                                </Box>
                                                <Chip
                                                    label={send.extendedProps.status || 'pending'}
                                                    size="small"
                                                    color={send.extendedProps.status === 'sent' ? 'success' : 'warning'}
                                                    sx={{ borderRadius: '6px', fontWeight: 600 }}
                                                />
                                            </Box>
                                        ))
                                )}
                            </Stack>
                        )}

                        {/* Links Tab */}
                        {(activeTab === (isCampaign ? 3 : 1)) && (
                            <Stack spacing={2}>
                                <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                                    Platform links will be displayed here
                                </Typography>
                                {/* Placeholder for future link integration */}
                                <Box
                                    sx={{
                                        p: 3,
                                        borderRadius: '12px',
                                        bgcolor: alpha(theme.palette.info.main, 0.05),
                                        border: `1px dashed ${alpha(theme.palette.info.main, 0.3)}`,
                                        textAlign: 'center'
                                    }}
                                >
                                    <LinkIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Link integration coming soon
                                    </Typography>
                                </Box>
                            </Stack>
                        )}
                    </Box>
                </Collapse>
            </Paper>
        </AnimatePresence>
    );
};
