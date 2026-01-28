import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Typography, Paper, Chip, Tooltip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import EmailIcon from '@mui/icons-material/Email';
import ScheduleIcon from '@mui/icons-material/Schedule';

const getStatusColor = (status: string, theme: any) => {
    switch (status) {
        case 'sent': return theme.palette.success.main;
        case 'scheduled': return theme.palette.info.main;
        case 'failed': return theme.palette.error.main;
        case 'draft': return theme.palette.text.secondary;
        default: return theme.palette.warning.main; // pending
    }
};

const EmailNode = ({ data, isConnectable }: NodeProps) => {
    const theme = useTheme();
    const statusColor = getStatusColor(data.status || 'pending', theme);

    return (
        <Tooltip title="Double click to edit" placement="top">
            <Paper
                elevation={3}
                sx={{
                    padding: 0,
                    minWidth: 220,
                    borderRadius: '12px',
                    border: `1px solid ${alpha(statusColor, 0.3)}`,
                    background: theme.palette.background.paper,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        boxShadow: theme.shadows[4],
                        borderColor: statusColor,
                        transform: 'translateY(-2px)'
                    }
                }}
            >
                <Handle
                    type="target"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    style={{ background: theme.palette.secondary.main, width: 10, height: 10 }}
                />

                {/* Header with Status Color */}
                <Box sx={{
                    bgcolor: alpha(statusColor, 0.1),
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${alpha(statusColor, 0.1)}`
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailIcon sx={{ color: statusColor, fontSize: 20 }} />
                        <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                            {data.service || 'Email'}
                        </Typography>
                    </Box>
                    <Chip
                        label={data.status || 'Pending'}
                        size="small"
                        sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: statusColor,
                            color: '#fff',
                            fontWeight: 700
                        }}
                    />
                </Box>

                {/* Content */}
                <Box sx={{ p: 2 }}>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            mb: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {data.label || 'No Subject'}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                        <ScheduleIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">
                            {data.sendDate ? new Date(data.sendDate).toLocaleString('en-GB', {
                                day: 'numeric',
                                month: 'numeric',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            }).replace(',', ' //') : 'Not Scheduled'}
                        </Typography>
                    </Box>
                </Box>

                <Handle
                    type="source"
                    position={Position.Bottom}
                    isConnectable={isConnectable}
                    style={{ background: theme.palette.secondary.main, width: 10, height: 10 }}
                />
            </Paper>
        </Tooltip>
    );
};

export default memo(EmailNode);
