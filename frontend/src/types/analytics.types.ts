export interface AnalyticsListItem {
    id: string;
    name: string;
    createdTime?: string;
}

export interface Donation {
    id: string;
    date: string;
    amount: number;
    donorName: string;
    donorEmail: string;
}

export interface AnalyticsBreakdownItem {
    id: string;
    name: string;
    total_amount: number;
    donation_count: number;
    start_date?: string;
}

export interface AnalyticsStats {
    total_amount: number;
    total_count: number;
    breakdown: AnalyticsBreakdownItem[];
}

export interface AnalyticsStatsResponse {
    source_total_amount?: number;
    source_total_count?: number;
    campaign_total_amount?: number;
    campaign_total_count?: number;
    stats_by_campaign?: unknown[];
    stats_by_form_title?: unknown[];
}

export interface PaginatedDonationsResponse {
    donations: Donation[];
    total_count: number;
}

export interface ShareLinkPayload {
    source_id: string;
    source_name: string;
    campaign_id?: string;
    campaign_name?: string;
    start_date?: string;
    end_date?: string;
    form_titles?: string;
}

export interface ShareLinkResponse {
    share_id: string;
    url: string;
}

export interface SharedAnalyticsConfigResponse {
    source_id?: string;
    source?: string;
    source_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    form_titles?: string[] | string | null;
}

export interface SharedAnalyticsConfig {
    source: string;
    source_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    form_title_id?: string;
}

export interface DonationSourceData {
    name: string;
    value: number;
    percentage: number;
}

export interface AirtableDonation {
    amount: number;
    date: string;
}

export interface AirtableDonationSummary {
    total_donated: number;
    donation_count: number;
    donations: AirtableDonation[];
}

export type AirtableDonationProfile =
    | { found: false }
    | { found: true; summary: AirtableDonationSummary };
