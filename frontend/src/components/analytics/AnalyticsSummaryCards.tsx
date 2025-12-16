import React from 'react';
import {
    Typography, useTheme, Card, CardContent, Grid, alpha
} from '@mui/material';
import { motion } from 'framer-motion';

interface AnalyticsSummaryCardsProps {
    totalAmount: number;
    totalCount: number;
    chartDataLength: number;
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

export const AnalyticsSummaryCards: React.FC<AnalyticsSummaryCardsProps> = ({
    totalAmount,
    totalCount,
    chartDataLength
}) => {
    const theme = useTheme();

    return (
        <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
                <motion.div variants={itemVariants}>
                    <Card
                        sx={{
                            background: alpha(theme.palette.background.paper, 0.6),
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            boxShadow: 'none',
                            borderRadius: '16px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.shadows[2],
                                borderColor: alpha(theme.palette.primary.main, 0.2)
                            }
                        }}
                    >
                        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Total Raised
                            </Typography>
                            <Typography variant="h4" sx={{ color: theme.palette.text.primary, fontWeight: 800, mt: 1 }}>
                                ${totalAmount.toFixed(2)}
                            </Typography>
                        </CardContent>
                    </Card>
                </motion.div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
                <motion.div variants={itemVariants}>
                    <Card
                        sx={{
                            background: alpha(theme.palette.background.paper, 0.6),
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            boxShadow: 'none',
                            borderRadius: '16px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.shadows[2],
                                borderColor: alpha(theme.palette.primary.main, 0.2)
                            }
                        }}
                    >
                        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Donations
                            </Typography>
                            <Typography variant="h4" sx={{ color: theme.palette.text.primary, fontWeight: 800, mt: 1 }}>
                                {totalCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </motion.div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
                <motion.div variants={itemVariants}>
                    <Card
                        sx={{
                            background: alpha(theme.palette.background.paper, 0.6),
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            boxShadow: 'none',
                            borderRadius: '16px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.shadows[2],
                                borderColor: alpha(theme.palette.primary.main, 0.2)
                            }
                        }}
                    >
                        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Avg. Donation
                            </Typography>
                            <Typography variant="h4" sx={{ color: theme.palette.text.primary, fontWeight: 800, mt: 1 }}>
                                ${totalCount > 0 ? (totalAmount / totalCount).toFixed(2) : '0.00'}
                            </Typography>
                        </CardContent>
                    </Card>
                </motion.div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
                <motion.div variants={itemVariants}>
                    <Card
                        sx={{
                            background: alpha(theme.palette.background.paper, 0.6),
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            boxShadow: 'none',
                            borderRadius: '16px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.shadows[2],
                                borderColor: alpha(theme.palette.primary.main, 0.2)
                            }
                        }}
                    >
                        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Items
                            </Typography>
                            <Typography variant="h4" sx={{ color: theme.palette.text.primary, fontWeight: 800, mt: 1 }}>
                                {chartDataLength}
                            </Typography>
                        </CardContent>
                    </Card>
                </motion.div>
            </Grid>
        </Grid>
    );
};
