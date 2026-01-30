import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { FunnelStats } from '../components/analytics/FunnelStats';
import { motion } from 'framer-motion';

const FunnelPage = () => {
    const theme = useTheme();

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="700" gutterBottom>
                    New Comer Funnel
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Overview of donor conversion stages and pending approvals.
                </Typography>
            </Box>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <FunnelStats />
            </motion.div>
        </Box>
    );
};

export default FunnelPage;
