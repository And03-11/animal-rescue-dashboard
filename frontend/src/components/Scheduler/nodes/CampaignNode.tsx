import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Typography, Paper, Chip, Tooltip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import CampaignIcon from '@mui/icons-material/Campaign';
import NotesIcon from '@mui/icons-material/Notes';

const CampaignNode = ({ data, isConnectable }: NodeProps) => {
    const theme = useTheme();

    return (
        <Tooltip title="Double click to edit campaign" placement="top">
            <Paper
                elevation={3}
                sx={{
                    padding: 0,
                    minWidth: 240,
                    borderRadius: '12px',
                    border: `2px solid ${theme.palette.primary.main}`,
                    background: theme.palette.background.paper,
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        boxShadow: theme.shadows[6],
                        transform: 'scale(1.02)'
                    }
                }}
            >
                {/* Header */}
                <Box sx={{
                    bgcolor: theme.palette.primary.main,
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    color: '#fff'
                }}>
                    <CampaignIcon />
                    <Typography variant="subtitle1" fontWeight="bold">
                        {data.title || 'Campaign'}
                    </Typography>
                </Box>

                {/* Content */}
                <Box sx={{ p: 2 }}>
                    <Chip
                        label={data.category || 'Uncategorized'}
                        size="small"
                        sx={{
                            mb: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                            fontWeight: 600
                        }}
                    />

                    {data.notes && (
                        <Box sx={{ display: 'flex', gap: 1, color: 'text.secondary' }}>
                            <NotesIcon sx={{ fontSize: 16, mt: 0.3 }} />
                            <Typography variant="caption" sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {data.notes}
                            </Typography>
                        </Box>
                    )}
                </Box>

                <Handle
                    type="source"
                    position={Position.Right}
                    isConnectable={isConnectable}
                    style={{ background: theme.palette.primary.main, width: 12, height: 12 }}
                />
            </Paper>
        </Tooltip>
    );
};

export default memo(CampaignNode);
