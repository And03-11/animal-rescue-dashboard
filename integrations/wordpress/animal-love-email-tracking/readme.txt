=== Animal Love Email Tracking ===
Contributors: animallove
Tags: email, attribution, privacy, donations
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Privacy-conscious first-party engagement tracking for Animal Love donation links.

== Description ==

Animal Love Email Tracking reads the opaque `alc` fragment added to approved
donation links. It removes that fragment from the visible URL, stores a secure
first-party attribution cookie, and sends landing, interaction, and session
signals to the configured Animal Love API.

The plugin does not use an open-tracking pixel, does not delay navigation or
the donation form, and does not log attribution tokens in the browser console.

== Installation ==

1. Upload `animal-love-email-tracking.zip` under Plugins > Add New > Upload Plugin.
2. Activate Animal Love Email Tracking.
3. Open Settings > Email Tracking.
4. Enter the public HTTPS endpoint ending in `/api/v1/email-tracking/events`.
5. Choose a retention period from 1 to 90 days and enable the tracker.
6. Open a tracked donation URL in a private browser session and verify the
   event API before enabling click tracking for a real campaign.

== Privacy ==

The browser receives only the opaque attribution token, endpoint, and retention
period. The plugin stores the attribution cookie with Secure and SameSite=Lax.
Plugin settings remain when the plugin is deactivated or removed so that an
administrator does not lose configuration unexpectedly.

== Changelog ==

= 1.0.0 =
* Initial first-party landing and interaction tracking.
