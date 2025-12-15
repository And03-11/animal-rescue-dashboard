import { useState, useCallback, useEffect } from 'react';
import { Box, CircularProgress, Alert, useTheme, alpha, Button } from '@mui/material';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import apiClient from '../api/axiosConfig';

// Import shared types
import type { Campaign, CampaignEmail, ScheduledSend, FilterState } from '../types/scheduler.types';

// Import new components
import { SplitPanelLayout } from '../components/SplitPanelLayout';
import { CampaignListPanel } from '../components/CampaignListPanel';
import { CampaignDetailsPanel } from '../components/CampaignDetailsPanel';
import { CampaignModal } from '../components/CampaignModal';
import { SendWizardModal } from '../components/SendWizardModal';

// Main Component
export const CampaignSchedulerPage = () => {
  const theme = useTheme();

  // State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    categories: []
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSendWizardOpen, setIsSendWizardOpen] = useState(false);

  // Get selected campaign
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || null;

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch campaigns
      const campaignsRes = await apiClient.get('/scheduler/events', {
        params: {
          start: dayjs().subtract(6, 'month').toISOString(),
          end: dayjs().add(6, 'month').toISOString()
        }
      });

      // Process events into campaigns
      const events = campaignsRes.data;
      const campaignMap = new Map<number, Campaign>();

      // First pass: create campaigns
      events.forEach((event: any) => {
        if (event.extendedProps.type === 'campaign') {
          const campaignId = event.extendedProps.campaign_id;
          campaignMap.set(campaignId, {
            id: campaignId,
            title: event.extendedProps.title || event.title,
            category: event.extendedProps.category || 'Other',
            start_date: event.start,
            end_date: event.end || event.start,
            notes: event.extendedProps.notes,
            segmentation_mode: event.extendedProps.segmentation_mode,
            sendCount: 0,
            status: 'active',
            sends: []
          });
        }
      });

      // Second pass: add sends to campaigns
      events.forEach((event: any) => {
        if (event.extendedProps.type === 'send') {
          const campaignId = event.extendedProps.campaign_id;
          const campaign = campaignMap.get(campaignId);
          if (campaign) {
            campaign.sendCount = (campaign.sendCount || 0) + 1;
            campaign.sends = campaign.sends || [];
            campaign.sends.push({
              id: event.extendedProps.send_id,
              campaign_email_id: event.extendedProps.campaign_email_id,
              send_at: dayjs(event.start),
              service: event.extendedProps.service || 'Other',
              status: event.extendedProps.status || 'pending',
              segment_tag: event.extendedProps.segment_tag
            });

            // Set next send
            if (!campaign.nextSend || dayjs(event.start).isBefore(dayjs(campaign.nextSend))) {
              campaign.nextSend = event.start;
            }
          }
        }
      });

      // Fetch emails for each campaign (if selected)
      const campaignsArray = Array.from(campaignMap.values());

      // For now, fetch all campaign emails
      for (const campaign of campaignsArray) {
        try {
          const emailsRes = await apiClient.get(`/scheduler/campaigns/${campaign.id}/emails`);
          if (emailsRes.data) {
            campaign.emails = emailsRes.data;
          }
        } catch (err) {
          console.error(`Error fetching emails for campaign ${campaign.id}:`, err);
        }
      }

      console.log('Processed campaigns:', campaignsArray);
      setCampaigns(campaignsArray);

      // Auto-select first campaign if none selected
      if (!selectedCampaignId && campaignsArray.length > 0) {
        setSelectedCampaignId(campaignsArray[0].id);
      }

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    fetchData();
  }, []);

  // Handlers
  const handleCreateCampaign = () => {
    setIsCreateModalOpen(true);
  };

  const handleSaveNewCampaign = async (formData: any) => {
    try {
      const newCampaignData = {
        title: formData.title,
        start_date: formData.start_date.toISOString(),
        end_date: formData.end_date.toISOString(),
        category: formData.category,
        notes: formData.notes,
        segmentation_mode: formData.segmentation_mode
      };

      const res = await apiClient.post('/scheduler/events', newCampaignData);
      await fetchData();
      setSelectedCampaignId(res.data.id);
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('Error creating campaign:', err);
      throw err;
    }
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaignId) return;
    if (!window.confirm('Are you sure you want to delete this campaign? This will delete all associated emails and sends.')) return;

    try {
      await apiClient.delete(`/scheduler/events/campaign_${selectedCampaignId}`);
      setSelectedCampaignId(null);
      await fetchData();
    } catch (err) {
      console.error('Error deleting campaign:', err);
    }
  };

  const handleUpdateCampaign = async (updatedCampaign: Campaign) => {
    try {
      await apiClient.put(`/scheduler/events/campaign_${updatedCampaign.id}`, {
        title: updatedCampaign.title,
        start_date: updatedCampaign.start_date,
        end_date: updatedCampaign.end_date,
        category: updatedCampaign.category,
        notes: updatedCampaign.notes,
        segmentation_mode: updatedCampaign.segmentation_mode
      });
      await fetchData();
    } catch (err) {
      console.error('Error updating campaign:', err);
    }
  };

  const handleUpdateEmail = async (email: CampaignEmail) => {
    try {
      if (email.id) {
        await apiClient.put(`/scheduler/emails/${email.id}`, email);
      } else {
        await apiClient.post('/scheduler/emails', email);
      }
      await fetchData();
    } catch (err) {
      console.error('Error updating email:', err);
    }
  };

  const handleAddSend = async () => {
    setIsSendWizardOpen(true);
  };

  const handleBatchCreateSends = async (sends: any[]) => {
    const campaign = selectedCampaign;
    if (!campaign) return;

    try {
      const baseEmail = campaign.emails?.[0];

      for (const send of sends) {
        const newEmailData = {
          campaign_id: campaign.id,
          title: `Email for ${send.segment_tag}`,
          subject: baseEmail?.subject || 'New Subject',
          button_name: baseEmail?.button_name || 'Donate Now',
          link_donation: baseEmail?.link_donation || '',
          link_contact_us: baseEmail?.link_contact_us || '',
          custom_links: baseEmail?.custom_links || ''
        };

        const emailRes = await apiClient.post('/scheduler/emails', newEmailData);
        const newEmailId = emailRes.data.id;

        await apiClient.post('/scheduler/sends', {
          campaign_email_id: newEmailId,
          send_at: send.send_at.toISOString(),
          service: send.service,
          status: send.status,
          segment_tag: send.segment_tag
        });
      }

      await fetchData();
      setIsSendWizardOpen(false);
    } catch (err) {
      console.error('Error batch creating sends:', err);
    }
  };

  const handleUpdateSend = async (send: ScheduledSend) => {
    try {
      await apiClient.put(`/scheduler/sends/${send.id}`, {
        send_at: send.send_at.toISOString(),
        service: send.service,
        status: send.status,
        segment_tag: send.segment_tag
      });
      await fetchData();
    } catch (err) {
      console.error('Error updating send:', err);
    }
  };

  const handleDeleteSend = async (id: number) => {
    try {
      await apiClient.delete(`/scheduler/sends/${id}`);
      await fetchData();
    } catch (err) {
      console.error('Error deleting send:', err);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh'
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, ${alpha(
          theme.palette.secondary.main,
          0.02
        )} 100%)`,
        p: 3
      }}
    >
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}
              >
                📧
              </Box>
              <Box>
                <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>Campaign Scheduler</h1>
                <p style={{ margin: 0, color: theme.palette.text.secondary }}>
                  Manage your email campaigns and scheduled sends
                </p>
              </Box>
            </Box>
          </motion.div>
        </Box>
        <Button
          variant="contained"
          onClick={handleCreateCampaign}
          sx={{
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 600,
            px: 3,
            background: `linear-gradient(45deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
          }}
        >
          + New Campaign
        </Button>
      </Box>

      {/* Main Content - Split Panel */}
      <Box sx={{ height: 'calc(100vh - 200px)' }}>
        <SplitPanelLayout
          leftWidth={40}
          leftPanel={
            <CampaignListPanel
              campaigns={campaigns}
              selectedId={selectedCampaignId}
              onSelect={setSelectedCampaignId}
              filters={filters}
              onFilterChange={setFilters}
            />
          }
          rightPanel={
            <CampaignDetailsPanel
              campaign={selectedCampaign}
              onUpdateEmail={handleUpdateEmail}
              onAddSend={handleAddSend}
              onUpdateSend={handleUpdateSend}
              onDeleteSend={handleDeleteSend}
              onDeleteCampaign={handleDeleteCampaign}
              onUpdateCampaign={handleUpdateCampaign}
            />
          }
        />
      </Box>

      <CampaignModal
        open={isCreateModalOpen}
        campaign={null}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleSaveNewCampaign}
      />

      <SendWizardModal
        open={isSendWizardOpen}
        onClose={() => setIsSendWizardOpen(false)}
        onSave={handleBatchCreateSends}
        campaignCategory={selectedCampaign?.category || ''}
        segmentationMode={selectedCampaign?.segmentation_mode || 'standard'}
      />
    </Box>
  );
};

export default CampaignSchedulerPage;
