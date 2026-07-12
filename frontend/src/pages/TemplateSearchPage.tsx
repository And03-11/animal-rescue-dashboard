// --- File: src/pages/TemplateSearchPage.tsx ---
import { useState, useCallback } from "react";
import axios from "axios";
import {
  Box, Typography, Paper, TextField, Button, CircularProgress,
  Alert, Chip, IconButton, Tooltip, InputAdornment,
  Collapse, Snackbar, Fade, Skeleton, Stack, alpha, useTheme
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
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import apiClient from "../api/axiosConfig";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { WorkspaceStatePanel } from "../components/WorkspaceStatePanel";

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

const getSearchErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ detail?: string }>(error)) {
    return "Error searching templates. Please try again.";
  }
  return error.response?.data?.detail || "Error searching templates. Please try again.";
};

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

const getSimilarityTone = (similarity: number) => {
  const pct = getSimilarityPercent(similarity);
  if (pct >= 40) return "success" as const;
  if (pct >= 25) return "primary" as const;
  return "warning" as const;
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
    } catch (err: unknown) {
      setError(getSearchErrorMessage(err));
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
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 3.5 }}>
      <WorkspacePageHeader
        eyebrow="Template library"
        title="Find the right message"
        description="Describe an animal, medical need or donor goal. Semantic search will surface the closest reusable messages."
        icon={<SearchRoundedIcon />}
      />

      <Paper id="template-search-hero" variant="outlined" sx={{ p: { xs: 2.25, sm: 3 } }}>
        <Stack spacing={1.75}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Search templates</Typography>
            <Typography variant="body2" color="text.secondary">
              Use natural language, or leave the field empty to review the complete library.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems="stretch">
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
                  backgroundColor: "background.default",
                  fontSize: "1.05rem",
                },
              }}
            />
            <Button
              id="template-search-button"
              variant="contained"
              onClick={handleSearch}
              disabled={loading}
              sx={{
                minWidth: { sm: 132 },
                minHeight: 48,
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Search"}
            </Button>
          </Stack>
        </Stack>
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
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1.25,
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
          <Box>
            <WorkspaceStatePanel
              icon={<SearchRoundedIcon />}
              title="No close matches"
              description={query.trim()
                ? "Try a broader need, species or campaign goal. Shorter descriptions often produce better matches."
                : "The template library is currently empty."}
              action={query.trim() ? (
                <Button variant="outlined" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              ) : undefined}
            />
          </Box>
        </Fade>
      )}

      {/* --- Initial State --- */}
      {!loading && !hasSearched && (
        <Fade in>
          <Box>
            <WorkspaceStatePanel
              dashed
              icon={<ArticleOutlinedIcon />}
              title="Explore the message library"
              description="Search by animal, diagnosis, urgency or donor action. You can also load every template to browse the full collection."
              action={(
                <Button variant="outlined" onClick={() => handleSearch()} startIcon={<SearchRoundedIcon />}>
                  Browse all templates
                </Button>
              )}
            />
          </Box>
        </Fade>
      )}

      {/* --- Results List --- */}
      {!loading && results.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {results.map((template) => (
            <Fade in key={template.id} timeout={200}>
              <Paper
                id={`template-result-${template.id}`}
                variant="outlined"
                sx={{
                  p: 0,
                  overflow: "hidden",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: theme.shadows[2],
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "stretch" }}>
                  {/* Similarity Score Bar */}
                  <Box
                    sx={{
                      width: 6,
                      minHeight: "100%",
                      backgroundColor: theme.palette[getSimilarityTone(template.similarity)].main,
                      flexShrink: 0,
                    }}
                  />

                  {/* Content */}
                  <Box
                    sx={{
                      flex: 1,
                      p: { xs: 2, sm: 2.5 },
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
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
                            backgroundColor: alpha(theme.palette[getSimilarityTone(template.similarity)].main, 0.12),
                            color: theme.palette[getSimilarityTone(template.similarity)].main,
                            border: "1px solid",
                            borderColor: alpha(theme.palette[getSimilarityTone(template.similarity)].main, 0.28),
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
                        flexDirection: { xs: "row", sm: "column" },
                        alignItems: "center",
                        justifyContent: { xs: "flex-end", sm: "center" },
                        gap: 0.75,
                        flexShrink: 0,
                        pl: { sm: 1 },
                        pt: { xs: 1, sm: 0 },
                        borderLeft: { sm: `1px solid ${theme.palette.divider}` },
                        borderTop: { xs: `1px solid ${theme.palette.divider}`, sm: "none" },
                        minWidth: { sm: 56 },
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
    </Box>
  );
}
