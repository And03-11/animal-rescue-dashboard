import axios from 'axios';
import type {
    AnalyticsBreakdownItem,
    AnalyticsListItem,
    AnalyticsStats,
    AnalyticsStatsResponse,
} from '../../types/analytics.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

const identifier = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
};

export function normalizeFormTitles(data: unknown): AnalyticsListItem[] {
    if (!Array.isArray(data)) return [];

    const mapped = data
        .map((value): AnalyticsListItem | null => {
            if (!isRecord(value)) return null;

            const id = identifier(
                value.id ?? value.form_title_id ?? value.value ?? value.key
            );
            if (!id) return null;

            const name = optionalString(
                value.name ?? value.title ?? value.label ?? value.form_title_name
            ) ?? '(Untitled)';
            const createdTime = optionalString(value.createdTime);

            return createdTime ? { id, name, createdTime } : { id, name };
        })
        .filter((item): item is AnalyticsListItem => item !== null);

    return Array.from(new Map(mapped.map(item => [item.id, item])).values());
}

export function normalizeAnalyticsBreakdown(data: unknown): AnalyticsBreakdownItem[] {
    if (!Array.isArray(data)) return [];

    return data.map((value) => {
        const item = isRecord(value) ? value : {};
        const id = identifier(item.campaign_id ?? item.form_title_id);
        const name = optionalString(item.campaign_name ?? item.form_title_name) ?? 'Unknown';
        const startDate = optionalString(item.start_date ?? item.createdTime);

        return {
            id,
            name,
            total_amount: typeof item.total_amount === 'number' ? item.total_amount : 0,
            donation_count: typeof item.donation_count === 'number' ? item.donation_count : 0,
            ...(startDate ? { start_date: startDate } : {}),
        };
    });
}

export function normalizeAnalyticsStats(data: AnalyticsStatsResponse): AnalyticsStats {
    const rawBreakdown = data.stats_by_campaign ?? data.stats_by_form_title ?? [];

    return {
        total_amount: typeof data.source_total_amount === 'number'
            ? data.source_total_amount
            : typeof data.campaign_total_amount === 'number'
                ? data.campaign_total_amount
                : 0,
        total_count: typeof data.source_total_count === 'number'
            ? data.source_total_count
            : typeof data.campaign_total_count === 'number'
                ? data.campaign_total_count
                : 0,
        breakdown: normalizeAnalyticsBreakdown(rawBreakdown),
    };
}

export const isCanceledRequest = (error: unknown): boolean =>
    axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');

export const getResponseStatus = (error: unknown): number | undefined =>
    axios.isAxiosError(error) ? error.response?.status : undefined;

export const getErrorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error && error.message ? error.message : fallback;
