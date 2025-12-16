import React, { useMemo } from 'react';
import {
    Box, Typography, Paper, useTheme, alpha
} from '@mui/material';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    AreaChart, Area
} from 'recharts';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';

interface AnalyticsChartsProps {
    chartData: any[];
    donations?: any[];
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

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ chartData, donations }) => {
    const theme = useTheme();

    const getBarColor = (index: number, total: number) => {
        const hue = (index / total) * 360;
        return `hsl(${hue}, 70%, 60%)`;
    };

    // Process donations for trend chart
    const trendData = useMemo(() => {
        if (!donations || donations.length === 0) return [];

        const grouped = donations.reduce((acc: any, curr: any) => {
            const date = dayjs(curr.date).format('YYYY-MM-DD');
            if (!acc[date]) {
                acc[date] = 0;
            }
            acc[date] += curr.amount;
            return acc;
        }, {});

        const sortedKeys = Object.keys(grouped).sort();
        const data = sortedKeys.map(date => ({
            date: dayjs(date).format('MMM DD'),
            amount: grouped[date],
            timestamp: dayjs(date).valueOf()
        }));

        // If we have only 1 point (or very few), add a "start" point with 0 to show a trend line
        if (data.length === 1) {
            const first = data[0];
            const prevDate = dayjs(first.timestamp).subtract(1, 'day');
            data.unshift({
                date: prevDate.format('MMM DD'),
                amount: 0,
                timestamp: prevDate.valueOf()
            });
        }

        return data;
    }, [donations]);

    if (!chartData || chartData.length === 0) {
        return null;
    }

    // Decide which chart to show
    // If we have a single item in breakdown (or none), but we have donations, show trend
    // We relax the condition to show trend even if we only have 1 day of data (padded above)
    const showTrend = (chartData.length <= 1) && donations && donations.length > 0;

    return (
        <motion.div variants={itemVariants}>
            <Paper
                sx={{
                    p: 4,
                    mb: 4,
                    borderRadius: '24px',
                    background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.6)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    overflow: 'hidden'
                }}
            >
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px' }}>
                        {showTrend ? 'Recent Donation Trend' : 'Revenue by Form Title'}
                    </Typography>
                </Box>

                <Box sx={{ height: 500, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        {showTrend ? (
                            <AreaChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.secondary, 0.1)} vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke={theme.palette.text.secondary}
                                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke={theme.palette.text.secondary}
                                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: alpha(theme.palette.background.paper, 0.9),
                                        borderRadius: '12px',
                                        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                        boxShadow: theme.shadows[4],
                                        color: theme.palette.text.primary
                                    }}
                                    cursor={{ stroke: theme.palette.primary.main, strokeWidth: 2 }}
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke={theme.palette.primary.main}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorAmount)"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        ) : (
                            <BarChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
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
                                />
                                <YAxis
                                    stroke={theme.palette.text.secondary}
                                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value}`}
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
                                <Bar dataKey="total_amount" radius={[8, 8, 0, 0]} animationDuration={1500}>
                                    {chartData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={getBarColor(index, chartData.length)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </Box>
            </Paper>
        </motion.div>
    );
};
