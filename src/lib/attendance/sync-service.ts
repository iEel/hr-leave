import { sql, getPool } from '@/lib/db';
import { HipCmif68sClient, type HipIncrementalClient } from './hip-client';
import {
    createSyncRun,
    finishSyncRun,
    getAttendanceDeviceConfig,
    insertAttendanceRecordsInTransaction,
    releaseDeviceSyncLock,
    tryAcquireDeviceSyncLock,
    updateDeviceSyncStatus,
} from './repository';
import type { AttendanceSyncStatus, AttendanceTriggerType } from './types';

export interface RunAttendanceIncrementalSyncInput {
    deviceId: number | string;
    triggerType: AttendanceTriggerType;
    triggeredByUserId?: number | null;
    client?: HipIncrementalClient;
}

export interface RunAttendanceIncrementalSyncResult {
    runId: number;
    status: AttendanceSyncStatus;
    newCount: number;
    receivedCount: number;
    insertedCount: number;
    duplicateCount: number;
    confirmedCount: number;
    errorMessage: string | null;
}

export async function runAttendanceIncrementalSync(
    input: RunAttendanceIncrementalSyncInput
): Promise<RunAttendanceIncrementalSyncResult> {
    const device = await getAttendanceDeviceConfig(input.deviceId);
    if (!device) {
        throw new Error(`Attendance device ${input.deviceId} was not found`);
    }

    const owner = createLockOwner(device.id);
    const lockAcquired = await tryAcquireDeviceSyncLock(device.id, owner);

    if (!lockAcquired) {
        return {
            runId: 0,
            status: 'SKIPPED',
            newCount: 0,
            receivedCount: 0,
            insertedCount: 0,
            duplicateCount: 0,
            confirmedCount: 0,
            errorMessage: 'Device sync is already running',
        };
    }

    let runId = 0;
    let newCount = 0;
    let receivedCount = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    let confirmedCount = 0;

    try {
        runId = await createSyncRun({
            deviceId: device.id,
            mode: 'INCREMENTAL',
            triggerType: input.triggerType,
            triggeredByUserId: input.triggeredByUserId ?? null,
        });

        const client = input.client ?? new HipCmif68sClient({
            ipAddress: device.host,
            port: device.port,
            timeoutMs: device.timeoutMs,
        });

        newCount = await client.getNewCount();

        if (newCount === 0) {
            await finishSyncRun({
                syncRunId: runId,
                status: 'SUCCESS',
                newCount,
                receivedCount: 0,
                insertedCount: 0,
                duplicateCount: 0,
                confirmedCount: 0,
                errorMessage: null,
            });
            await updateDeviceSyncStatus(device.id, {
                status: 'SUCCESS',
                lastError: null,
                lastNewCount: 0,
                lastInsertedCount: 0,
                syncFrequencyMinutes: device.syncFrequencyMinutes,
            });

            return successResult(runId, {
                newCount,
                receivedCount,
                insertedCount,
                duplicateCount,
                confirmedCount,
            });
        }

        const records = await client.readNewRecords(newCount);
        receivedCount = records.length;

        if (records.length !== newCount) {
            throw new Error(`HIP A1 returned ${records.length} records for new count ${newCount}`);
        }

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);

        try {
            await transaction.begin();
            const insertResult = await insertAttendanceRecordsInTransaction(transaction, device.id, records);
            insertedCount = insertResult.insertedCount;
            duplicateCount = insertResult.duplicateCount;
            await transaction.commit();
        } catch (error) {
            await rollbackTransaction(transaction);
            throw error;
        }

        await client.confirmRead(newCount);
        confirmedCount = newCount;

        await finishSyncRun({
            syncRunId: runId,
            status: 'SUCCESS',
            newCount,
            receivedCount,
            insertedCount,
            duplicateCount,
            confirmedCount,
            errorMessage: null,
        });
        await updateDeviceSyncStatus(device.id, {
            status: 'SUCCESS',
            lastError: null,
            lastNewCount: newCount,
            lastInsertedCount: insertedCount,
            lastRecordTime: records.at(-1)?.recordTime ?? null,
            syncFrequencyMinutes: device.syncFrequencyMinutes,
        });

        return successResult(runId, {
            newCount,
            receivedCount,
            insertedCount,
            duplicateCount,
            confirmedCount,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (runId !== 0) {
            await finishSyncRun({
                syncRunId: runId,
                status: 'FAILED',
                newCount,
                receivedCount,
                insertedCount,
                duplicateCount,
                confirmedCount: 0,
                errorMessage,
            });
        }

        await updateDeviceSyncStatus(device.id, {
            status: 'FAILED',
            lastError: errorMessage,
            lastNewCount: newCount,
            lastInsertedCount: insertedCount,
            syncFrequencyMinutes: device.syncFrequencyMinutes,
        });

        return {
            runId,
            status: 'FAILED',
            newCount,
            receivedCount,
            insertedCount,
            duplicateCount,
            confirmedCount: 0,
            errorMessage,
        };
    } finally {
        await releaseDeviceSyncLock(device.id, owner);
    }
}

function createLockOwner(deviceId: number): string {
    return `attendance-sync:${deviceId}:${process.pid}:${Date.now()}`;
}

async function rollbackTransaction(transaction: InstanceType<typeof sql.Transaction>): Promise<void> {
    try {
        await transaction.rollback();
    } catch {
        // Preserve the original insert/commit failure for sync status reporting.
    }
}

function successResult(
    runId: number,
    counts: Pick<
        RunAttendanceIncrementalSyncResult,
        'newCount' | 'receivedCount' | 'insertedCount' | 'duplicateCount' | 'confirmedCount'
    >
): RunAttendanceIncrementalSyncResult {
    return {
        runId,
        status: 'SUCCESS',
        ...counts,
        errorMessage: null,
    };
}
