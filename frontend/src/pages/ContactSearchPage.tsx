// src/pages/ContactSearchPage.tsx
import React, { useState } from 'react';
import { Box, Button, Container, TextField, Typography, CircularProgress, Alert } from '@mui/material';
import apiClient from '../api/apiClient';
// Importamos nuestro nuevo y único componente de perfil
import { UnifiedProfile } from '../components/UnifiedProfile';

export const ContactSearchPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<any | null>(null);

  const handleSearch = async () => {
    if (!email) { setError('Please enter an email.'); return; }
    setIsLoading(true);
    setError(null);
    setSearchResult(null);
    try {
      const response = await apiClient.get(`/contacts/search/${email}`);
      setSearchResult(response.data);
    } catch (err: any) {
      if (err.response && err.response.status === 404) {
        setError(`No contact found with email: ${email}`);
      } else {
        setError('An unexpected error occurred while connecting to the server.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Unified Donor Search
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <TextField fullWidth label="Search by Email" variant="outlined" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        <Button variant="contained" color="primary" onClick={handleSearch} disabled={isLoading} sx={{ ml: 2, height: '56px' }}>
          {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Search'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
      
      {/* Usamos nuestro nuevo componente unificado para mostrar los resultados */}
      {searchResult && (
        <Box sx={{ mt: 4 }}>
          <UnifiedProfile profileData={searchResult} />
        </Box>
      )}
    </Container>
  );
};