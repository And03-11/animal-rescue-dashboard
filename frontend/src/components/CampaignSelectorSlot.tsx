// frontend/src/components/CampaignSelectorSlot.tsx

import React, { useState, useEffect } from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Box,
  Typography, Paper
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import apiClient from '../api/axiosConfig';

// --- Interfaces and Constants ---
export interface ApiListItem {
  id: string;
  name: string;
  createdTime?: string;
}

export const VIEW_ALL_CAMPAIGNS = 'VIEW_ALL_CAMPAIGNS';

// This type represents the possible selections: a full campaign object, the "ALL" string, or null
export type CampaignSelection = ApiListItem | typeof VIEW_ALL_CAMPAIGNS | null;

interface CampaignSelectorProps {
  slotId: number;
  sources: ApiListItem[];
  onSelectionChange: (slotId: number, source: string | null, campaign: CampaignSelection) => void;
  selectedSource: string | null;
  selectedCampaign: CampaignSelection;
}

export const CampaignSelectorSlot: React.FC<CampaignSelectorProps> = ({
  slotId,
  sources,
  onSelectionChange,
  selectedSource,
  selectedCampaign,
}) => {
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

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
          const sortedCampaigns = response.data.sort((a, b) => {
            if (!a.createdTime || !b.createdTime) return 0;
            return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
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
    } else {
      const campaignObject = campaigns.find(c => c.id === campaignId) || null;
      onSelectionChange(slotId, selectedSource, campaignObject);
    }
  };

  const getCampaignValue = () => {
    if (typeof selectedCampaign === 'string') return selectedCampaign;
    if (selectedCampaign?.id) return selectedCampaign.id;
    return '';
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Comparison Slot {slotId}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Source</InputLabel>
          <Select
            value={selectedSource || ''}
            label="Source"
            onChange={handleSourceChange}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            {sources.map(source => (
              <MenuItem key={source.id} value={source.name}>{source.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth disabled={!selectedSource || loadingCampaigns}>
          <InputLabel>Campaign</InputLabel>
          <Select
            value={getCampaignValue()}
            label="Campaign"
            onChange={handleCampaignChange}
          >
            {loadingCampaigns ? (
              <MenuItem value="" disabled><CircularProgress size={24} sx={{ mx: 'auto' }} /></MenuItem>
            ) : (
              [
                <MenuItem key="all" value={VIEW_ALL_CAMPAIGNS}>
                  <em>-- All Campaigns in this Source --</em>
                </MenuItem>,
                ...campaigns.map(campaign => (
                  <MenuItem key={campaign.id} value={campaign.id}>{campaign.name}</MenuItem>
                ))
              ]
            )}
          </Select>
        </FormControl>
      </Box>
    </Paper>
  );
};