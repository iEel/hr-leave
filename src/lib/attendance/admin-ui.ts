export interface AttendanceSyncRunSummary {
    id: number;
    deviceId: number;
    mode: string;
    status: string;
    startedAt: string;
    errorMessage: string | null;
}

const COMPLETED_BACKFILL_STATUSES = new Set(['SUCCESS', 'FAILED', 'SKIPPED', 'PARTIAL']);

export function findCompletedBackfillRun(
    runs: AttendanceSyncRunSummary[],
    deviceId: number,
    requestStartedAt: Date
): AttendanceSyncRunSummary | null {
    const requestStartedMs = requestStartedAt.getTime();

    return runs
        .filter((run) => {
            if (run.deviceId !== deviceId || run.mode !== 'BACKFILL' || !COMPLETED_BACKFILL_STATUSES.has(run.status)) {
                return false;
            }

            const runStartedMs = new Date(run.startedAt).getTime();
            return Number.isFinite(runStartedMs) && runStartedMs >= requestStartedMs;
        })
        .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
        .at(0) ?? null;
}
