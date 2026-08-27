import type { ReactNode } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import VolunteerActivismRoundedIcon from "@mui/icons-material/VolunteerActivismRounded";

import {
  formatDonationCurrency,
  formatProfileDate,
  getContactProfileInsights,
} from "../features/contact-search/profileInsights";
import type { UnifiedContactProfile } from "../features/contact-search/types";

interface UnifiedProfileProps {
  profileData: UnifiedContactProfile;
}

interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
}

const MetricCard = ({ label, value, helper, icon }: MetricCardProps) => {
  const theme = useTheme();

  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            {label}
          </Typography>
          <Box
            sx={{
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
              borderRadius: "11px",
              color: "primary.main",
              backgroundColor: alpha(theme.palette.primary.main, 0.11),
            }}
          >
            {icon}
          </Box>
        </Stack>
        <Typography variant="h3" component="p" sx={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
};

export const UnifiedProfile = ({ profileData }: UnifiedProfileProps) => {
  const theme = useTheme();
  const fields = profileData.contact.fields ?? {};
  const summary = profileData.airtable_summary;
  const insights = getContactProfileInsights(profileData);
  const fullName = [fields.Name, fields["Last Name"]].filter(Boolean).join(" ").trim();
  const displayName = fullName || profileData.email_searched;
  const primaryEmail = fields.Email || profileData.email_searched;
  const firstDonation = formatProfileDate(summary.first_date);
  const lastDonation = formatProfileDate(summary.last_date);
  const airtableFound = Boolean(profileData.contact.fields && !profileData.contact.error);
  const mailchimpFound = profileData.mailchimp.some((detail) => detail.found);
  const mailchimpUnavailable = profileData.mailchimp.some((detail) => Boolean(detail.error));
  const brevoFound = profileData.brevo.some((detail) => detail.found);
  const tags = [fields.Tag, fields["Tag (Mailchimp)"]].filter(
    (tag): tag is string => typeof tag === "string" && tag.length > 0,
  );

  return (
    <Stack spacing={2.5}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
            spacing={3}
          >
            <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
              <Avatar
                sx={{
                  width: { xs: 52, sm: 64 },
                  height: { xs: 52, sm: 64 },
                  bgcolor: alpha(theme.palette.primary.main, 0.16),
                  color: "primary.main",
                  fontSize: "1.45rem",
                  fontWeight: 700,
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <Typography variant="h3" component="h2" sx={{ overflowWrap: "anywhere" }}>
                    {displayName}
                  </Typography>
                  <Chip label="Unified profile" size="small" color="primary" variant="outlined" />
                </Stack>
                <Typography color="text.secondary" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                  {primaryEmail}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: { xs: "100%", md: "auto" } }}>
              <Box
                role="img"
                aria-label={`${insights.sourceCoverage}% source coverage`}
                sx={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
              >
                <CircularProgress
                  variant="determinate"
                  value={100}
                  size={58}
                  thickness={4}
                  sx={{ color: alpha(theme.palette.text.secondary, 0.14) }}
                />
                <CircularProgress
                  variant="determinate"
                  value={insights.sourceCoverage}
                  size={58}
                  thickness={4}
                  sx={{ color: "primary.main", position: "absolute", left: 0 }}
                />
                <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <Typography variant="caption" fontWeight={700}>{insights.sourceCoverage}%</Typography>
                </Box>
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={650}>Source coverage</Typography>
                <Typography variant="caption" color="text.secondary">
                  Found in {insights.sourceCount} of 3 connected sources
                </Typography>
              </Box>
              <Button
                component="a"
                href={`mailto:${primaryEmail}`}
                variant="outlined"
                startIcon={<MailOutlineRoundedIcon />}
                sx={{ display: { xs: "none", sm: "inline-flex" }, flexShrink: 0 }}
              >
                Email donor
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(13rem, 100%), 1fr))",
          gap: 2,
        }}
      >
        <MetricCard
          label="Lifetime giving"
          value={formatDonationCurrency(summary.total)}
          helper={summary.first_date ? `Supporting since ${firstDonation}` : "No recorded donations"}
          icon={<PaidRoundedIcon fontSize="small" />}
        />
        <MetricCard
          label="Recorded gifts"
          value={summary.count.toLocaleString("en-US")}
          helper={summary.last_date ? `Last gift ${lastDonation}` : "No gift date available"}
          icon={<VolunteerActivismRoundedIcon fontSize="small" />}
        />
        <MetricCard
          label="Average gift"
          value={formatDonationCurrency(insights.averageDonation)}
          helper="Average across recorded gifts"
          icon={<QueryStatsRoundedIcon fontSize="small" />}
        />
        <MetricCard
          label="Largest gift"
          value={summary.largest == null ? "—" : formatDonationCurrency(summary.largest)}
          helper="Highest recorded contribution"
          icon={<CalendarMonthRoundedIcon fontSize="small" />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 0.85fr) minmax(0, 1.5fr)" },
          gap: 2.5,
          alignItems: "start",
        }}
      >
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h5" component="h3">Contact details</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Identity and reachability from the donor record.
            </Typography>
            <Divider sx={{ my: 2 }} />

            <List disablePadding>
              <ListItem disableGutters alignItems="flex-start">
                <ListItemIcon sx={{ minWidth: 38, color: "text.secondary", mt: 0.25 }}>
                  <EmailRoundedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Known emails"
                  secondary={`${insights.reachableEmailCount} reachable through Mailchimp or Brevo`}
                  primaryTypographyProps={{ variant: "body2", fontWeight: 650 }}
                />
              </ListItem>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ pl: 4.75, mb: 1.5 }}>
                {insights.knownEmails.map((email) => (
                  <Chip key={email} label={email} size="small" variant="outlined" />
                ))}
              </Stack>

              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 38, color: "text.secondary" }}>
                  <PhoneRoundedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={fields.Phone || "No phone on file"}
                  secondary="Phone"
                  primaryTypographyProps={{ variant: "body2", fontWeight: 650 }}
                />
              </ListItem>
            </List>

            {tags.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2" fontWeight={650} sx={{ mb: 1 }}>Profile tags</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {tags.map((tag) => <Chip key={tag} label={tag} size="small" color="primary" variant="outlined" />)}
                </Stack>
              </>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h5" component="h3">Communication footprint</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              See where this donor can be reached and which records need attention.
            </Typography>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
              <Chip
                icon={airtableFound ? <CheckCircleRoundedIcon /> : <CancelRoundedIcon />}
                label={airtableFound ? "Donor record found" : "No donor record"}
                color={airtableFound ? "success" : "default"}
                variant="outlined"
              />
              <Chip
                icon={mailchimpUnavailable
                  ? <ErrorOutlineRoundedIcon />
                  : mailchimpFound ? <CheckCircleRoundedIcon /> : <CancelRoundedIcon />}
                label={mailchimpUnavailable
                  ? "Mailchimp unavailable"
                  : mailchimpFound ? "Mailchimp connected" : "Not in Mailchimp"}
                color={mailchimpUnavailable ? "warning" : mailchimpFound ? "success" : "default"}
                variant="outlined"
              />
              <Chip
                icon={brevoFound ? <CheckCircleRoundedIcon /> : <CancelRoundedIcon />}
                label={brevoFound ? "Brevo connected" : "Not in Brevo"}
                color={brevoFound ? "success" : "default"}
                variant="outlined"
              />
            </Stack>

            <Divider sx={{ my: 2.25 }} />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              <Box
                sx={{
                  p: 2,
                  borderRadius: "14px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: alpha(theme.palette.background.default, 0.55),
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <AlternateEmailRoundedIcon color="primary" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>Mailchimp</Typography>
                </Stack>
                <List dense disablePadding>
                  {profileData.mailchimp.map((detail) => (
                    <ListItem key={detail.email} disableGutters alignItems="flex-start">
                      <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>
                        {detail.error
                          ? <ErrorOutlineRoundedIcon color="warning" sx={{ fontSize: 18 }} />
                          : detail.found
                            ? <CheckCircleRoundedIcon color="success" sx={{ fontSize: 18 }} />
                            : <CancelRoundedIcon color="disabled" sx={{ fontSize: 18 }} />}
                      </ListItemIcon>
                      <ListItemText
                        primary={detail.email}
                        secondary={detail.error
                          ? "Mailchimp could not be reached"
                          : detail.found
                            ? detail.tags.length > 0 ? `Tags: ${detail.tags.join(", ")}` : "Contact found · No tags"
                            : "Not found"}
                        primaryTypographyProps={{ variant: "caption", fontWeight: 650, sx: { overflowWrap: "anywhere" } }}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: "14px",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: alpha(theme.palette.background.default, 0.55),
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <SendRoundedIcon color="primary" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>Brevo</Typography>
                </Stack>
                <List dense disablePadding>
                  {profileData.brevo.map((detail) => {
                    const isBlacklisted = detail.details.emailBlacklisted === true;
                    const status = isBlacklisted ? "Email blocked" : detail.found ? "Contact active" : "Not found";

                    return (
                      <ListItem key={detail.email} disableGutters alignItems="flex-start">
                        <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>
                          {detail.found && !isBlacklisted
                            ? <CheckCircleRoundedIcon color="success" sx={{ fontSize: 18 }} />
                            : <CancelRoundedIcon color={isBlacklisted ? "error" : "disabled"} sx={{ fontSize: 18 }} />}
                        </ListItemIcon>
                        <ListItemText
                          primary={detail.email}
                          secondary={status}
                          primaryTypographyProps={{ variant: "caption", fontWeight: 650, sx: { overflowWrap: "anywhere" } }}
                          secondaryTypographyProps={{ variant: "caption" }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, color: "text.secondary" }}>
              <StorageRoundedIcon sx={{ fontSize: 17 }} />
              <Typography variant="caption">
                Coverage is calculated from the donor database, Mailchimp and Brevo records returned by this search.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
};

export default UnifiedProfile;
