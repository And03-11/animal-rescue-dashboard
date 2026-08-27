import { Box, Typography } from '@mui/material';
import { FunnelStats } from '../components/analytics/FunnelStats';
import { FunnelEmailInsights } from '../components/analytics/FunnelEmailInsights';
import { motion } from 'framer-motion';

const FunnelPage = () => {

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
                <Typography variant="h4" fontWeight="650" gutterBottom>New Comer Funnel</Typography>
                <Typography variant="body2" color="text.secondary">
                    Monitor the active funnel.
                </Typography>
            </Box>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <FunnelStats />
                    <FunnelEmailInsights />
                </Box>
            </motion.div>
        </Box>
    );
};

export default FunnelPage;
