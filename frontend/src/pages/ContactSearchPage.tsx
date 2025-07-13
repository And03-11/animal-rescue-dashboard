import { useState, useEffect, useCallback } from 'react';
import { Box, TextField, Typography, CircularProgress, Alert, Container } from '@mui/material';
import apiClient from '../api/axiosConfig';
import { UnifiedProfile } from '../components/UnifiedProfile';

export const ContactSearchPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<any | null>(null);

  // No necesitamos 'hasSearched' porque podemos deducir el estado
  // a partir de 'isLoading', 'error' y 'searchResult'.

  const performSearch = useCallback(async (searchQuery: string, signal: AbortSignal) => {
    // Si la búsqueda está vacía, reseteamos todo.
    if (!searchQuery.trim() || !searchQuery.includes('@')) {
      setSearchResult(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    // ✅ CORRECCIÓN CLAVE: Reseteamos ambos estados al iniciar una búsqueda.
    setError(null);
    setSearchResult(null);

    try {
      const response = await apiClient.get(`/search/${searchQuery}`, { signal });
      // ✅ CORRECCIÓN CLAVE: Al tener éxito, nos aseguramos de que el error esté limpio.
      setSearchResult(response.data);
      setError(null);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Search aborted');
        return;
      }
      
      // ✅ CORRECCIÓN CLAVE: Al fallar, nos aseguramos de que el resultado esté limpio.
      setSearchResult(null);
      if (err.response && err.response.status === 404) {
        setError(`No contact found with email: ${searchQuery}`);
      } else {
        setError('An unexpected error occurred while connecting to the server.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ CORRECCIÓN: Implementamos la lógica de limpieza para evitar 'race conditions'.
  useEffect(() => {
    const controller = new AbortController();

    const timerId = setTimeout(() => {
      performSearch(email, controller.signal);
    }, 500);

    // Esta función de limpieza se ejecuta cada vez que el 'email' cambia,
    // o cuando el componente se desmonta.
    return () => {
      clearTimeout(timerId); // Cancela el temporizador si el usuario sigue escribiendo.
      controller.abort(); // Cancela la petición de red si ya se ha disparado.
    };
  }, [email, performSearch]);
  
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Unified Donor Search
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <TextField
          fullWidth
          label="Search by Email"
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
      </Box>

      {isLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />}
      {error && !isLoading && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
      {searchResult && !isLoading && !error && (
        <Box sx={{ mt: 4 }}>
          <UnifiedProfile profileData={searchResult} />
        </Box>
      )}
    </Container>
  );
};

export default ContactSearchPage;