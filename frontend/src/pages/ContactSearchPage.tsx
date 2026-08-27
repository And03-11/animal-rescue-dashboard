import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import DatabaseRoundedIcon from "@mui/icons-material/StorageRounded";
import KeyboardCommandKeyRoundedIcon from "@mui/icons-material/KeyboardCommandKeyRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

import apiClient from "../api/axiosConfig";
import { UnifiedProfile } from "../components/UnifiedProfile";
import {
  getContactSearchErrorMessage,
  isCanceledContactRequest,
} from "../features/contact-search/apiErrors";
import type { UnifiedContactProfile } from "../features/contact-search/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SearchLoadingState = () => (
  <Stack spacing={2.5} aria-label="Loading donor profile">
    <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Skeleton variant="circular" width={56} height={56} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="36%" height={30} />
          <Skeleton width="52%" />
        </Box>
      </Stack>
    </Paper>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(13rem, 100%), 1fr))",
        gap: 2,
      }}
    >
      {[0, 1, 2, 3].map((item) => (
        <Skeleton key={item} variant="rounded" height={132} />
      ))}
    </Box>
    <Skeleton variant="rounded" height={260} />
  </Stack>
);

export const ContactSearchPage = () => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResult, setSearchResult] = useState<UnifiedContactProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = useCallback(async (rawQuery: string) => {
    const normalizedEmail = rawQuery.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Enter a complete email address to search donor records.");
      setSearchResult(null);
      inputRef.current?.focus();
      return;
    }

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    setSearchResult(null);

    try {
      const response = await apiClient.get<UnifiedContactProfile>(
        `/search/${encodeURIComponent(normalizedEmail)}`,
        { signal: controller.signal },
      );

      setSearchResult(response.data);
      setQuery(response.data.email_searched);
      setRecentSearches((current) =>
        [response.data.email_searched, ...current.filter((email) => email !== response.data.email_searched)].slice(0, 4),
      );
    } catch (searchError: unknown) {
      if (isCanceledContactRequest(searchError)) return;
      setError(getContactSearchErrorMessage(searchError, normalizedEmail));
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  const fetchSuggestions = useCallback(async (value: string, signal: AbortSignal) => {
    const normalizedQuery = value.trim();
    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsAutocompleteLoading(true);
    try {
      const response = await apiClient.get<string[]>("/contacts/autocomplete", {
        params: { q: normalizedQuery },
        signal,
      });
      setSuggestions(response.data);
    } catch (suggestionError: unknown) {
      if (!isCanceledContactRequest(suggestionError)) {
        setSuggestions([]);
      }
    } finally {
      if (!signal.aborted) setIsAutocompleteLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query, controller.signal);
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchSuggestions, query]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSearch(query);
  };

  const showWelcomeState = !isLoading && !error && !searchResult;

  return (
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 1, md: 2 } }}>
      <Stack spacing={{ xs: 2.5, md: 3.5 }}>
        <Box>
          <Typography variant="overline" color="primary.main">
            Donor intelligence
          </Typography>
          <Typography variant="h2" component="h1" sx={{ mt: 0.5 }}>
            Find the full donor story
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: "60ch" }}>
            Search one email to connect identity, giving history and communication status across your data sources.
          </Typography>
        </Box>

        <Paper
          component="section"
          aria-label="Donor search"
          elevation={1}
          sx={{
            p: { xs: 2, sm: 2.5 },
            backgroundColor: alpha(theme.palette.background.paper, 0.94),
          }}
        >
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="stretch">
              <Autocomplete
                freeSolo
                options={suggestions}
                loading={isAutocompleteLoading}
                inputValue={query}
                onInputChange={(_event, newValue) => {
                  setQuery(newValue);
                  if (error) setError(null);
                }}
                onChange={(_event, selectedValue) => {
                  if (typeof selectedValue === "string" && selectedValue) {
                    setQuery(selectedValue);
                    void performSearch(selectedValue);
                  }
                }}
                filterOptions={(options) => options}
                sx={{ flex: 1, minWidth: 0 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputRef={inputRef}
                    label="Donor email"
                    placeholder="name@example.org"
                    type="email"
                    autoComplete="off"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <>
                          {isAutocompleteLoading && <CircularProgress color="inherit" size={18} />}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={isLoading ? <CircularProgress color="inherit" size={18} /> : <ManageSearchRoundedIcon />}
                disabled={isLoading || query.trim().length === 0}
                sx={{ minWidth: { sm: 148 } }}
              >
                {isLoading ? "Searching" : "Search donor"}
              </Button>
            </Stack>
          </Box>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={1.5}
            sx={{ mt: 1.5 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 0.75 }}
            >
              <KeyboardCommandKeyRoundedIcon sx={{ fontSize: 16 }} />
              Press Ctrl K anytime to focus search
            </Typography>
            {recentSearches.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                <Typography variant="caption" color="text.secondary">Recent:</Typography>
                {recentSearches.map((email) => (
                  <Chip key={email} label={email} size="small" variant="outlined" onClick={() => void performSearch(email)} />
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        <Box aria-live="polite">
          {isLoading && <SearchLoadingState />}

          {error && !isLoading && (
            <Alert
              severity="error"
              action={
                EMAIL_PATTERN.test(query.trim()) ? (
                  <Button color="inherit" size="small" onClick={() => void performSearch(query)}>
                    Try again
                  </Button>
                ) : undefined
              }
            >
              {error}
            </Alert>
          )}

          {searchResult && !isLoading && !error && <UnifiedProfile profileData={searchResult} />}

          {showWelcomeState && (
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 3, md: 5 },
                textAlign: "center",
                backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.035 : 0.025),
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  mx: "auto",
                  mb: 2,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "18px",
                  color: "primary.main",
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                }}
              >
                <SearchRoundedIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography variant="h4" component="h2">One search, three connected views</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mx: "auto", maxWidth: "52ch" }}>
                Start with a donor email. We will surface their record, giving signals and email reachability in one workspace.
              </Typography>
              <Stack direction="row" justifyContent="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2.5 }}>
                <Chip icon={<DatabaseRoundedIcon />} label="Donor database" variant="outlined" />
                <Chip icon={<AlternateEmailRoundedIcon />} label="Mailchimp" variant="outlined" />
                <Chip icon={<SendRoundedIcon />} label="Brevo" variant="outlined" />
              </Stack>
            </Paper>
          )}
        </Box>
      </Stack>
    </Container>
  );
};

export default ContactSearchPage;
