import type { Dayjs } from 'dayjs';

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
    dnr_date?: string | null;
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

export type SegmentationMode = 'bc_single' | 'bc_split' | 'standard';

export interface SchedulerCampaignFormData {
    id?: number;
    title: string;
    start_date: Dayjs;
    end_date: Dayjs;
    category: string;
    notes: string;
    segmentation_mode: SegmentationMode;
}

interface SchedulerEventBase {
    id: string;
    title: string;
    start: string;
    end?: string | null;
}

export interface SchedulerCampaignEvent extends SchedulerEventBase {
    extendedProps: {
        type: 'campaign';
        campaign_id: number;
        title?: string | null;
        category?: string | null;
        notes?: string | null;
        segmentation_mode?: string | null;
    };
}

export interface SchedulerSendEvent extends SchedulerEventBase {
    extendedProps: {
        type: 'send';
        send_id: number;
        campaign_email_id: number;
        campaign_id: number | null;
        service?: string | null;
        status?: string | null;
        segment_tag?: string | null;
    };
}

export type SchedulerEvent = SchedulerCampaignEvent | SchedulerSendEvent;

export interface SchedulerBatchSendInput {
    send_at: Dayjs;
    segment_tag: string;
    service: string;
    status: string;
}

export interface SchedulerNodeInput {
    label?: string;
    buttonName?: string;
    sendDate?: Dayjs | string | null;
    service?: string;
    status?: string;
    isDnr?: boolean;
    dnrDate?: string | null;
    customService?: string;
}

export interface SchedulerNodeData extends SchedulerNodeInput {
    title?: string;
    category?: string;
    notes?: string;
    account?: string;
    delay?: number;
    original?: Campaign;
    originalEmail?: CampaignEmail;
    originalSend?: ScheduledSend;
}

export interface SchedulerCreatedResource {
    id: number;
}
