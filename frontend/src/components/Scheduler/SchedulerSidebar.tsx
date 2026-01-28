import { Box, Paper, Typography, useTheme } from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import EmailIcon from '@mui/icons-material/Email';

export const SchedulerSidebar = () => {
    const theme = useTheme();

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <Paper
            elevation={2}
            sx={{
                p: 2,
                height: '100%',
                background: theme.palette.background.default,
                borderRight: `1px solid ${theme.palette.divider}`
            }}
        >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                Toolbox
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Drag and drop nodes to the canvas.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper
                    elevation={1}
                    onDragStart={(event) => onDragStart(event, 'campaign')}
                    draggable
                    sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        cursor: 'grab',
                        border: `1px solid ${theme.palette.primary.main}`,
                        '&:hover': { boxShadow: 2 }
                    }}
                >
                    <CampaignIcon color="primary" />
                    <Typography>Campaign Start</Typography>
                </Paper>

                <Paper
                    elevation={1}
                    onDragStart={(event) => onDragStart(event, 'email')}
                    draggable
                    sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        cursor: 'grab',
                        border: `1px solid ${theme.palette.secondary.main}`,
                        '&:hover': { boxShadow: 2 }
                    }}
                >
                    <EmailIcon color="secondary" />
                    <Typography>Email / Send</Typography>
                </Paper>
            </Box>
        </Paper>
    );
};
