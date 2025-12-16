import React from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    useTheme, Chip, alpha, CircularProgress
} from '@mui/material';
import { motion } from 'framer-motion';
import Logo from '../../assets/Logo.png';

interface Donation {
    id: string;
    date: string;
    amount: number;
    donorName: string;
    donorEmail: string;
}

interface DonationsTableProps {
    donations: Donation[];
    totalCount: number;
    isLoadingMore: boolean;
    hasMore: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
    loadMoreRef: React.RefObject<HTMLDivElement | null>;
    maxHeight?: string | number;
    sx?: any;
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

export const DonationsTable: React.FC<DonationsTableProps> = ({
    donations,
    totalCount,
    isLoadingMore,
    hasMore,
    tableContainerRef,
    loadMoreRef,
    maxHeight = 600,
    sx = {}
}) => {
    const theme = useTheme();

    return (
        <motion.div variants={itemVariants} style={{ height: '100%' }}>
            <Paper
                sx={{
                    p: 4,
                    borderRadius: '24px',
                    background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.6)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    overflow: 'hidden',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    ...sx
                }}
            >


                <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                    <Box
                        component="img"
                        src={Logo}
                        alt="Animal Love"
                        sx={{
                            height: 60,
                            mb: 2,
                            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
                        }}
                    />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '1px', mb: 0.5 }}>
                            RECENT DONATIONS
                        </Typography>
                        <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
                            Live transaction feed
                        </Typography>
                    </Box>
                    <Chip
                        label={`${totalCount} Total`}
                        sx={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            background: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                            fontWeight: 700,
                            borderRadius: '12px',
                            display: { xs: 'none', sm: 'flex' } // Hide on very small screens if it overlaps
                        }}
                    />
                </Box>

                <TableContainer
                    ref={tableContainerRef}
                    sx={{
                        maxHeight: maxHeight,
                        flexGrow: 1,
                        '&::-webkit-scrollbar': { width: '8px' },
                        '&::-webkit-scrollbar-track': { background: 'transparent' },
                        '&::-webkit-scrollbar-thumb': {
                            background: alpha(theme.palette.text.secondary, 0.1),
                            borderRadius: '4px',
                            '&:hover': { background: alpha(theme.palette.text.secondary, 0.2) }
                        }
                    }}
                >
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ background: theme.palette.background.paper, fontWeight: 700, color: theme.palette.text.secondary }}>Date</TableCell>
                                <TableCell sx={{ background: theme.palette.background.paper, fontWeight: 700, color: theme.palette.text.secondary }}>Donor</TableCell>
                                <TableCell sx={{ background: theme.palette.background.paper, fontWeight: 700, color: theme.palette.text.secondary }}>Email</TableCell>
                                <TableCell align="right" sx={{ background: theme.palette.background.paper, fontWeight: 700, color: theme.palette.text.secondary }}>Amount</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {donations.map((donation) => (
                                <TableRow
                                    key={donation.id}
                                    sx={{
                                        transition: 'all 0.2s',
                                        '&:hover': { background: alpha(theme.palette.primary.main, 0.05) }
                                    }}
                                >
                                    <TableCell sx={{ color: theme.palette.text.secondary }}>
                                        {new Date(donation.date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                                        {donation.donorName}
                                    </TableCell>
                                    <TableCell sx={{ color: theme.palette.text.secondary }}>
                                        {donation.donorEmail}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, color: theme.palette.success.main }}>
                                        ${donation.amount.toFixed(2)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {hasMore && (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                                        <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                            {isLoadingMore ? (
                                                <CircularProgress size={24} thickness={4} />
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">
                                                    Scroll for more
                                                </Typography>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </motion.div>
    );
};
