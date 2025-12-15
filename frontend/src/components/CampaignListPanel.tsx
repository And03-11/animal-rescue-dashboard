import { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Chip,
    Stack,
    InputAdornment,
    useTheme,
    alpha,
    Badge
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EventIcon from '@mui/icons-material/Event';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';

interface Campaign {
    id: number;
    title: string;
    category: string;
    start_date: string;
    end_date: string;
    sendCount: number;
    nextSend?: string;
    status: 'active' | 'completed' | 'pending';
}

interface CampaignListPanelProps {
    campaigns: Campaign[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    filters: {
        search: string;
        categories: string[];
    };
    onFilterChange: (filters: any) => void;
}

export const CampaignListPanel: React.FC<CampaignListPanelProps> = ({
    campaigns,
    selectedId,
    onSelect,
    filters,
    onFilterChange
}) => {
    const theme = useTheme();
    const [searchTerm, setSearchTerm] = useState(filters.search);

    const categories = Array.from(new Set(campaigns.map(c => c.category)));

    const filteredCampaigns = campaigns.filter(campaign => {
        // Search filter
        if (searchTerm && !campaign.title.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        // Category filter
        if (filters.categories.length > 0 && !filters.categories.includes(campaign.category)) {
            return false;
        }
        return true;
    });

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        onFilterChange({ ...filters, search: value });
    };

    const toggleCategory = (category: string) => {
        const newCategories = filters.categories.includes(category)
            ? filters.categories.filter(c => c !== category)
            : [...filters.categories, category];
        onFilterChange({ ...filters, categories: newCategories });
    };

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Big Campaigns': '#FF8F00',
            'NBC': '#D32F2F',
            'Unsubscribers': '#C2185B',
            'Tagless': '#7B1FA2',
            'Fundraising': '#303F9F',
        };
        return colors[category] || '#5D4037';
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                    theme.palette.background.paper,
                    0.95
                )} 100%)`,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                borderRadius: '16px',
                overflow: 'hidden'
            }}
        >
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                    Campaigns
                </Typography>

                {/* Search */}
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search campaigns..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                        sx: { borderRadius: '12px' }
                    }}
                    sx={{ mb: 1.5 }}
                />

                {/* Category Filters */}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {categories.map(category => (
                        <Chip
                            key={category}
                            label={category}
                            size="small"
                            onClick={() => toggleCategory(category)}
                            sx={{
                                borderRadius: '6px',
                                bgcolor: filters.categories.includes(category)
                                    ? alpha(getCategoryColor(category), 0.2)
                                    : 'transparent',
                                borderColor: getCategoryColor(category),
                                color: filters.categories.includes(category)
                                    ? getCategoryColor(category)
                                    : 'text.secondary',
                                borderWidth: filters.categories.includes(category) ? 2 : 1,
                                borderStyle: 'solid',
                                fontWeight: filters.categories.includes(category) ? 700 : 400,
                                '&:hover': {
                                    bgcolor: alpha(getCategoryColor(category), 0.1)
                                }
                            }}
                        />
                    ))}
                </Stack>
            </Box>

            {/* Campaign List */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <Stack spacing={1.5}>
                    {filteredCampaigns.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                            No campaigns found
                        </Typography>
                    ) : (
                        filteredCampaigns.map((campaign, index) => (
                            <Paper
                                key={campaign.id || `campaign-${index}`}
                                component={motion.div}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => onSelect(campaign.id)}
                                sx={{
                                    p: 2,
                                    cursor: 'pointer',
                                    borderRadius: '12px',
                                    border: `2px solid ${selectedId === campaign.id
                                        ? getCategoryColor(campaign.category)
                                        : 'transparent'
                                        }`,
                                    bgcolor: selectedId === campaign.id
                                        ? alpha(getCategoryColor(campaign.category), 0.05)
                                        : 'background.paper',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        transform: 'translateX(4px)',
                                        boxShadow: theme.shadows[4],
                                        borderColor: alpha(getCategoryColor(campaign.category), 0.3)
                                    }
                                }}
                            >
                                {/* Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, mr: 1 }}>
                                        {campaign.title}
                                    </Typography>
                                    <Chip
                                        label={typeof campaign.category === 'string' ? campaign.category : 'Uncategorized'}
                                        size="small"
                                        sx={{
                                            height: '20px',
                                            fontSize: '0.7rem',
                                            borderRadius: '6px',
                                            bgcolor: alpha(getCategoryColor(campaign.category), 0.2),
                                            color: getCategoryColor(campaign.category),
                                            fontWeight: 600
                                        }}
                                    />
                                </Box>

                                {/* Date Range */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                    <EventIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary">
                                        {dayjs(campaign.start_date).format('MMM D')} - {dayjs(campaign.end_date).format('MMM D, YYYY')}
                                    </Typography>
                                </Box>

                                {/* Stats */}
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Badge badgeContent={campaign.sendCount} color="primary">
                                        <Typography variant="caption" color="text.secondary">
                                            Sends
                                        </Typography>
                                    </Badge>
                                    {campaign.nextSend && (
                                        <Typography variant="caption" color="primary" fontWeight={600}>
                                            Next: {dayjs(campaign.nextSend).format('MMM D, h:mm A')}
                                        </Typography>
                                    )}
                                </Box>
                            </Paper>
                        ))
                    )}
                </Stack>
            </Box>
        </Paper>
    );
};
