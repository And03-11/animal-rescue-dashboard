import { useState } from 'react';
import {
    Box,
    Paper,
    TextField,
    Typography,
    Chip,
    Divider,
    IconButton,
    Collapse,
    Button,
    useTheme,
    alpha,
    Stack
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface FilterState {
    search: string;
    categories: string[];
    platforms: string[];
    statuses: string[];
}

interface SchedulerFiltersProps {
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    availableCategories: string[];
    availablePlatforms: string[];
}

const STATUSES = ['Pending', 'Sent'];

export const SchedulerFilters: React.FC<SchedulerFiltersProps> = ({
    filters,
    onFilterChange,
    availableCategories,
    availablePlatforms
}) => {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(true);

    const handleSearchChange = (value: string) => {
        onFilterChange({ ...filters, search: value });
    };

    const toggleCategory = (category: string) => {
        const newCategories = filters.categories.includes(category)
            ? filters.categories.filter(c => c !== category)
            : [...filters.categories, category];
        onFilterChange({ ...filters, categories: newCategories });
    };

    const togglePlatform = (platform: string) => {
        const newPlatforms = filters.platforms.includes(platform)
            ? filters.platforms.filter(p => p !== platform)
            : [...filters.platforms, platform];
        onFilterChange({ ...filters, platforms: newPlatforms });
    };

    const toggleStatus = (status: string) => {
        const newStatuses = filters.statuses.includes(status)
            ? filters.statuses.filter(s => s !== status)
            : [...filters.statuses, status];
        onFilterChange({ ...filters, statuses: newStatuses });
    };

    const clearAllFilters = () => {
        onFilterChange({
            search: '',
            categories: [],
            platforms: [],
            statuses: []
        });
    };

    const hasActiveFilters =
        filters.search ||
        filters.categories.length > 0 ||
        filters.platforms.length > 0 ||
        filters.statuses.length > 0;

    return (
        <Paper
            component={motion.div}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            sx={{
                p: 2,
                height: 'fit-content',
                background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(
                    theme.palette.background.paper,
                    0.9
                )} 100%)`,
                backdropFilter: 'blur(10px)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
            }}
        >
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FilterListIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>
                        Filters
                    </Typography>
                </Box>
                <IconButton size="small" onClick={() => setExpanded(!expanded)}>
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
            </Box>

            <Collapse in={expanded}>
                <Stack spacing={2.5}>
                    {/* Search */}
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search campaigns..."
                        value={filters.search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        InputProps={{
                            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
                    />

                    <Divider />

                    {/* Categories */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary' }}>
                            CATEGORIES
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {availableCategories.map((category) => (
                                <Chip
                                    key={category}
                                    label={category}
                                    size="small"
                                    onClick={() => toggleCategory(category)}
                                    color={filters.categories.includes(category) ? 'primary' : 'default'}
                                    variant={filters.categories.includes(category) ? 'filled' : 'outlined'}
                                    sx={{
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        transition: 'all 0.2s ease'
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>

                    {/* Platforms */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary' }}>
                            PLATFORMS
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {availablePlatforms.map((platform) => (
                                <Chip
                                    key={platform}
                                    label={platform}
                                    size="small"
                                    onClick={() => togglePlatform(platform)}
                                    color={filters.platforms.includes(platform) ? 'secondary' : 'default'}
                                    variant={filters.platforms.includes(platform) ? 'filled' : 'outlined'}
                                    sx={{
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        transition: 'all 0.2s ease'
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>

                    {/* Status */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary' }}>
                            STATUS
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {STATUSES.map((status) => (
                                <Chip
                                    key={status}
                                    label={status}
                                    size="small"
                                    onClick={() => toggleStatus(status)}
                                    color={filters.statuses.includes(status) ? 'success' : 'default'}
                                    variant={filters.statuses.includes(status) ? 'filled' : 'outlined'}
                                    sx={{
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        transition: 'all 0.2s ease'
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>

                    {/* Clear All */}
                    <AnimatePresence>
                        {hasActiveFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    size="small"
                                    startIcon={<ClearIcon />}
                                    onClick={clearAllFilters}
                                    sx={{
                                        borderRadius: '12px',
                                        textTransform: 'none',
                                        fontWeight: 600
                                    }}
                                >
                                    Clear All Filters
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Stack>
            </Collapse>
        </Paper>
    );
};
