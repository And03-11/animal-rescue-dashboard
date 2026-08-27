import type { ContactProfileInsights, UnifiedContactProfile } from "./types";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const getContactProfileInsights = (
  profile: UnifiedContactProfile,
): ContactProfileInsights => {
  const fields = profile.contact.fields;
  const contactEmails = Array.isArray(fields?.Emails) ? fields.Emails : [];
  const emailCandidates = [
    profile.email_searched,
    fields?.Email,
    ...contactEmails,
    ...profile.mailchimp.map((detail) => detail.email),
    ...profile.brevo.map((detail) => detail.email),
  ];

  const knownEmails = Array.from(
    new Set(
      emailCandidates
        .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
        .map(normalizeEmail),
    ),
  );

  const reachableEmails = new Set(
    [...profile.mailchimp, ...profile.brevo]
      .filter((detail) => detail.found)
      .map((detail) => normalizeEmail(detail.email)),
  );

  const sourceCount = [
    Boolean(profile.contact.fields && !profile.contact.error),
    profile.mailchimp.some((detail) => detail.found),
    profile.brevo.some((detail) => detail.found),
  ].filter(Boolean).length;

  return {
    averageDonation:
      profile.airtable_summary.count > 0
        ? profile.airtable_summary.total / profile.airtable_summary.count
        : 0,
    sourceCount,
    sourceCoverage: Math.round((sourceCount / 3) * 100),
    knownEmails,
    reachableEmailCount: knownEmails.filter((email) => reachableEmails.has(email)).length,
  };
};

export const formatDonationCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export const formatProfileDate = (value?: string | null): string => {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};
