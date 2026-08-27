<?php
/**
 * Plugin Name: Animal Love Email Tracking
 * Description: Records privacy-conscious first-party engagement for Animal Love donation links.
 * Version: 1.0.0
 * Author: Animal Love Rescue Center
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Text Domain: animal-love-email-tracking
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ALC_TRACKING_VERSION', '1.0.0');
define('ALC_TRACKING_FILE', __FILE__);

function alc_tracking_sanitize_enabled($value) {
    return empty($value) ? 0 : 1;
}

function alc_tracking_sanitize_endpoint($value) {
    $endpoint = esc_url_raw(trim((string) $value), array('https'));
    if ($endpoint === '') {
        return '';
    }
    $scheme = wp_parse_url($endpoint, PHP_URL_SCHEME);
    $host = wp_parse_url($endpoint, PHP_URL_HOST);
    if ($scheme !== 'https' || empty($host)) {
        add_settings_error(
            'alc_event_endpoint',
            'alc_event_endpoint_https',
            __('The event endpoint must be an absolute HTTPS URL.', 'animal-love-email-tracking')
        );
        return (string) get_option('alc_event_endpoint', '');
    }
    return untrailingslashit($endpoint);
}

function alc_tracking_sanitize_retention_days($value) {
    return max(1, min(90, absint($value)));
}

function alc_tracking_sanitize_privacy_url($value) {
    if (trim((string) $value) === '') {
        return '';
    }
    return esc_url_raw(trim((string) $value), array('https'));
}

function alc_tracking_register_settings() {
    register_setting(
        'alc_tracking_settings',
        'alc_tracker_enabled',
        array('type' => 'boolean', 'sanitize_callback' => 'alc_tracking_sanitize_enabled', 'default' => 0)
    );
    register_setting(
        'alc_tracking_settings',
        'alc_event_endpoint',
        array('type' => 'string', 'sanitize_callback' => 'alc_tracking_sanitize_endpoint', 'default' => '')
    );
    register_setting(
        'alc_tracking_settings',
        'alc_retention_days',
        array('type' => 'integer', 'sanitize_callback' => 'alc_tracking_sanitize_retention_days', 'default' => 30)
    );
    register_setting(
        'alc_tracking_settings',
        'alc_privacy_notice_url',
        array('type' => 'string', 'sanitize_callback' => 'alc_tracking_sanitize_privacy_url', 'default' => '')
    );
}
add_action('admin_init', 'alc_tracking_register_settings');

function alc_tracking_add_settings_page() {
    add_options_page(
        __('Animal Love Email Tracking', 'animal-love-email-tracking'),
        __('Email Tracking', 'animal-love-email-tracking'),
        'manage_options',
        'animal-love-email-tracking',
        'alc_tracking_render_settings_page'
    );
}
add_action('admin_menu', 'alc_tracking_add_settings_page');

function alc_tracking_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1><?php echo esc_html__('Animal Love Email Tracking', 'animal-love-email-tracking'); ?></h1>
        <p><?php echo esc_html__('First-party attribution for donation links. Open tracking is not used.', 'animal-love-email-tracking'); ?></p>
        <?php settings_errors(); ?>
        <form action="options.php" method="post">
            <?php settings_fields('alc_tracking_settings'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><?php echo esc_html__('Enable tracker', 'animal-love-email-tracking'); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="alc_tracker_enabled" value="1" <?php checked(1, get_option('alc_tracker_enabled', 0)); ?>>
                            <?php echo esc_html__('Record first-party donation landing engagement.', 'animal-love-email-tracking'); ?>
                        </label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="alc_event_endpoint"><?php echo esc_html__('Event endpoint URL', 'animal-love-email-tracking'); ?></label></th>
                    <td>
                        <input class="regular-text code" type="url" id="alc_event_endpoint" name="alc_event_endpoint" value="<?php echo esc_attr(get_option('alc_event_endpoint', '')); ?>" placeholder="https://api.example.org/api/v1/email-tracking/events">
                        <p class="description"><?php echo esc_html__('Must be the public HTTPS /events endpoint.', 'animal-love-email-tracking'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="alc_retention_days"><?php echo esc_html__('Attribution retention', 'animal-love-email-tracking'); ?></label></th>
                    <td>
                        <input type="number" min="1" max="90" id="alc_retention_days" name="alc_retention_days" value="<?php echo esc_attr(get_option('alc_retention_days', 30)); ?>">
                        <span><?php echo esc_html__('days (1–90)', 'animal-love-email-tracking'); ?></span>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="alc_privacy_notice_url"><?php echo esc_html__('Privacy notice URL', 'animal-love-email-tracking'); ?></label></th>
                    <td>
                        <input class="regular-text" type="url" id="alc_privacy_notice_url" name="alc_privacy_notice_url" value="<?php echo esc_attr(get_option('alc_privacy_notice_url', '')); ?>">
                        <p class="description"><?php echo esc_html__('Optional administrative reference; it is not sent to the browser.', 'animal-love-email-tracking'); ?></p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

function alc_tracking_enqueue_script() {
    if (!get_option('alc_tracker_enabled', 0)) {
        return;
    }
    $endpoint = alc_tracking_sanitize_endpoint(get_option('alc_event_endpoint', ''));
    if ($endpoint === '') {
        return;
    }
    $relative_path = 'assets/js/tracker.js';
    $absolute_path = plugin_dir_path(ALC_TRACKING_FILE) . $relative_path;
    wp_enqueue_script(
        'animal-love-email-tracking',
        plugins_url($relative_path, ALC_TRACKING_FILE),
        array(),
        file_exists($absolute_path) ? (string) filemtime($absolute_path) : ALC_TRACKING_VERSION,
        true
    );
    wp_localize_script(
        'animal-love-email-tracking',
        'AnimalLoveEmailTracking',
        array(
            'endpoint' => $endpoint,
            'retentionDays' => alc_tracking_sanitize_retention_days(get_option('alc_retention_days', 30)),
        )
    );
}
add_action('wp_enqueue_scripts', 'alc_tracking_enqueue_script');
