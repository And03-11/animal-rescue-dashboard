import { Box, Typography } from '@mui/material';
import { FunnelStats } from '../components/analytics/FunnelStats';
import { FunnelEmailInsights } from '../components/analytics/FunnelEmailInsights';
import { motion } from 'framer-motion';

const FunnelPage = () => {

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.08 }}
            >
                <FunnelEmailInsights />
            </motion.div>
        </Box>
    );
};

export default FunnelPage;
