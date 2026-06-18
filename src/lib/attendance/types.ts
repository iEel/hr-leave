export type AttendanceProtocol = 'HIP_CMIF68S';

export type AttendanceVerifyType = 'FP' | 'FACE' | 'UNKNOWN_0x30' | `UNKNOWN_0x${string}`;

export type AttendanceSyncMode = 'INCREMENTAL' | 'BACKFILL' | 'TEST';

export type AttendanceSyncStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type AttendanceTriggerType = 'MANUAL' | 'CRON';

export interface AttendanceDeviceConfig {
    protocol: AttendanceProtocol;
    host: string;
    port: number;
    timeoutMs?: number;
    sequence?: number;
}

export interface AttendanceDevice {
    id: string;
    name: string;
    config: AttendanceDeviceConfig;
    enabled: boolean;
    lastSyncAt?: string | null;
    lastRecordTime?: string | null;
}

export interface DecodedHipAttendanceRecord {
    userKey: number;
    employeeId: string;
    verifyType: AttendanceVerifyType;
    verifyCode: number;
    yearCode: number;
    rawRecordTime: string;
    recordTime: string;
}

export interface AttendanceSyncResult {
    deviceId: string;
    protocol: AttendanceProtocol;
    mode: AttendanceSyncMode;
    status: AttendanceSyncStatus;
    triggerType: AttendanceTriggerType;
    startedAt: string;
    finishedAt?: string | null;
    fetchedCount: number;
    insertedCount: number;
    skippedCount: number;
    errorMessage?: string | null;
    lastRecordTime?: string | null;
}
