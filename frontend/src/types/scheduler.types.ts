import { Dayjs } from 'dayjs';

// Shared types for Campaign Scheduler

export interface CampaignEmail {
    id: number;
    campaign_id: number;
    title: string;
    subject: string;
    button_name: string;
    link_donation: string;
    link_contact_us: string;
    custom_links: string;
}

export interface ScheduledSend {
    id: number;
    campaign_email_id: number;
    send_at: Dayjs;
    service: string;
    custom_service?: string;
    status: string;
    segment_tag?: string;
    is_dnr?: boolean;
    dnr_date?: string;
}

export interface Campaign {
    id: number;
    title: string;
    category: string;
    start_date: string;
    end_date: string;
    notes?: string;
    segmentation_mode?: string;
    sendCount: number;
    nextSend?: string;
    status: 'active' | 'completed' | 'pending';
    emails?: CampaignEmail[];
    sends?: ScheduledSend[];
}

export interface FilterState {
    search: string;
    categories: string[];
}
