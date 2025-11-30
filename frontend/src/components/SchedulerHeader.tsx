import { Box, Typography, Tabs, Tab, IconButton, Button, useTheme, alpha } from '@mui/material';
import { motion } from 'framer-motion';
import RefreshIcon from '@mui/icons-material/Refresh';
import TimelineIcon from '@mui/icons-material/Timeline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ViewListIcon from '@mui/icons-material/ViewList';
import AddIcon from '@mui/icons-material/Add';

interface SchedulerHeaderProps {
    currentView: 'timeline' | 'calendar' | 'list';
    onViewChange: (view: 'timeline' | 'calendar' | 'list') => void;
    onRefresh: () => void;
    onNewCampaign: () => void;
    loading?: boolean;
}

export const SchedulerHeader: React.FC<SchedulerHeaderProps> = ({
    currentView,
    onViewChange,
    onRefresh,
    onNewCampaign,
    loading = false
}) => {
    const theme = useTheme();

    return (
        <Box
            component={motion.div}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 3
            }}
        >
            {/* Title */}
            <Box>
                <Typography
                    variant="h4"
                    component="h1"
                    fontWeight={800}
                    sx={{
                        background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                        backgroundClip: 'text',
                        textFillColor: 'transparent',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 0.5
                    }}
                >
                    Campaign Scheduler
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Visualize and manage your campaign timeline
                </Typography>
            </Box>

            {/* View Switcher + Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Tabs
                    value={currentView}
                    onChange={(_, newValue) => onViewChange(newValue)}
                    sx={{
                        minHeight: 40,
                        '& .MuiTab-root': {
                            minHeight: 40,
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.875rem'
                        }
                    }}
                >
                    <Tab
                        value="timeline"
                        label="Timeline"
                        icon={<TimelineIcon fontSize="small" />}
                        iconPosition="start"
                    />
                    <Tab
                        value="calendar"
                        label="Calendar"
                        icon={<CalendarMonthIcon fontSize="small" />}
                        iconPosition="start"
                    />
                    <Tab
                        value="list"
                        label="List"
                        icon={<ViewListIcon fontSize="small" />}
                        iconPosition="start"
                    />
                </Tabs>

                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={onNewCampaign}
                    sx={{
                        borderRadius: '12px',
                        textTransform: 'none',
                        fontWeight: 600,
                        background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: theme.shadows[8]
                        },
                        transition: 'all 0.2s ease'
                    }}
                >
                    New Campaign
                </Button>

                <IconButton
                    onClick={onRefresh}
                    disabled={loading}
                    sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.2),
                            transform: 'rotate(180deg)',
                            transition: 'transform 0.5s ease'
                        }
                    }}
                >
                    <RefreshIcon />
                </IconButton>
            </Box>
        </Box>
    );
};
