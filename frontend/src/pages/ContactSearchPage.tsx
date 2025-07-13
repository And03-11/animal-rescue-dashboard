// --- Archivo: frontend/src/pages/ContactSearchPage.tsx (Versión Final) ---
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Container,
  Autocomplete, // ✅ CAMBIO 1: Importamos el componente Autocomplete
} from '@mui/material';
import apiClient from '../api/axiosConfig';
import { UnifiedProfile } from '../components/UnifiedProfile';

export const ContactSearchPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<any | null>(null);

  // ✅ CAMBIO 2: Nuevos estados para manejar las sugerencias y su carga.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);

  // La lógica para buscar el perfil completo se mantiene igual.
  const performSearch = useCallback(async (searchQuery: string, signal: AbortSignal) => {
    if (!searchQuery.trim() || !searchQuery.includes('@')) {
      setSearchResult(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSearchResult(null);

    try {
      const response = await apiClient.get(`/search/${searchQuery}`, { signal });
      setSearchResult(response.data);
      setError(null);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setSearchResult(null);
      if (err.response && err.response.status === 404) {
        setError(`No contact found with email: ${searchQuery}`);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ CAMBIO 3: Nueva función para buscar las sugerencias desde el nuevo endpoint.
  const fetchSuggestions = useCallback(async (query: string, signal: AbortSignal) => {
    if (query.length < 2) { // No buscar para textos muy cortos
      setSuggestions([]);
      return;
    }
    setIsAutocompleteLoading(true);
    try {
      const response = await apiClient.get(`/contacts/autocomplete?q=${query}`, { signal });
      setSuggestions(response.data);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setSuggestions([]);
    } finally {
      setIsAutocompleteLoading(false);
    }
  }, []);

  // useEffect para la búsqueda principal (sin cambios).
  useEffect(() => {
    const controller = new AbortController();
    const timerId = setTimeout(() => {
      performSearch(email, controller.signal);
    }, 500);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [email, performSearch]);

  // ✅ CAMBIO 4: Nuevo useEffect para las sugerencias, con su propio debounce.
  useEffect(() => {
    const controller = new AbortController();
    const timerId = setTimeout(() => {
      fetchSuggestions(email, controller.signal);
    }, 300); // Un debounce más corto para que las sugerencias se sientan más rápidas.
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [email, fetchSuggestions]);
  
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Unified Donor Search
      </Typography>
      
      {/* ✅ CAMBIO 5: Reemplazamos TextField por el componente Autocomplete */}
      <Autocomplete
        freeSolo // Permite escribir texto que no esté en las sugerencias.
        options={suggestions}
        loading={isAutocompleteLoading}
        inputValue={email}
        onInputChange={(_event, newInputValue) => {
          setEmail(newInputValue);
        }}
        // Para que no filtre las opciones localmente, ya que el backend lo hace.
        filterOptions={(x) => x} 
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search by Email"
            variant="outlined"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {isAutocompleteLoading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />

      {/* La lógica para mostrar resultados/errores no cambia */}
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