export type CampaignSource = 'airtable' | 'csv';

export type AirtableRegion = 'USA' | 'EUR';
export type AudienceSegment = 'standard' | 'dnr';

export interface AirtableAudience {
  region: AirtableRegion;
  is_bounced: boolean;
}

export interface AudiencePreviewBranch extends AirtableAudience {
  count: number;
}

export interface AudiencePreview {
  branches: AudiencePreviewBranch[];
  total_unique: number;
}

export interface CsvColumnMapping {
  email: string;
  name: string;
  has_header: boolean;
}

export interface CsvPreview {
  columns: string[];
  preview_row: string[];
  has_header: boolean;
}

export interface CampaignFormData {
  campaign_name: string;
  source_type: CampaignSource;
  subject: string;
  html_body: string;
  sender_config: string | string[];
  scheduled_at: string | null;
  csvFile?: File | null;
  region?: string;
  is_bounced?: boolean;
  audiences?: AirtableAudience[];
  segment?: AudienceSegment;
}

export interface CampaignFormProps {
  onSave: (campaign: CampaignFormData, mapping?: CsvColumnMapping) => void;
  onCancel: () => void;
  initialCampaignId?: string | null;
}

export interface SenderOptions {
  groups: string[];
  accounts: SelectedAccount[];
}

export interface SelectedAccount {
  id: string;
  group: string;
}

export interface CampaignProgress {
  sent: number;
  total: number;
  percentage: number;
}

export interface CampaignPerformance {
  open_rate?: number;
  click_rate?: number;
}

export interface EmailCampaign {
  id: string;
  createdAt: string;
  campaign_name?: string;
  subject?: string;
  source_type: CampaignSource;
  region?: string;
  is_bounced?: boolean;
  audiences?: AirtableAudience[];
  segment?: AudienceSegment;
  csv_filename?: string;
  status: string;
  scheduled_at?: string | null;
  progress?: CampaignProgress;
  performance?: CampaignPerformance;
  sent_count_final?: number;
  target_count?: number;
}

export interface PaginatedCampaignsResponse {
  items: EmailCampaign[];
  total: number;
}

export interface EmailTemplate {
  id: number;
  name: string;
  content: string;
}

export interface CreateCampaignResponse {
  id: string;
}

export interface CampaignLaunchResponse {
  message?: string;
}

export interface CampaignContact {
  email: string;
  status: string;
}

export interface CampaignDetails {
  subject?: string;
  region?: string;
  is_bounced?: boolean;
  audiences?: AirtableAudience[];
  segment?: AudienceSegment;
  status?: string;
  target_count?: number;
  html_body?: string;
}

export interface CampaignDetailsResponse {
  details: CampaignDetails;
  contacts: CampaignContact[];
}
