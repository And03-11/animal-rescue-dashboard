import type { ReactNode } from 'react';
import { Box, useTheme, useMediaQuery } from '@mui/material';

interface SplitPanelLayoutProps {
    leftPanel: ReactNode;
    rightPanel: ReactNode;
    leftWidth?: number; // percentage, default 40
}

export const SplitPanelLayout: React.FC<SplitPanelLayoutProps> = ({
    leftPanel,
    rightPanel,
    leftWidth = 40
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    if (isMobile) {
        // Stack vertically on mobile
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
                <Box sx={{ minHeight: '300px' }}>
                    {leftPanel}
                </Box>
                <Box sx={{ flex: 1, minHeight: '400px' }}>
                    {rightPanel}
                </Box>
            </Box>
        );
    }

    // Side by side on desktop
    return (
        <Box sx={{ display: 'flex', gap: 3, height: '100%', overflow: 'hidden' }}>
            {/* Left Panel */}
            <Box
                sx={{
                    width: `${leftWidth}%`,
                    minWidth: '300px',
                    maxWidth: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {leftPanel}
            </Box>

            {/* Right Panel */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {rightPanel}
            </Box>
        </Box>
    );
};
