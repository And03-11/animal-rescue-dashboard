export interface ContactFields {
  Name?: string;
  "Last Name"?: string;
  Email?: string;
  Phone?: string | null;
  Emails?: string[];
  Tag?: string;
  "Tag (Mailchimp)"?: string;
}

export interface UnifiedContactRecord {
  id?: string;
  fields?: ContactFields;
  error?: string;
}

export interface DonationProfileSummary {
  total: number;
  count: number;
  first_date: string | null;
  last_date?: string | null;
  largest?: number;
}

export interface MailchimpContactDetail {
  email: string;
  found: boolean;
  tags: string[];
  error?: string | null;
}

export interface BrevoContactDetail {
  email: string;
  found: boolean;
  details: Record<string, unknown>;
}

export interface UnifiedContactProfile {
  email_searched: string;
  contact: UnifiedContactRecord;
  airtable_summary: DonationProfileSummary;
  mailchimp: MailchimpContactDetail[];
  brevo: BrevoContactDetail[];
}

export interface ContactProfileInsights {
  averageDonation: number;
  sourceCount: number;
  sourceCoverage: number;
  knownEmails: string[];
  reachableEmailCount: number;
}
