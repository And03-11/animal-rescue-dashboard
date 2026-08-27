import React, { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { alpha, useTheme } from '@mui/material/styles';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import apiClient from '../api/axiosConfig';

export interface ApiListItem {
  id: string;
  name: string;
  createdTime?: string;
}

export const VIEW_ALL_CAMPAIGNS = 'VIEW_ALL_CAMPAIGNS';

export type CampaignSelection = ApiListItem | typeof VIEW_ALL_CAMPAIGNS | null;

interface CampaignSelectorProps {
  slotId: number;
  sources: ApiListItem[];
  onSelectionChange: (slotId: number, source: string | null, campaign: CampaignSelection) => void;
  selectedSource: string | null;
  selectedCampaign: CampaignSelection;
  roleLabel: string;
  roleDescription: string;
  accentColor: string;
}

export const CampaignSelectorSlot: React.FC<CampaignSelectorProps> = ({
  slotId,
  sources,
  onSelectionChange,
  selectedSource,
  selectedCampaign,
  roleLabel,
  roleDescription,
  accentColor,
}) => {
  const theme = useTheme();
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const isReady = Boolean(selectedSource && selectedCampaign);

  useEffect(() => {
    if (!selectedSource) {
      setCampaigns([]);
      return;
    }

    let isMounted = true;
    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      try {
        const response = await apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`);
        if (isMounted) {
          const sortedCampaigns = [...response.data].sort((a, b) => {
            if (!a.createdTime && !b.createdTime) return 0;
            if (!a.createdTime) return 1;
            if (!b.createdTime) return -1;
            return new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime();
          });
          setCampaigns(sortedCampaigns);
        }
      } catch (error) {
        console.error(`Error loading campaigns for source ${selectedSource}:`, error);
        if (isMounted) setCampaigns([]);
      } finally {
        if (isMounted) setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
    return () => { isMounted = false; };
  }, [selectedSource]);

  const handleSourceChange = (event: SelectChangeEvent<string>) => {
    const newSource = event.target.value || null;
    onSelectionChange(slotId, newSource, null);
  };

  const handleCampaignChange = (event: SelectChangeEvent<string>) => {
    const campaignId = event.target.value;
    if (campaignId === VIEW_ALL_CAMPAIGNS) {
      onSelectionChange(slotId, selectedSource, VIEW_ALL_CAMPAIGNS);
      return;
    }

    onSelectionChange(
      slotId,
      selectedSource,
      campaigns.find(campaign => campaign.id === campaignId) || null,
    );
  };

  const getCampaignValue = () => {
    if (typeof selectedCampaign === 'string') return selectedCampaign;
    return selectedCampaign?.id || '';
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.25,
        height: '100%',
        minWidth: 0,
        borderRadius: 3,
        bgcolor: isReady ? alpha(accentColor, 0.055) : alpha(theme.palette.background.paper, 0.58),
        borderColor: isReady ? alpha(accentColor, 0.45) : alpha(theme.palette.divider, 0.72),
        transition: theme.transitions.create(['border-color', 'background-color'], {
          duration: theme.transitions.duration.shorter,
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, mb: 2 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 32,
            height: 32,
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1.5,
            color: isReady ? theme.palette.getContrastText(accentColor) : accentColor,
            bgcolor: isReady ? accentColor : alpha(accentColor, 0.12),
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {isReady ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : String(slotId).padStart(2, '0')}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750, lineHeight: 1.3 }}>
            {roleLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {isReady ? 'Ready to compare' : roleDescription}
          </Typography>
        </Box>

        {(selectedSource || selectedCampaign) && (
          <Tooltip title={`Clear ${roleLabel.toLowerCase()}`}>
            <IconButton
              size="small"
              aria-label={`Clear ${roleLabel.toLowerCase()}`}
              onClick={() => onSelectionChange(slotId, null, null)}
              sx={{ mt: -0.5, mr: -0.75 }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <FormControl fullWidth size="small">
          <InputLabel id={`source-label-${slotId}`}>Source</InputLabel>
          <Select
            labelId={`source-label-${slotId}`}
            value={selectedSource || ''}
            label="Source"
            onChange={handleSourceChange}
            MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
          >
            <MenuItem value=""><em>Select a source</em></MenuItem>
            {sources.map(source => (
              <MenuItem key={source.id} value={source.name}>{source.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small" disabled={!selectedSource || loadingCampaigns}>
          <InputLabel id={`campaign-label-${slotId}`}>Campaign</InputLabel>
          <Select
            labelId={`campaign-label-${slotId}`}
            value={getCampaignValue()}
            label="Campaign"
            onChange={handleCampaignChange}
            MenuProps={{ PaperProps: { sx: { maxHeight: 420 } } }}
          >
            {loadingCampaigns ? (
              <MenuItem value="" disabled>
                <CircularProgress size={18} sx={{ mr: 1.25 }} /> Loading campaigns…
              </MenuItem>
            ) : [
              <MenuItem key="all" value={VIEW_ALL_CAMPAIGNS}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>All campaigns</Typography>
                  <Typography variant="caption" color="text.secondary">Source total</Typography>
                </Box>
              </MenuItem>,
              ...campaigns.map(campaign => (
                <MenuItem key={campaign.id} value={campaign.id}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{campaign.name}</Typography>
                    {campaign.createdTime && (
                      <Typography variant="caption" color="text.secondary">
                        Created {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(campaign.createdTime))}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              )),
            ]}
          </Select>
        </FormControl>
      </Box>
    </Paper>
  );
};
