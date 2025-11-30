import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Paper, useTheme, alpha } from '@mui/material';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import UserManagementTab from './UserManagementTab';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ py: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

function a11yProps(index: number) {
    return {
        id: `settings-tab-${index}`,
        'aria-controls': `settings-tabpanel-${index}`,
    };
}

const SettingsPage: React.FC = () => {
    const theme = useTheme();
    const [value, setValue] = useState(0);

    const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
        setValue(newValue);
    };

    return (
        <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                <SettingsRoundedIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />
                <Typography
                    variant="h4"
                    component="h1"
                    sx={{
                        fontWeight: 700,
                        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                    }}
                >
                    Settings
                </Typography>
            </Box>

            <Paper
                sx={{
                    width: '100%',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: alpha(theme.palette.background.paper, 0.8),
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    boxShadow: theme.shadows[4]
                }}
            >
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 2 }}>
                    <Tabs
                        value={value}
                        onChange={handleChange}
                        aria-label="settings tabs"
                        textColor="primary"
                        indicatorColor="primary"
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '1rem',
                                minHeight: 48,
                                px: 3
                            }
                        }}
                    >
                        <Tab
                            icon={<AdminPanelSettingsRoundedIcon />}
                            iconPosition="start"
                            label="Team Management"
                            {...a11yProps(0)}
                        />
                        {/* Future tabs can go here */}
                    </Tabs>
                </Box>

                <Box sx={{ p: 3 }}>
                    <CustomTabPanel value={value} index={0}>
                        <UserManagementTab />
                    </CustomTabPanel>
                </Box>
            </Paper>
        </Box>
    );
};

export default SettingsPage;
