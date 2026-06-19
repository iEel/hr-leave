export type SyncRunModeFilter = 'INCREMENTAL' | 'BACKFILL' | 'TEST';
export type SyncRunStatusFilter = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PARTIAL';

export interface ParsedSyncRunsQuery {
    page: number;
    limit: number;
    offset: number;
    deviceId: number | null;
    mode: SyncRunModeFilter | null;
    status: SyncRunStatusFilter | null;
    periodDays: number | null;
}

const ALLOWED_LIMITS = new Set([10, 20, 50]);
const ALLOWED_MODES = new Set<SyncRunModeFilter>(['INCREMENTAL', 'BACKFILL', 'TEST']);
const ALLOWED_STATUSES = new Set<SyncRunStatusFilter>(['RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'PARTIAL']);
const ALLOWED_PERIOD_DAYS = new Set([7, 30, 90]);

export function parseSyncRunsQuery(searchParams: URLSearchParams): ParsedSyncRunsQuery {
    const page = parsePositiveInteger(searchParams.get('page')) ?? 1;
    const requestedLimit = parsePositiveInteger(searchParams.get('limit')) ?? 20;
    const limit = ALLOWED_LIMITS.has(requestedLimit) ? requestedLimit : 20;
    const deviceId = parsePositiveInteger(searchParams.get('deviceId'));
    const mode = parseAllowedValue(searchParams.get('mode'), ALLOWED_MODES);
    const status = parseAllowedValue(searchParams.get('status'), ALLOWED_STATUSES);
    const requestedPeriodDays = parsePositiveInteger(searchParams.get('periodDays'));
    const periodDays = requestedPeriodDays != null && ALLOWED_PERIOD_DAYS.has(requestedPeriodDays)
        ? requestedPeriodDays
        : null;

    return {
        page,
        limit,
        offset: (page - 1) * limit,
        deviceId,
        mode,
        status,
        periodDays,
    };
}

function parsePositiveInteger(value: string | null): number | null {
    if (!value || !/^\d+$/.test(value)) {
        return null;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseAllowedValue<T extends string>(value: string | null, allowedValues: Set<T>): T | null {
    if (!value) {
        return null;
    }

    const normalized = value.toUpperCase() as T;
    return allowedValues.has(normalized) ? normalized : null;
}
