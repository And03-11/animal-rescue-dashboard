import { Box, Paper, Typography, useTheme, alpha } from '@mui/material';

interface SchedulerCalendarViewProps {
    events: any[];
    onEventClick: (event: any) => void;
}

export const SchedulerCalendarView: React.FC<SchedulerCalendarViewProps> = ({
    events,
    onEventClick
}) => {
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
