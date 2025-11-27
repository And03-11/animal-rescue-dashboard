import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  Tooltip,
  Avatar,
  useTheme,
  alpha
} from '@mui/material';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

// Definimos la estructura de un donador
export interface Donor {
  email: string;
  name: string;
  totalAmount: number;
  donationsCount: number;
}

interface TopDonorsTableProps {
  donors: Donor[];
}

// Función para formatear números grandes a 'K' (miles)
const formatAmount = (amount: number) => {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(2)}`;
}

export const TopDonorsTable: React.FC<TopDonorsTableProps> = ({ donors }) => {
  const theme = useTheme();

  const getMedalColor = (rank: number) => {
    if (rank === 0) return '#FFD700'; // Oro
    if (rank === 1) return '#C0C0C0'; // Plata
    if (rank === 2) return '#CD7F32'; // Bronce
    return 'inherit';
  };

  return (
    <TableContainer sx={{ maxHeight: 440 }}>
      <Table stickyHeader aria-label="top donors table">
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={{ width: '10%', bgcolor: alpha(theme.palette.background.paper, 0.8) }}>Rank</TableCell>
            <TableCell sx={{ bgcolor: alpha(theme.palette.background.paper, 0.8) }}>Name</TableCell>
            <TableCell sx={{ bgcolor: alpha(theme.palette.background.paper, 0.8) }}>Total Donated</TableCell>
            <TableCell align="center" sx={{ bgcolor: alpha(theme.palette.background.paper, 0.8) }}># Donations</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {donors.map((donor, index) => (
            <TableRow
              key={donor.email}
              sx={{
                '&:last-child td, &:last-child th': { border: 0 },
                transition: 'background-color 0.2s',
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.04),
                }
              }}
            >
              <TableCell align="center">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {index < 3 ? (
                    <Tooltip title={`Top ${index + 1} Donor`}>
                      <WorkspacePremiumIcon sx={{ color: getMedalColor(index), fontSize: '1.5rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
                    </Tooltip>
                  ) : (
                    <Typography fontWeight="bold" color="text.secondary">{index + 1}</Typography>
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{ bgcolor: theme.palette.primary.main, width: 32, height: 32, fontSize: '0.875rem' }}>
                    {donor.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight="600">{donor.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{donor.email}</Typography>
                  </Box>
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight="700" color="success.main">
                  {formatAmount(donor.totalAmount)}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="body2" sx={{ px: 1, py: 0.5, bgcolor: alpha(theme.palette.secondary.main, 0.1), borderRadius: '12px', display: 'inline-block', minWidth: '30px' }}>
                  {donor.donationsCount}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};