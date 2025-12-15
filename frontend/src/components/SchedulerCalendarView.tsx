import { Paper, Typography, useTheme, alpha } from '@mui/material';

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
        title?: string;
        service?: string;
        status?: string;
        segment_tag?: string;
        parent_title?: string;
        parent_category?: string;
        segmentation_mode?: string;
    };
}

interface SchedulerCalendarViewProps {
    events: CalendarEvent[];
    onEventClick: (event: CalendarEvent) => void;
}

export const SchedulerCalendarView: React.FC<SchedulerCalendarViewProps> = () => {
    const theme = useTheme();

    return (
        <Paper
            sx={{
                p: 8,
                textAlign: 'center',
                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                    theme.palette.background.paper,
                    0.9
                )} 100%)`,
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <Typography variant="h5" fontWeight={700} gutterBottom>
                Calendar View
            </Typography>
            <Typography variant="body1" color="text.secondary">
                Coming soon - Full calendar integration
            </Typography>
        </Paper>
    );
};
