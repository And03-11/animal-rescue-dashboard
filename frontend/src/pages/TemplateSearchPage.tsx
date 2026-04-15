// --- File: src/pages/TemplateSearchPage.tsx ---
import { useState, useCallback } from "react";
import {
  Box, Typography, Paper, TextField, Button, CircularProgress,
  Alert, Container, Chip, IconButton, Tooltip, InputAdornment,
  Collapse, Snackbar, Fade, Skeleton, alpha, useTheme
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopy";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import PetsRoundedIcon from "@mui/icons-material/PetsRounded";
import MedicalServicesRoundedIcon from "@mui/icons-material/MedicalServicesRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import KeyboardReturnRoundedIcon from "@mui/icons-material/KeyboardReturnRounded";
import apiClient from "../api/axiosConfig";

// --- Types ---
interface TemplateResult {
  id: number;
  title: string;
  summary: string;
  file_url: string;
  primary_problem: string | null;
  entity_scope: string | null;
  species: string | null;
  status: string | null;
  urgency: string | null;
  tone: string | null;
  donor_action: string | null;
  tags: string[];
  conditions: string[];
  similarity: number;
}

interface SearchResponse {
  success: boolean;
  count: number;
  results: TemplateResult[];
}

// --- Helpers ---
const getUrgencyColor = (urgency: string | null): "error" | "warning" | "info" | "default" => {
  switch (urgency) {
    case "high": return "error";
    case "medium": return "warning";
    case "low": return "info";
    default: return "default";
  }
};

const getStatusIcon = (status: string | null) => {
  switch (status) {
    case "critical": return <ErrorOutlineRoundedIcon fontSize="small" />;
    case "worsening": return <WarningAmberRoundedIcon fontSize="small" />;
    case "improving": return <CheckCircleOutlineRoundedIcon fontSize="small" />;
    default: return <HelpOutlineRoundedIcon fontSize="small" />;
  }
};

const getStatusColor = (status: string | null): "error" | "warning" | "success" | "default" => {
  switch (status) {
    case "critical": return "error";
    case "worsening": return "warning";
    case "improving": return "success";
    default: return "default";
  }
};

const getSimilarityPercent = (similarity: number) => Math.round(similarity * 100);

const getSimilarityGradient = (similarity: number) => {
  const pct = getSimilarityPercent(similarity);
  if (pct >= 40) return "linear-gradient(135deg, #10b981, #059669)";
  if (pct >= 30) return "linear-gradient(135deg, #6366f1, #818cf8)";
  if (pct >= 20) return "linear-gradient(135deg, #f59e0b, #d97706)";
  return "linear-gradient(135deg, #94a3b8, #64748b)";
};

// --- Component ---
export default function TemplateSearchPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<TemplateResult[]>([]);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();

    setLoading(true);
    setError("");
    setResults([]);
    setResultCount(null);
    setHasSearched(true);

    try {
      const res = await apiClient.post<SearchResponse>("/template-search", { query: trimmed });
      setResults(res.data.results);
      setResultCount(res.data.count);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || "Error searching templates. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleSearch();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setSnackbar(`${label} copied to clipboard!`);
    });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
      {/* --- Hero Search Section --- */}
      <Paper
        id="template-search-hero"
        elevation={0}
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 4,
          p: { xs: 3, md: 5 },
          mb: 4,
          background: isDark
            ? "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(236,72,153,0.10) 100%)"
            : "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(236,72,153,0.06) 100%)",
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          "&::before": {
            content: '""',
            position: "absolute",
            top: -80,
            right: -80,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 70%)`,
          },
          "&::after": {
            content: '""',
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.10)} 0%, transparent 70%)`,
          },
        }}
      >
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 800,
              mb: 1,
              background: isDark
                ? "linear-gradient(135deg, #818cf8, #f472b6)"
                : "linear-gradient(135deg, #6366f1, #ec4899)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            🔍 Smart Template Search
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 600 }}
          >
            Search across all email templates using AI. Describe what you're looking for
            and get the most relevant templates instantly.
          </Typography>

          <Box sx={{ display: "flex", gap: 1.5, alignItems: "stretch" }}>
            <TextField
              id="template-search-input"
              fullWidth
              placeholder='Try: "dogs with cancer", "urgent surgery", "cat rescue"...'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: query && (
                  <InputAdornment position="end">
                    <Chip
                      size="small"
                      icon={<KeyboardReturnRoundedIcon />}
                      label="Enter"
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 24 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: isDark ? alpha("#0f172a", 0.6) : alpha("#fff", 0.8),
                  backdropFilter: "blur(10px)",
                  fontSize: "1.05rem",
                  borderRadius: 3,
                },
              }}
            />
            <Button
              id="template-search-button"
              variant="contained"
              onClick={handleSearch}
              disabled={loading}
              sx={{
                minWidth: 130,
                borderRadius: 3,
                fontWeight: 700,
                fontSize: "0.95rem",
                textTransform: "none",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                boxShadow: "0 4px 15px rgba(99,102,241,0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  boxShadow: "0 6px 20px rgba(99,102,241,0.4)",
                  transform: "translateY(-1px)",
                },
                "&:disabled": {
                  background: isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 0.8),
                },
                transition: "all 0.2s ease",
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Search"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* --- Error Alert --- */}
      <Collapse in={!!error}>
        <Alert
          severity="error"
          onClose={() => setError("")}
          sx={{ mb: 3, borderRadius: 2 }}
        >
          {error}
        </Alert>
      </Collapse>

      {/* --- Loading Skeletons --- */}
      {loading && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Paper
              key={i}
              sx={{
                p: 3,
                borderRadius: 3,
                display: "flex",
                gap: 2,
              }}
            >
              <Skeleton variant="circular" width={48} height={48} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="40%" height={28} />
                <Skeleton width="80%" height={20} sx={{ mt: 1 }} />
                <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                  <Skeleton width={70} height={24} variant="rounded" />
                  <Skeleton width={90} height={24} variant="rounded" />
                  <Skeleton width={60} height={24} variant="rounded" />
                </Box>
              </Box>
              <Skeleton variant="rounded" width={56} height={56} />
            </Paper>
          ))}
        </Box>
      )}

      {/* --- Results Header --- */}
      {!loading && resultCount !== null && (
        <Fade in>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2.5,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {resultCount > 0
                ? `${resultCount} template${resultCount > 1 ? "s" : ""} found`
                : "No templates found"}
            </Typography>
              <Chip
                label={query.trim() ? `Query: "${query}"` : "All Templates"}
                variant="outlined"
                size="small"
                onDelete={() => {
                  setQuery("");
                  setResults([]);
                  setResultCount(null);
                  setHasSearched(false);
                }}
                sx={{ maxWidth: 300 }}
              />
          </Box>
        </Fade>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <Fade in>
          <Paper
            sx={{
              p: 6,
              textAlign: "center",
              borderRadius: 3,
            }}
          >
            <SearchRoundedIcon
              sx={{
                fontSize: 64,
                color: "text.disabled",
                mb: 2,
              }}
            />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No templates found
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {query.trim() ? "Try different keywords or a broader search term." : "There are no templates in the database yet."}
            </Typography>
          </Paper>
        </Fade>
      )}

      {/* --- Initial State --- */}
      {!loading && !hasSearched && (
        <Fade in>
          <Paper
            sx={{
              p: 6,
              textAlign: "center",
              borderRadius: 3,
              border: `2px dashed ${alpha(theme.palette.divider, 0.5)}`,
              backgroundColor: "transparent",
            }}
          >
            <Box
              sx={{
                fontSize: 56,
                mb: 2,
                filter: "grayscale(0.3)",
              }}
            >
              📧
            </Box>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Search for email templates or load them all
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ maxWidth: 460, mx: "auto" }}>
              Type a description of what you need — for example, "dogs with cancer",
              "urgent surgery funding" — or simply hit Search to load all templates from the database.
            </Typography>
            
            <Button 
              variant="outlined" 
              sx={{ mt: 3, borderRadius: 2 }}
              onClick={() => handleSearch()}
              startIcon={<SearchRoundedIcon />}
            >
              Load All Templates
            </Button>
          </Paper>
        </Fade>
      )}

      {/* --- Results List --- */}
      {!loading && results.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {results.map((template, index) => (
            <Fade in key={template.id} timeout={300 + index * 80}>
              <Paper
                id={`template-result-${template.id}`}
                sx={{
                  p: 0,
                  borderRadius: 3,
                  overflow: "hidden",
                  transition: "all 0.25s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: isDark
                      ? "0 12px 40px rgba(0,0,0,0.4)"
                      : "0 12px 40px rgba(0,0,0,0.1)",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "stretch" }}>
                  {/* Similarity Score Bar */}
                  <Box
                    sx={{
                      width: 6,
                      minHeight: "100%",
                      background: getSimilarityGradient(template.similarity),
                      flexShrink: 0,
                    }}
                  />

                  {/* Content */}
                  <Box sx={{ flex: 1, p: 2.5, display: "flex", gap: 2 }}>
                    {/* Left: Main Info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Title Row */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            fontSize: "1.05rem",
                            lineHeight: 1.3,
                          }}
                          noWrap
                        >
                          {template.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${getSimilarityPercent(template.similarity)}% match`}
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            height: 22,
                            background: getSimilarityGradient(template.similarity),
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        />
                      </Box>

                      {/* Summary */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          lineHeight: 1.5,
                        }}
                      >
                        {template.summary}
                      </Typography>

                      {/* Metadata Chips */}
                      <Box
                        sx={{
                          display: "flex",
                          gap: 0.75,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        {template.species && (
                          <Chip
                            icon={<PetsRoundedIcon />}
                            label={template.species}
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: "capitalize", height: 26 }}
                          />
                        )}
                        {template.urgency && (
                          <Chip
                            icon={<WarningAmberRoundedIcon />}
                            label={`${template.urgency} urgency`}
                            size="small"
                            color={getUrgencyColor(template.urgency)}
                            variant="filled"
                            sx={{ textTransform: "capitalize", height: 26, fontWeight: 600 }}
                          />
                        )}
                        {template.status && (
                          <Chip
                            icon={getStatusIcon(template.status)}
                            label={template.status}
                            size="small"
                            color={getStatusColor(template.status)}
                            variant="outlined"
                            sx={{ textTransform: "capitalize", height: 26 }}
                          />
                        )}
                        {template.primary_problem && (
                          <Chip
                            icon={<MedicalServicesRoundedIcon />}
                            label={template.primary_problem}
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: "capitalize", height: 26 }}
                          />
                        )}
                        {template.tone && (
                          <Chip
                            icon={<TrendingUpRoundedIcon />}
                            label={template.tone}
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: "capitalize", height: 26 }}
                          />
                        )}
                      </Box>

                      {/* Conditions */}
                      {template.conditions.length > 0 && (
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
                          {template.conditions.map((condition) => (
                            <Chip
                              key={condition}
                              label={condition}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                backgroundColor: isDark
                                  ? alpha(theme.palette.warning.main, 0.12)
                                  : alpha(theme.palette.warning.main, 0.08),
                                color: theme.palette.warning.main,
                                fontWeight: 500,
                              }}
                            />
                          ))}
                        </Box>
                      )}

                      {/* Tags */}
                      {template.tags.length > 0 && (
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1, alignItems: "center" }}>
                          <LocalOfferRoundedIcon
                            sx={{ fontSize: 14, color: "text.disabled", mr: 0.25 }}
                          />
                          {template.tags.slice(0, 4).map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: "0.65rem",
                                backgroundColor: isDark
                                  ? alpha(theme.palette.primary.main, 0.10)
                                  : alpha(theme.palette.primary.main, 0.06),
                                color: theme.palette.primary.main,
                              }}
                            />
                          ))}
                          {template.tags.length > 4 && (
                            <Typography variant="caption" color="text.disabled">
                              +{template.tags.length - 4} more
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>

                    {/* Right: Actions */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0.75,
                        flexShrink: 0,
                        pl: 1,
                        borderLeft: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                        minWidth: 56,
                      }}
                    >
                      <Tooltip title="Open in Google Docs" arrow>
                        <IconButton
                          id={`open-template-${template.id}`}
                          component="a"
                          href={template.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            color: theme.palette.primary.main,
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            "&:hover": {
                              backgroundColor: alpha(theme.palette.primary.main, 0.18),
                              transform: "scale(1.1)",
                            },
                            transition: "all 0.2s ease",
                          }}
                        >
                          <OpenInNewRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copy link" arrow>
                        <IconButton
                          id={`copy-link-${template.id}`}
                          size="small"
                          onClick={() =>
                            copyToClipboard(template.file_url, "Link")
                          }
                          sx={{
                            color: "text.secondary",
                            "&:hover": {
                              backgroundColor: alpha(theme.palette.action.hover, 0.8),
                              transform: "scale(1.1)",
                            },
                            transition: "all 0.2s ease",
                          }}
                        >
                          <ContentCopyRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              </Paper>
            </Fade>
          ))}
        </Box>
      )}

      {/* --- Snackbar --- */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity="success"
          sx={{ width: "100%", borderRadius: 2 }}
        >
          {snackbar}
        </Alert>
      </Snackbar>
    </Container>
  );
}
