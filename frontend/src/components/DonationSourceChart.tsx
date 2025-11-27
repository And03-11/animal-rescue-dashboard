import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Box, Typography, Paper, useTheme, alpha, CircularProgress, Alert } from '@mui/material';
import { motion } from 'framer-motion';

interface SourceData {
    name: string;
    value: number;
    percentage: number;
}

interface DonationSourceChartProps {
    data: SourceData[];
    loading: boolean;
    error: string;
}

const COLORS = {
    'Big Campaigns': '#8b5cf6',  // Purple/Violet - más distintivo
    'Facebook': '#3b82f6',       // Bright Blue - más brillante
    'New Comers': '#10b981',     // Emerald Green - se mantiene
    'Others': '#f59e0b'          // Amber/Orange - se mantiene
};

const DEFAULT_COLOR = '#9ca3af';

export const DonationSourceChart = ({ data, loading, error }: DonationSourceChartProps) => {
    const theme = useTheme();

    // Debug: Log what data we're receiving
    console.log('DonationSourceChart - data:', data, 'loading:', loading, 'error:', error);

    if (loading) {
        return (
            <Paper sx={{ p: 3, height: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <CircularProgress />
            </Paper>
        );
    }

    if (error) {
        return (
            <Paper sx={{ p: 3, height: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Alert severity="error">{error}</Alert>
            </Paper>
        );
    }

    // Filter out zero values for cleaner chart, but keep them if all are zero
    const activeData = data.filter(d => d.value > 0);
    const chartData = activeData.length > 0 ? activeData : data;

    // Check if we have any data at all
    const hasData = chartData.length > 0 && chartData.some(d => d.value > 0);

    if (!hasData) {
        return (
            <Paper
                component={motion.div}
                whileHover={{ y: -4, boxShadow: theme.shadows[8] }}
                transition={{ type: "spring", stiffness: 300 }}
                sx={{
                    p: 3,
                    height: '100%',
                    minHeight: '400px',
                    background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                <Typography variant="h6" fontWeight="700" gutterBottom>
                    Donation Sources (This Month)
                </Typography>
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                        No donation data available for this month yet.
                    </Typography>
                </Box>
            </Paper>
        );
    }

    return (
        <Paper
            component={motion.div}
            whileHover={{ y: -4, boxShadow: theme.shadows[8] }}
            transition={{ type: "spring", stiffness: 300 }}
            sx={{
                p: 3,
                height: '100%',
                minHeight: '400px',
                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <Typography variant="h6" fontWeight="700" gutterBottom>
                Donation Sources (This Month)
            </Typography>

            <Box sx={{ width: '100%', height: '320px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[entry.name as keyof typeof COLORS] || DEFAULT_COLOR}
                                    stroke={theme.palette.background.paper}
                                    strokeWidth={2}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number, name: string, props: any) => [
                                `$${value.toLocaleString()} (${props.payload.percentage}%)`,
                                name
                            ]}
                            contentStyle={{
                                backgroundColor: alpha(theme.palette.background.paper, 0.9),
                                backdropFilter: 'blur(10px)',
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '8px',
                                boxShadow: theme.shadows[4]
                            }}
                            itemStyle={{ color: theme.palette.text.primary }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                        />
                    </PieChart>
                </ResponsiveContainer>
            </Box>
        </Paper>
    );
};
