import { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, CircularProgress, Alert, useTheme, alpha } from '@mui/material';
import { motion } from 'framer-motion';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/axiosConfig';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, CircularProgress, Alert, useTheme, alpha } from '@mui/material';
import { motion } from 'framer-motion';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../api/axiosConfig';

// Import components
import { SchedulerHeader } from '../components/SchedulerHeader';
import { SchedulerFilters } from '../components/SchedulerFilters';
import { SchedulerDetailsPanel } from '../components/SchedulerDetailsPanel';
import { SchedulerTimeline, type TimelineItem, type TimelineGroup } from '../components/SchedulerTimeline';
import { SchedulerListView } from '../components/SchedulerListView';
import { SchedulerCalendarView } from '../components/SchedulerCalendarView';
import { CampaignModal } from '../components/CampaignModal';
import { EmailModal } from '../components/EmailModal';

// Types
interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  opacity?: number;
  allDay?: boolean;
  extendedProps: {
    type: 'campaign' | 'send';
    campaign_id: number;
    campaign_email_id?: number;
    send_id?: number;
    notes?: string;
    category?: string;
    title?: string;
    service?: string;
    status?: string;
    segment_tag?: string;
    parent_title?: string;
    parent_category?: string;
    segmentation_mode?: string;
  };
}

interface FilterState {
  search: string;
  categories: string[];
  platforms: string[];
  statuses: string[];
}

interface CampaignFormData {
  id?: number;
  title: string;
  start_date: Dayjs;
  end_date: Dayjs;
  category: string;
  notes: string;
  segmentation_mode: 'bc' | 'single' | 'split';
}

interface EmailFormData {
  id?: number;
  campaign_id: number;
  title: string;
  subject: string;
  button_name: string;
  link_donation: string;
  link_contact_us: string;
  custom_links: string;
}

type ViewMode = 'timeline' | 'calendar' | 'list';

// Main Component
export const CampaignSchedulerPage = () => {
  const theme = useTheme();

  // State
  const [currentView, setCurrentView] = useState<ViewMode>('timeline');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignFormData | null>(null);

  // Email Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<EmailFormData | null>(null);
  const [selectedCampaignIdForEmail, setSelectedCampaignIdForEmail] = useState<number | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    categories: [],
    platforms: [],
    statuses: []
  });

  // Timeline state
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);

  // Fetch data
  const fetchSchedulerData = useCallback(async () => {
    setLoading(true);
    setError('');

    const start = dayjs().subtract(1, 'month').startOf('month').toISOString();
    const end = dayjs().add(3, 'month').endOf('month').toISOString();
    const params = new URLSearchParams({ start, end });

    try {
      const response = await apiClient.get<CalendarEvent[]>(`/scheduler/events?${params.toString()}`);
      const fetchedEvents = response.data;
      setEvents(fetchedEvents);

      // Transform for timeline
      const newItems: TimelineItem[] = [];
      const groupsMap = new Map<string, TimelineGroup>();

      fetchedEvents.forEach(event => {
        const props = event.extendedProps;

        if (props.type === 'campaign') {
          if (!groupsMap.has(event.id)) {
            groupsMap.set(event.id, {
              id: event.id,
              content: event.title,
              notes: props.notes,
              category: props.category,
              segmentation_mode: props.segmentation_mode,
              start: dayjs(event.start).startOf('day').toDate(),
              end: dayjs(event.end).endOf('day').toDate(),
            });
          }

          newItems.push({
            id: `bg_${event.id}`,
            content: '',
            start: dayjs(event.start).startOf('day').toDate(),
            end: dayjs(event.end).endOf('day').toDate(),
            group: event.id,
            type: 'background',
            className: 'timeline-campaign-background',
            style: `background-color: ${event.backgroundColor}33; border-color: ${event.borderColor};`
          });
        } else if (props.type === 'send') {
          const parentGroupId = `campaign_${props.campaign_id}`;
          if (!groupsMap.has(parentGroupId)) {
            groupsMap.set(parentGroupId, {
              id: parentGroupId,
              content: props.parent_title || `Campaign #${props.campaign_id}`,
            });
          }

          const startTime = dayjs(event.start).format('HH:mm');
          const tooltipTitle = `[${startTime}] ${event.title}`;

          newItems.push({
            id: event.id,
            content: event.title,
            start: new Date(event.start),
            group: parentGroupId,
            type: 'point',
            className: `timeline-send-item status-${props.status || 'pending'}`,
            style: `
              border-color: ${event.borderColor};
              background-color: ${event.backgroundColor}CC;
            `,
            title: tooltipTitle,
            campaign_id: props.campaign_id
          });
        }
      });

      setTimelineGroups(Array.from(groupsMap.values()));
      setTimelineItems(newItems);

    } catch (err) {
      console.error('Error fetching scheduler data:', err);
      setError('Failed to load scheduler data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedulerData();
  }, [fetchSchedulerData]);

  // Extract available categories and platforms
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    events.forEach(event => {
      if (event.extendedProps.category) {
        categories.add(event.extendedProps.category);
      }
    });
    return Array.from(categories);
  }, [events]);

  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    events.forEach(event => {
      if (event.extendedProps.service) {
        platforms.add(event.extendedProps.service);
      }
    });
    return Array.from(platforms);
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search filter
      if (filters.search && !event.title.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      // Category filter
      if (filters.categories.length > 0 && !filters.categories.includes(event.extendedProps.category || '')) {
        return false;
      }

      // Platform filter
      if (filters.platforms.length > 0 && !filters.platforms.includes(event.extendedProps.service || '')) {
        return false;
      }

      // Status filter
      if (filters.statuses.length > 0) {
        const status = event.extendedProps.status || 'pending';
        if (!filters.statuses.map(s => s.toLowerCase()).includes(status.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [events, filters]);

  // Update timeline items when filters change
  useEffect(() => {
    const filteredIds = new Set(filteredEvents.map(e => e.id));
    const filteredTimelineItems = timelineItems.filter(item => {
      if (item.id.toString().startsWith('bg_')) {
        const campaignId = item.id.toString().replace('bg_', '');
        return filteredIds.has(campaignId);
      }
      return filteredIds.has(item.id.toString());
    });
    setTimelineItems(filteredTimelineItems);
  }, [filteredEvents]);

  // Handle event selection
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  // Handle timeline item click
  const handleTimelineItemClick = useCallback((itemId: string | number) => {
    const clickedEvent = events.find(e => e.id === itemId);
    if (clickedEvent) {
      setSelectedEvent(clickedEvent);
    }
  }, [events]);

  // CRUD Operations
  const handleNewCampaign = () => {
    setEditingCampaign(null);
    setModalOpen(true);
  };

  const handleEditCampaign = (event: CalendarEvent) => {
    if (event.extendedProps.type !== 'campaign') return;

    setEditingCampaign({
      id: event.extendedProps.campaign_id,
      title: event.title.replace('CAMPAÑA: ', ''),
      start_date: dayjs(event.start),
      end_date: dayjs(event.end),
      category: event.extendedProps.category || 'Other',
      notes: event.extendedProps.notes || '',
      segmentation_mode: (event.extendedProps.segmentation_mode as any) || 'bc'
    });
    setModalOpen(true);
  };

  const handleSaveCampaign = async (formData: CampaignFormData) => {
    try {
      const payload = {
        title: formData.title,
        start_date: formData.start_date.toISOString(),
        end_date: formData.end_date.toISOString(),
        category: formData.category,
        notes: formData.notes,
        segmentation_mode: formData.segmentation_mode
      };

      if (formData.id) {
        // Update
        await apiClient.put(`/scheduler/events/campaign_${formData.id}`, payload);
      } else {
        // Create
        await apiClient.post('/scheduler/events', payload);
      }

      await fetchSchedulerData();
      setModalOpen(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error saving campaign:', error);
      throw error;
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    try {
      await apiClient.delete(`/scheduler/events/campaign_${id}`);
      await fetchSchedulerData();
      setModalOpen(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw error;
    }
  };

  // Email CRUD Operations
  const handleAddEmail = (campaignId: number) => {
    setSelectedCampaignIdForEmail(campaignId);
    setEditingEmail(null);
    setEmailModalOpen(true);
  };

  const handleEditEmail = (emailEvent: CalendarEvent) => {
    if (emailEvent.extendedProps.type !== 'send') return;

    // We need to fetch the full email details or reconstruct them
    // Since the event props might not have everything, let's assume we need to fetch or use what we have
    // For now, let's use extendedProps if available, or fetch.
    // Actually, the backend 'events' endpoint might not return all email fields (like links).
    // But let's check what we have. The event has extendedProps.
    // If we need more data, we should fetch it. But let's try to populate with what we have for now,
    // or better, fetch the email details.

    // To keep it simple and consistent, let's just open the modal with the IDs and let the user edit.
    // Ideally we should have the data.
    // Let's assume we can pass the data we have.

    // Wait, the 'events' endpoint returns CalendarEvents.
    // Does it include email links?
    // Looking at scheduler.py:
    // It joins CampaignEmail.
    // But CalendarEvent extendedProps only has a few fields.
    // We might need to fetch the specific email.

    // Let's implement a fetch for the single email or just use what we have and risk missing fields.
    // Better: Fetch the email details.

    // Since I can't easily add a new fetch right here without more code, 
    // I'll assume for this iteration we might need to fetch or just use defaults.
    // Actually, I'll implement a quick fetch inside the modal or here.
    // Let's do it here.

    const emailId = emailEvent.extendedProps.campaign_email_id;
    if (!emailId) return;

    // We'll set the ID and let the modal handle it? No, modal expects data.
    // Let's fetch it.
    apiClient.get(`/scheduler/campaigns/${emailEvent.extendedProps.campaign_id}/emails`)
      .then(res => {
        const email = res.data.find((e: any) => e.id === emailId);
        if (email) {
          setEditingEmail(email);
          setSelectedCampaignIdForEmail(emailEvent.extendedProps.campaign_id);
          setEmailModalOpen(true);
        }
      })
      .catch(err => console.error("Error fetching email details", err));
  };

  const handleSaveEmail = async (formData: EmailFormData) => {
    try {
      if (formData.id) {
        await apiClient.put(`/scheduler/emails/${formData.id}`, formData);
      } else {
        await apiClient.post('/scheduler/emails', formData);
      }
      await fetchSchedulerData();
      setEmailModalOpen(false);
      // Refresh selected event if it's the campaign
      if (selectedEvent && selectedEvent.extendedProps.type === 'campaign' && selectedEvent.extendedProps.campaign_id === formData.campaign_id) {
        // We might need to refresh the selected event's data? 
        // The fetchSchedulerData updates 'events', but 'selectedEvent' is a separate state object.
        // We should probably update selectedEvent to point to the new object in 'events'.
        // But 'events' is updated async.
        // For now, let's just close the modal. The details panel uses 'allEvents' prop which will be updated.
      }
    } catch (error) {
      console.error('Error saving email:', error);
      throw error;
    }
  };

  const handleDeleteEmail = async (id: number) => {
    try {
      await apiClient.delete(`/scheduler/emails/${id}`);
      await fetchSchedulerData();
      setEmailModalOpen(false);
    } catch (error) {
      console.error('Error deleting email:', error);
      throw error;
    }
  };

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      sx={{
        width: '100%',
        maxWidth: '1600px',
        mx: 'auto',
        p: 3
      }}
    >
      {/* Header */}
      <SchedulerHeader
        currentView={currentView}
        onViewChange={setCurrentView}
        onRefresh={fetchSchedulerData}
        onNewCampaign={handleNewCampaign}
        loading={loading}
      />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Main Content */}
      <Box sx={{ display: 'flex', gap: 3 }}>
        {/* Filters Sidebar */}
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <SchedulerFilters
            filters={filters}
            onFilterChange={setFilters}
            availableCategories={availableCategories}
            availablePlatforms={availablePlatforms}
          />
        </Box>

        {/* Main View Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Loading State */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Timeline View */}
              {currentView === 'timeline' && (
                <Box
                  sx={{
                    bgcolor: theme.palette.background.paper,
                    borderRadius: '16px',
                    p: 2,
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    minHeight: 400
                  }}
                >
                  <SchedulerTimeline
                    items={timelineItems}
                    groups={timelineGroups}
                    onItemDoubleClick={handleTimelineItemClick}
                    onItemMove={() => { }} // Read-only
                  />
                </Box>
              )}

              {/* Calendar View */}
              {currentView === 'calendar' && (
                <SchedulerCalendarView
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                />
              )}

              {/* List View */}
              {currentView === 'list' && (
                <SchedulerListView
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                />
              )}

              {/* Details Panel */}
              {selectedEvent && (
                <SchedulerDetailsPanel
                  selectedEvent={selectedEvent}
                  allEvents={events}
                  onClose={() => setSelectedEvent(null)}
                  onEdit={handleEditCampaign}
                  onAddEmail={handleAddEmail}
                  onEditEmail={handleEditEmail}
                />
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Campaign Modal */}
      <CampaignModal
        open={modalOpen}
        campaign={editingCampaign}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveCampaign}
        onDelete={handleDeleteCampaign}
      />

      {/* Email Modal */}
      <EmailModal
        open={emailModalOpen}
        email={editingEmail}
        campaignId={selectedCampaignIdForEmail || 0}
        onClose={() => setEmailModalOpen(false)}
        onSave={handleSaveEmail}
        onDelete={handleDeleteEmail}
      />
    </Box>
  );
};

export default CampaignSchedulerPage;