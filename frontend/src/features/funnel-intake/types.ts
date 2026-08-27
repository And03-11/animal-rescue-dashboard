export type FunnelReviewItem = {
  id: string;
  first_name: string;
  last_name: string;
  emails: string[];
  stage: string | null;
  funnel_stage: string | null;
  status: string | null;
  tag: string | null;
  region: string | null;
  last_donation: string | null;
  last_form_title: string | null;
  donations_count: number;
  total_donated: number;
  last_modified: string | null;
};

export type ContactActivity = {
  type?: string | null;
  timestamp?: string | null;
  campaign_id?: string | number | null;
  campaign_name?: string | null;
  subject?: string | null;
  url?: string | null;
};

export type BrevoReviewMatch = {
  id?: number | string;
  email?: string;
  first_name?: string;
  last_name?: string;
  matched_by: string[];
  lists: string[];
  email_blacklisted: boolean;
  created_at?: string | null;
  modified_at?: string | null;
  recent_activity: ContactActivity[];
};

export type MailchimpReviewMatch = {
  id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  matched_by: string[];
  status?: string | null;
  tags: string[];
  list_name?: string | null;
  last_changed?: string | null;
  member_rating?: number | null;
  recent_activity: ContactActivity[];
};

export type EvidenceSource<T> = {
  status: 'ok' | 'unavailable';
  matches: T[];
  searched_by: string[];
  message?: string;
};

export type FunnelReviewEvidence = {
  donor: FunnelReviewItem;
  brevo: EvidenceSource<BrevoReviewMatch>;
  mailchimp: EvidenceSource<MailchimpReviewMatch>;
};

export type FunnelReviewAction =
  | { action: 'approve' }
  | { action: 'potential_duplicate' }
  | { action: 'change_stage'; value: string };
