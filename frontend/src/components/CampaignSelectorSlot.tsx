// frontend/src/components/CampaignSelectorSlot.tsx (Versión Corregida y Mejorada)
import React, { useState, useEffect } from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Box,
  Typography, Paper
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import apiClient from '../api/axiosConfig';

// Interfaces para un tipado fuerte y claro
interface ApiListItem {
  id: string;
  name: string;
  createdTime?: string; // Se añade la fecha de creación opcional
}

interface CampaignSelectorProps {
  slotId: number;
  sources: ApiListItem[];
  onCampaignChange: (slotId: number, campaign: ApiListItem | null) => void;
  selectedCampaignId: string | null;
}

export const CampaignSelectorSlot: React.FC<CampaignSelectorProps> = ({
  slotId,
  sources,
  onCampaignChange,
  selectedCampaignId,
}) => {
  const [selectedSource, setSelectedSource] = useState('');
  const [campaigns, setCampaigns] = useState<ApiListItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Efecto para cargar las campañas correspondientes cuando se selecciona una "Source"
  useEffect(() => {
    if (!selectedSource) {
      setCampaigns([]);
      if (selectedCampaignId) {
        onCampaignChange(slotId, null);
      }
      return;
    }

    let isMounted = true;
    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      try {
        const response = await apiClient.get<ApiListItem[]>(`/campaigns?source=${selectedSource}`);
        if (isMounted) {
          // ✅ ¡NUEVA LÓGICA DE ORDENAMIENTO!
          // Ordena las campañas por fecha de creación ascendente (más antiguas primero).
          const sortedCampaigns = response.data.sort((a, b) => {
            if (!a.createdTime || !b.createdTime) return 0;
            return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
          });
          setCampaigns(sortedCampaigns);
        }
      } catch (error) {
        console.error(`Error al cargar campañas para la fuente ${selectedSource}:`, error);
        if (isMounted) setCampaigns([]);
      } finally {
        if (isMounted) setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();

    return () => { isMounted = false; };
  }, [selectedSource, slotId, onCampaignChange, selectedCampaignId]);


  // Manejador para el cambio de Source
  const handleSourceChange = (event: SelectChangeEvent<string>) => {
    const newSource = event.target.value;
    setSelectedSource(newSource);
    onCampaignChange(slotId, null); // Reseteamos la campaña al cambiar la fuente
  };

  // Manejador para el cambio de Campaign
  const handleCampaignChange = (event: SelectChangeEvent<string>) => {
    const campaignId = event.target.value;
    const campaign = campaigns.find(c => c.id === campaignId) || null;
    onCampaignChange(slotId, campaign);
  };
  
  const sourceLabelId = `source-label-${slotId}`;
  const campaignLabelId = `campaign-label-${slotId}`;

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Selector {slotId}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
        {/* Selector de Source */}
        <FormControl fullWidth>
          <InputLabel id={sourceLabelId}>Source</InputLabel>
          <Select
            labelId={sourceLabelId}
            value={selectedSource}
            label="Source"
            onChange={handleSourceChange}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {sources.map(source => (
              <MenuItem key={source.id} value={source.name}>
                {source.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Selector de Campaign */}
        <FormControl fullWidth disabled={!selectedSource || loadingCampaigns}>
          <InputLabel id={campaignLabelId}>Campaign</InputLabel>
          <Select
            labelId={campaignLabelId}
            value={selectedCampaignId || ''}
            label="Campaign"
            onChange={handleCampaignChange}
          >
            {loadingCampaigns ? (
              <MenuItem value="" disabled>
                <CircularProgress size={24} sx={{ mx: 'auto', display: 'block' }} />
              </MenuItem>
            ) : (
              campaigns.map(campaign => (
                <MenuItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
      </Box>
    </Paper>
  );
};