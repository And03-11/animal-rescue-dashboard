import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, useTheme, alpha, CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { motion } from 'framer-motion';
import axios from 'axios';

interface FunnelData {
    total_funnel: number;
    pending_approvals: number;
    total_unsubscribed: number;
    stage_breakdown: { name: string; count: number }[];
}

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            type: "spring" as const,
            stiffness: 100
        }
    }
};

export const FunnelStats: React.FC = () => {
    const theme = useTheme();
    const [data, setData] = useState<FunnelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await axios.get('/api/v1/dashboard/funnel-stats');
                setData(response.data);
            } catch (err: any) {
                console.error('Funnel stats error:', err);
                const detail = err.response?.data?.detail || err.message || 'Unknown error';
                setError(`Failed to load: ${detail} (Status: ${err.response?.status})`);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography color="error" variant="body1">{error}</Typography>
            </Box>
        );
    }

    if (!data) {
        return null; // Should not happen if loading is false and no error
    }

    const getBarColor = (index: number, total: number) => {
        const hue = 200 + (index / total) * 60;
        return `hsl(${hue}, 80%, 60%)`;
    };

    return (
        <motion.div variants={itemVariants} initial="hidden" animate="visible">
            <Grid container spacing={4} sx={{ mb: 4 }}>
                {/* Summary Cards */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper
                        sx={{
                            p: 3,
                            height: '100%',
                            borderRadius: '24px',
                            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.8)} 100%)`,
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            Total in Funnel
                        </Typography>
                        <Typography variant="h2" fontWeight="800" color="primary">
                            {data.total_funnel}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper
                        sx={{
                            p: 3,
                            height: '100%',
                            borderRadius: '24px',
                            background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.8)} 100%)`,
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            Pending Approval
                        </Typography>
                        <Typography variant="h2" fontWeight="800" color="warning.main">
                            {data.pending_approvals}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper
                        sx={{
                            p: 3,
                            height: '100%',
                            borderRadius: '24px',
                            background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.8)} 100%)`,
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            Unsubscribed
                        </Typography>
                        <Typography variant="h2" fontWeight="800" color="error.main">
                            {data.total_unsubscribed}
                        </Typography>
                    </Paper>
                </Grid>

                {/* Chart */}
                <Grid size={12}>
                    <Paper
                        sx={{
                            p: 4,
                            borderRadius: '24px',
                            background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.6)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                        }}
                    >
                        <Typography variant="h6" fontWeight="800" sx={{ mb: 3 }}>
                            Funnel Stage Breakdown
                        </Typography>
                        <Box sx={{ height: 400, width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={data.stage_breakdown}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.secondary, 0.1)} vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke={theme.palette.text.secondary}
                                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                        angle={-45}
                                        textAnchor="end"
                                        interval={0}
                                        height={60}
                                    />
                                    <YAxis
                                        stroke={theme.palette.text.secondary}
                                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: alpha(theme.palette.background.paper, 0.9),
                                            borderRadius: '12px',
                                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                            boxShadow: theme.shadows[4],
                                            color: theme.palette.text.primary
                                        }}
                                        cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }}
                                    />
                                    <Bar dataKey="count" radius={[8, 8, 0, 0]} animationDuration={1500}>
                                        {data.stage_breakdown.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={getBarColor(index, data.stage_breakdown.length)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </motion.div>
    );
};
