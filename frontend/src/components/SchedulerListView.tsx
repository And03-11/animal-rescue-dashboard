import { Box, Paper, Typography, Chip, useTheme, alpha } from '@mui/material';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end?: string;
    backgroundColor: string;
    borderColor: string;
    extendedProps: {
        type: 'campaign' | 'send';
        category?: string;
        status?: string;
    };
}

interface SchedulerListViewProps {
    events: CalendarEvent[];
    onEventClick: (event: CalendarEvent) => void;
}

export const SchedulerListView: React.FC<SchedulerListViewProps> = ({ events, onEventClick }) => {
    const theme = useTheme();

    // Group events by campaign
    const campaigns = events.filter((e) => e.extendedProps.type === 'campaign');
    const sends = events.filter((e) => e.extendedProps.type === 'send');

    // Sort by date
    const sortedCampaigns = [...campaigns].sort((a, b) =>
        dayjs(a.start).unix() - dayjs(b.start).unix()
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sortedCampaigns.length === 0 ? (
                <Paper
                    sx={{
                        p: 8,
                        textAlign: 'center',
                        background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                            theme.palette.background.paper,
                            0.9
                        )} 100%)`
                    }}
                >
                    <Typography variant="h6" color="text.secondary">
                        No campaigns found
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Try adjusting your filters
                    </Typography>
                </Paper>
            ) : (
                sortedCampaigns.map((campaign, index) => {
                    const campaignSends = sends.filter(
                        (s) => s.id.includes(`campaign_${campaign.extendedProps}`)
                    );

                    return (
                        <Paper
                            key={campaign.id}
                            component={motion.div}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => onEventClick(campaign)}
                            sx={{
                                p: 3,
                                cursor: 'pointer',
                                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                                    theme.palette.background.paper,
                                    0.95
                                )} 100%)`,
                                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: theme.shadows[8],
                                    borderColor: campaign.borderColor
                                }
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                                <Box
                                    sx={{
                                        width: 4,
                                        height: 60,
                                        borderRadius: 2,
                                        bgcolor: campaign.backgroundColor,
                                        flexShrink: 0
                                    }}
                                />
                                <Box sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                                        <Typography variant="h6" fontWeight={700}>
                                            {campaign.title}
                                        </Typography>
                                        <Chip
                                            label={campaign.extendedProps.category || 'Other'}
                                            size="small"
                                            sx={{
                                                borderRadius: '6px',
                                                bgcolor: alpha(campaign.backgroundColor, 0.2),
                                                color: campaign.backgroundColor,
                                                fontWeight: 600
                                            }}
                                        />
                                    </Box>

                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {dayjs(campaign.start).format('MMM D, YYYY')}
                                        {campaign.end && ` - ${dayjs(campaign.end).format('MMM D, YYYY')}`}
                                    </Typography>

                                    {campaignSends.length > 0 && (
                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                                                {campaignSends.length} send{campaignSends.length !== 1 ? 's' : ''}:
                                            </Typography>
                                            {campaignSends.slice(0, 3).map((send) => (
                                                <Chip
                                                    key={send.id}
                                                    label={dayjs(send.start).format('MMM D')}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ borderRadius: '6px', fontSize: '0.7rem' }}
                                                />
                                            ))}
                                            {campaignSends.length > 3 && (
                                                <Chip
                                                    label={`+${campaignSends.length - 3} more`}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ borderRadius: '6px', fontSize: '0.7rem' }}
                                                />
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Paper>
                    );
                })
            )}
        </Box>
    );
};
