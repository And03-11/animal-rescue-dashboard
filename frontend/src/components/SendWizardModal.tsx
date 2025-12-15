import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    MenuItem,
    Stack,
    Typography,
    Box,
    IconButton,
    useTheme,
    alpha,
    FormControl,
    InputLabel,
    Select
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import dayjs, { Dayjs } from 'dayjs';

interface SendWizardModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (sends: any[]) => Promise<void>;
    campaignCategory: string;
    segmentationMode: string;
}

export const SendWizardModal: React.FC<SendWizardModalProps> = ({
    open,
    onClose,
    onSave,
    campaignCategory,
    segmentationMode
}) => {
    const theme = useTheme();
    const [loading, setLoading] = useState(false);

    // State for different modes
    const [singleTime, setSingleTime] = useState<Dayjs | null>(dayjs());

    // Split Time State
    const [usaTime, setUsaTime] = useState<Dayjs | null>(dayjs());
    const [eurTime, setEurTime] = useState<Dayjs | null>(dayjs());
    const [yahooTime, setYahooTime] = useState<Dayjs | null>(dayjs());

    // Standard Mode State
    const [standardRegion, setStandardRegion] = useState<'USA' | 'EUR'>('USA');
    const [standardTime, setStandardTime] = useState<Dayjs | null>(dayjs());

    // Reset state on open
    useEffect(() => {
        if (open) {
            const now = dayjs();
            setSingleTime(now);
            setUsaTime(now);
            setEurTime(now);
            setYahooTime(now);
            setStandardTime(now);
            setStandardRegion('USA');
        }
    }, [open]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const sends: any[] = [];

            if (segmentationMode === 'bc_single') {
                // Create 5 sends at the same time
                if (!singleTime) return;
                const time = singleTime;
                ['Tag #1', 'Tag #2', 'Tag #3', 'Tag #4', 'Tag #5'].forEach(tag => {
                    sends.push({
                        send_at: time,
                        segment_tag: tag,
                        service: 'Other', // Default service
                        status: 'pending'
                    });
                });
            } else if (segmentationMode === 'bc_split') {
                // Create 3 groups
                if (usaTime) {
                    ['Tag #1', 'Tag #4'].forEach(tag => {
                        sends.push({ send_at: usaTime, segment_tag: tag, service: 'Other', status: 'pending' });
                    });
                }
                if (eurTime) {
                    ['Tag #2', 'Tag #3'].forEach(tag => {
                        sends.push({ send_at: eurTime, segment_tag: tag, service: 'Other', status: 'pending' });
                    });
                }
                if (yahooTime) {
                    sends.push({ send_at: yahooTime, segment_tag: 'Tag #5', service: 'Other', status: 'pending' });
                }
            } else {
                // Standard Mode
                if (!standardTime) return;
                const tags = standardRegion === 'USA' ? ['Tag #1', 'Tag #4'] : ['Tag #2', 'Tag #3'];
                tags.forEach(tag => {
                    sends.push({
                        send_at: standardTime,
                        segment_tag: tag,
                        service: 'Other',
                        status: 'pending'
                    });
                });
            }

            await onSave(sends);
            onClose();
        } catch (err) {
            console.error('Error in wizard save:', err);
        } finally {
            setLoading(false);
        }
    };

    const renderContent = () => {
        if (segmentationMode === 'bc_single') {
            return (
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        This will schedule sends for all 5 tags (Tag #1 - #5) at the same time.
                    </Typography>
                    <DateTimePicker
                        label="Send Time (All Tags)"
                        value={singleTime}
                        onChange={setSingleTime}
                        slotProps={{ textField: { fullWidth: true } }}
                    />
                </Stack>
            );
        } else if (segmentationMode === 'bc_split') {
            return (
                <Stack spacing={3}>
                    <Typography variant="body2" color="text.secondary">
                        Schedule segments separately for USA, Europe, and Yahoo/Other.
                    </Typography>
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>USA Segment (Tags #1, #4)</Typography>
                        <DateTimePicker
                            value={usaTime}
                            onChange={setUsaTime}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>Europe Segment (Tags #2, #3)</Typography>
                        <DateTimePicker
                            value={eurTime}
                            onChange={setEurTime}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>Yahoo/Other Segment (Tag #5)</Typography>
                        <DateTimePicker
                            value={yahooTime}
                            onChange={setYahooTime}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </Box>
                </Stack>
            );
        } else {
            // Standard
            return (
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        Select a region to schedule sends for.
                    </Typography>
                    <FormControl fullWidth>
                        <InputLabel>Region</InputLabel>
                        <Select
                            value={standardRegion}
                            label="Region"
                            onChange={(e) => setStandardRegion(e.target.value as 'USA' | 'EUR')}
                        >
                            <MenuItem value="USA">USA (Tags #1, #4)</MenuItem>
                            <MenuItem value="EUR">Europe (Tags #2, #3)</MenuItem>
                        </Select>
                    </FormControl>
                    <DateTimePicker
                        label="Send Time"
                        value={standardTime}
                        onChange={setStandardTime}
                        slotProps={{ textField: { fullWidth: true } }}
                    />
                </Stack>
            );
        }
    };

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
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={700}>
                    Schedule Sends
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                    {renderContent()}
                </LocalizationProvider>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} disabled={loading}>Cancel</Button>
                <Button variant="contained" onClick={handleSave} disabled={loading}>
                    {loading ? 'Scheduling...' : 'Schedule Sends'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
