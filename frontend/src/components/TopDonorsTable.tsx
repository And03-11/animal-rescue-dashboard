import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Tooltip,
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
  const getMedalColor = (rank: number) => {
    if (rank === 0) return '#FFD700'; // Oro
    if (rank === 1) return '#C0C0C0'; // Plata
    if (rank === 2) return '#CD7F32'; // Bronce
    return 'inherit';
  };
    
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="top donors table">
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={{ width: '10%' }}>Rank</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Total Donated</TableCell>
            <TableCell align="center"># Donations</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {donors.map((donor, index) => (
            <TableRow key={donor.email} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
              <TableCell align="center">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography fontWeight="bold">{index + 1}</Typography>
                  {index < 3 && (
                    <Tooltip title={`Top ${index + 1} Donor`}>
                        <WorkspacePremiumIcon sx={{ color: getMedalColor(index), ml: 0.5, fontSize: '1.2rem' }} />
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="body1" fontWeight="500">{donor.name}</Typography>
                <Typography variant="body2" color="text.secondary">{donor.email}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body1" fontWeight="bold" color="primary">
                  {formatAmount(donor.totalAmount)}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="body1">{donor.donationsCount}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};