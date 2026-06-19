'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Database,
    Edit2,
    Fingerprint,
    Loader2,
    Plus,
    RefreshCw,
    Save,
    Shield,
    Wifi,
    X,
} from 'lucide-react';
import {
    findCompletedBackfillRun,
    type AttendanceSyncRunSummary,
} from '@/lib/attendance/admin-ui';

interface AttendanceDevice {
    id: number;
    name: string;
    branchName: string | null;
    host: string;
    port: number;
    hasPass: boolean;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    nextSyncAt: string | null;
    lastSyncStatus: string | null;
    lastError: string | null;
    lastNewCount: number | null;
    lastInsertedCount: number | null;
}

interface AttendanceSyncRun {
    id: number;
    deviceId: number;
    deviceName: string | null;
    mode: string;
    status: string;
    startedAt: string;
    newCount: number | null;
    insertedCount: number | null;
    duplicateCount: number | null;
    confirmedCount: number | null;
    errorMessage: string | null;
}

interface SyncRunPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
}

interface SyncRunFilters {
    deviceId: string;
    mode: string;
    status: string;
    periodDays: string;
    limit: string;
}

interface DeviceFormState {
    id: number | null;
    name: string;
    branchName: string;
    ipAddress: string;
    port: string;
    passCode: string;
    syncEnabled: boolean;
    syncFrequencyMinutes: string;
    timeoutMs: string;
    retryCount: string;
    isActive: boolean;
}

const defaultFormState: DeviceFormState = {
    id: null,
    name: '',
    branchName: '',
    ipAddress: '',
    port: '5005',
    passCode: '0',
    syncEnabled: false,
    syncFrequencyMinutes: '60',
    timeoutMs: '10000',
    retryCount: '2',
    isActive: true,
};

const defaultSyncRunFilters: SyncRunFilters = {
    deviceId: 'ALL',
    mode: 'ALL',
    status: 'ALL',
    periodDays: 'ALL',
    limit: '20',
};

const defaultSyncRunPagination: SyncRunPagination = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
};

const syncStatusClasses: Record<string, string> = {
    SUCCESS: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PARTIAL: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
};

function formatDateTime(value: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function getErrorMessage(data: unknown, fallback: string) {
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        return data.error;
    }
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
        return data.message;
    }
    if (
        data &&
        typeof data === 'object' &&
        'result' in data &&
        data.result &&
        typeof data.result === 'object' &&
        'errorMessage' in data.result &&
        typeof data.result.errorMessage === 'string'
    ) {
        return data.result.errorMessage;
    }
    return fallback;
}

type DeviceAction = 'test' | 'sync' | 'backfill';

const BACKFILL_RECOVERY_POLL_ATTEMPTS = 40;
const BACKFILL_RECOVERY_POLL_DELAY_MS = 3000;

function createFormState(device?: AttendanceDevice): DeviceFormState {
    if (!device) return defaultFormState;

    return {
        id: device.id,
        name: device.name,
        branchName: device.branchName ?? '',
        ipAddress: device.host,
        port: String(device.port),
        passCode: '',
        syncEnabled: device.syncEnabled,
        syncFrequencyMinutes: String(device.syncFrequencyMinutes),
        timeoutMs: String(device.timeoutMs),
        retryCount: String(device.retryCount),
        isActive: device.isActive,
    };
}

function parseIntegerField(value: string, min: number, max: number, label: string): { value: number } | { error: string } {
    const trimmed = value.trim();
    const parsed = Number(trimmed);

    if (!trimmed || !Number.isInteger(parsed) || parsed < min || parsed > max) {
        return { error: `${label} ต้องเป็นตัวเลขจำนวนเต็มระหว่าง ${min}-${max}` };
    }

    return { value: parsed };
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function buildSyncRunsSearchParams(filters: SyncRunFilters, page: number) {
    const params = new URLSearchParams({
        page: String(page),
        limit: filters.limit,
    });

    if (filters.deviceId !== 'ALL') params.set('deviceId', filters.deviceId);
    if (filters.mode !== 'ALL') params.set('mode', filters.mode);
    if (filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.periodDays !== 'ALL') params.set('periodDays', filters.periodDays);

    return params;
}

function getVisibleSyncRunRange(pagination: SyncRunPagination) {
    if (pagination.total === 0) {
        return { start: 0, end: 0 };
    }

    return {
        start: (pagination.page - 1) * pagination.limit + 1,
        end: Math.min(pagination.page * pagination.limit, pagination.total),
    };
}

function hasActiveSyncRunFilters(filters: SyncRunFilters) {
    return filters.deviceId !== 'ALL' || filters.mode !== 'ALL' || filters.status !== 'ALL' || filters.periodDays !== 'ALL';
}
function validateDeviceForm(form: DeviceFormState): { payload: Record<string, string | number | boolean | null> } | { error: string } {
    if (!form.name.trim()) {
        return { error: 'กรุณาระบุชื่อเครื่อง' };
    }

    if (!form.ipAddress.trim()) {
        return { error: 'กรุณาระบุ IP Address' };
    }

    const port = parseIntegerField(form.port, 1, 65535, 'Port');
    if ('error' in port) {
        return port;
    }

    const syncFrequencyMinutes = parseIntegerField(form.syncFrequencyMinutes, 15, 120, 'รอบ Sync');
    if ('error' in syncFrequencyMinutes) {
        return syncFrequencyMinutes;
    }
    if (![15, 30, 60, 120].includes(syncFrequencyMinutes.value)) {
        return { error: 'รอบ Sync ต้องเป็น 15, 30, 60 หรือ 120 นาที' };
    }

    const timeoutMs = parseIntegerField(form.timeoutMs, 1000, 60000, 'Timeout');
    if ('error' in timeoutMs) {
        return timeoutMs;
    }

    const retryCount = parseIntegerField(form.retryCount, 0, 5, 'Retry Count');
    if ('error' in retryCount) {
        return retryCount;
    }

    const payload: Record<string, string | number | boolean | null> = {
        id: form.id,
        name: form.name.trim(),
        branchName: form.branchName.trim(),
        ipAddress: form.ipAddress.trim(),
        port: port.value,
        syncEnabled: form.syncEnabled,
        syncFrequencyMinutes: syncFrequencyMinutes.value,
        timeoutMs: timeoutMs.value,
        retryCount: retryCount.value,
        isActive: form.isActive,
    };

    if (form.id == null || form.passCode.trim().length > 0) {
        payload.passCode = form.passCode.trim() || '0';
    }

    return { payload };
}

export default function AttendanceDevicesPage() {
    const { data: session, status } = useSession();
    const [devices, setDevices] = useState<AttendanceDevice[]>([]);
    const [syncRuns, setSyncRuns] = useState<AttendanceSyncRun[]>([]);
    const [syncRunFilters, setSyncRunFilters] = useState<SyncRunFilters>(defaultSyncRunFilters);
    const [syncRunPage, setSyncRunPage] = useState(1);
    const [syncRunPagination, setSyncRunPagination] = useState<SyncRunPagination>(defaultSyncRunPagination);
    const [loadingDevices, setLoadingDevices] = useState(true);
    const [loadingRuns, setLoadingRuns] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<DeviceFormState>(defaultFormState);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isAdmin = session?.user?.role === 'ADMIN';

    const fetchDevices = useCallback(async () => {
        setLoadingDevices(true);
        try {
            const res = await fetch('/api/admin/attendance/devices');
            const data: unknown = await res.json();
            if (
                data &&
                typeof data === 'object' &&
                'success' in data &&
                data.success === true &&
                'devices' in data &&
                Array.isArray(data.devices)
            ) {
                setDevices(data.devices as AttendanceDevice[]);
            } else {
                setMessage({ type: 'error', text: getErrorMessage(data, 'ไม่สามารถโหลดข้อมูลเครื่องบันทึกเวลาได้') });
            }
        } catch {
            setMessage({ type: 'error', text: 'ไม่สามารถโหลดข้อมูลเครื่องบันทึกเวลาได้' });
        } finally {
            setLoadingDevices(false);
        }
    }, []);

    const fetchSyncRuns = useCallback(async (options: {
        showLoading?: boolean;
        showError?: boolean;
        filters?: SyncRunFilters;
        page?: number;
        updateState?: boolean;
    } = {}) => {
        const {
            showLoading = true,
            showError = true,
            filters = syncRunFilters,
            page = syncRunPage,
            updateState = true,
        } = options;

        if (showLoading) {
            setLoadingRuns(true);
        }

        try {
            const params = buildSyncRunsSearchParams(filters, page);
            const res = await fetch(`/api/admin/attendance/sync-runs?${params.toString()}`);
            const data: unknown = await res.json();
            if (
                data &&
                typeof data === 'object' &&
                'success' in data &&
                data.success === true &&
                'runs' in data &&
                Array.isArray(data.runs)
            ) {
                const runs = data.runs as AttendanceSyncRun[];

                if (updateState) {
                    setSyncRuns(runs);
                    if ('pagination' in data && data.pagination && typeof data.pagination === 'object') {
                        setSyncRunPagination(data.pagination as SyncRunPagination);
                    } else {
                        setSyncRunPagination(defaultSyncRunPagination);
                    }
                }

                return runs;
            }

            if (showError) {
                setMessage({ type: 'error', text: getErrorMessage(data, 'ไม่สามารถโหลดประวัติ Sync ได้') });
            }
        } catch {
            if (showError) {
                setMessage({ type: 'error', text: 'ไม่สามารถโหลดประวัติ Sync ได้' });
            }
        } finally {
            if (showLoading) {
                setLoadingRuns(false);
            }
        }

        return [];
    }, [syncRunFilters, syncRunPage]);

    useEffect(() => {
        if (!isAdmin) return;
        fetchDevices();
    }, [isAdmin, fetchDevices]);

    useEffect(() => {
        if (!isAdmin) return;
        fetchSyncRuns();
    }, [isAdmin, fetchSyncRuns]);

    const openNewForm = () => {
        setForm({ ...defaultFormState });
        setShowForm(true);
        setMessage(null);
    };

    const openEditForm = (device: AttendanceDevice) => {
        setForm(createFormState(device));
        setShowForm(true);
        setMessage(null);
    };

    const updateSyncRunFilter = <K extends keyof SyncRunFilters>(field: K, value: SyncRunFilters[K]) => {
        setSyncRunFilters(prev => ({ ...prev, [field]: value }));
        setSyncRunPage(1);
    };

    const resetSyncRunFilters = () => {
        setSyncRunFilters(defaultSyncRunFilters);
        setSyncRunPage(1);
    };

    const updateForm = <K extends keyof DeviceFormState>(field: K, value: DeviceFormState[K]) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const saveDevice = async () => {
        setMessage(null);

        const validation = validateDeviceForm(form);
        if ('error' in validation) {
            setMessage({ type: 'error', text: validation.error });
            return;
        }

        setSaving(true);

        try {
            const res = await fetch('/api/admin/attendance/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validation.payload),
            });
            const data: unknown = await res.json();

            if (res.ok && data && typeof data === 'object' && 'success' in data && data.success === true) {
                setMessage({ type: 'success', text: 'บันทึกเครื่องบันทึกเวลาเรียบร้อย' });
                setShowForm(false);
                await fetchDevices();
            } else {
                setMessage({ type: 'error', text: getErrorMessage(data, 'ไม่สามารถบันทึกเครื่องบันทึกเวลาได้') });
            }
        } catch {
            setMessage({ type: 'error', text: 'ไม่สามารถบันทึกเครื่องบันทึกเวลาได้' });
        } finally {
            setSaving(false);
        }
    };

    const waitForBackfillCompletion = async (
        deviceId: number,
        requestStartedAt: Date
    ): Promise<AttendanceSyncRunSummary | null> => {
        for (let attempt = 0; attempt < BACKFILL_RECOVERY_POLL_ATTEMPTS; attempt += 1) {
            if (attempt > 0) {
                await delay(BACKFILL_RECOVERY_POLL_DELAY_MS);
            }

            const runs = await fetchSyncRuns({
                showLoading: false,
                showError: false,
                updateState: false,
                page: 1,
                filters: {
                    ...defaultSyncRunFilters,
                    deviceId: String(deviceId),
                    mode: 'BACKFILL',
                    limit: '20',
                },
            });
            const completedRun = findCompletedBackfillRun(runs, deviceId, requestStartedAt);
            if (completedRun) {
                return completedRun;
            }
        }

        return null;
    };

    const recoverBackfillResult = async (
        deviceId: number,
        requestStartedAt: Date,
        fallbackErrorText: string
    ) => {
        const recoveredRun = await waitForBackfillCompletion(deviceId, requestStartedAt);
        if (!recoveredRun) {
            return false;
        }

        await fetchDevices();
        if (recoveredRun.status === 'SUCCESS') {
            setMessage({ type: 'success', text: 'Backfill ประวัติทั้งหมดเรียบร้อย' });
        } else {
            setMessage({ type: 'error', text: recoveredRun.errorMessage || fallbackErrorText });
        }

        return true;
    };

    const runDeviceAction = async (deviceId: number, action: DeviceAction) => {
        const successText: Record<DeviceAction, string> = {
            test: 'ทดสอบการเชื่อมต่อสำเร็จ',
            sync: 'Sync เครื่องบันทึกเวลาเรียบร้อย',
            backfill: 'Backfill ประวัติทั้งหมดเรียบร้อย',
        };
        const errorText: Record<DeviceAction, string> = {
            test: 'ทดสอบการเชื่อมต่อไม่สำเร็จ',
            sync: 'Sync ไม่สำเร็จ',
            backfill: 'ไม่สามารถยืนยันผล Backfill ได้ กรุณาตรวจสอบประวัติ Sync ล่าสุด',
        };

        if (
            action === 'backfill' &&
            !window.confirm('Backfill จะอ่านประวัติทั้งหมดจากเครื่องและอาจใช้เวลาหลายนาที ต้องการเริ่มหรือไม่?')
        ) {
            return;
        }

        const requestStartedAt = new Date();
        const actionKey = `${action}-${deviceId}`;
        setActionLoading(prev => ({ ...prev, [actionKey]: true }));
        setMessage(null);

        try {
            const res = await fetch(`/api/admin/attendance/devices/${deviceId}/${action}`, { method: 'POST' });
            const data: unknown = await res.json();

            if (res.ok && data && typeof data === 'object' && 'success' in data && data.success === true) {
                setMessage({
                    type: 'success',
                    text: successText[action],
                });
                await fetchDevices();
                await fetchSyncRuns();
            } else {
                if (action === 'backfill' && await recoverBackfillResult(deviceId, requestStartedAt, errorText[action])) {
                    return;
                }

                setMessage({
                    type: 'error',
                    text: getErrorMessage(data, errorText[action]),
                });
            }
        } catch {
            if (action === 'backfill' && await recoverBackfillResult(deviceId, requestStartedAt, errorText[action])) {
                return;
            }

            setMessage({
                type: 'error',
                text: errorText[action],
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [actionKey]: false }));
        }
    };

    const visibleSyncRunRange = getVisibleSyncRunRange(syncRunPagination);
    const syncRunsAreFiltered = hasActiveSyncRunFilters(syncRunFilters);

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="p-8 text-center">
                <Shield className="w-16 h-16 mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-gray-500">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                        <Fingerprint className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เครื่องบันทึกเวลา</h1>
                        <p className="text-gray-500">ตั้งค่าเครื่อง HIP และตรวจสอบสถานะการ Sync ข้อมูลเวลาเข้าออก</p>
                    </div>
                </div>
                <button
                    onClick={openNewForm}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    เพิ่มเครื่อง
                </button>
            </div>

            {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700'
                    }`}>
                    {message.type === 'success' ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-red-600" />}
                    <p className={message.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}>{message.text}</p>
                </div>
            )}

            {showForm && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {form.id == null ? 'เพิ่มเครื่องบันทึกเวลา' : 'แก้ไขเครื่องบันทึกเวลา'}
                            </h2>
                            <p className="text-sm text-gray-500">
                                {form.id == null ? 'ระบุข้อมูลเครื่องและรอบ Sync' : 'ปล่อยรหัสผ่านว่างเพื่อใช้ค่าเดิม'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowForm(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อเครื่อง</span>
                            <input
                                value={form.name}
                                onChange={e => updateForm('name', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สาขา</span>
                            <input
                                value={form.branchName}
                                onChange={e => updateForm('branchName', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">IP Address</span>
                            <input
                                value={form.ipAddress}
                                onChange={e => updateForm('ipAddress', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Port</span>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={form.port}
                                onChange={e => updateForm('port', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pass Code</span>
                            <input
                                type="password"
                                value={form.passCode}
                                placeholder={form.id == null ? '0' : 'ปล่อยว่างเพื่อใช้ค่าเดิม'}
                                onChange={e => updateForm('passCode', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {form.id != null && <p className="mt-1 text-xs text-gray-500">ปล่อยว่างเพื่อใช้ค่าเดิม</p>}
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รอบ Sync</span>
                            <select
                                value={form.syncFrequencyMinutes}
                                onChange={e => updateForm('syncFrequencyMinutes', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="15">15 นาที</option>
                                <option value="30">30 นาที</option>
                                <option value="60">60 นาที</option>
                                <option value="120">120 นาที</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeout (ms)</span>
                            <input
                                type="number"
                                min={1000}
                                max={60000}
                                value={form.timeoutMs}
                                onChange={e => updateForm('timeoutMs', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Retry Count</span>
                            <input
                                type="number"
                                min={0}
                                max={5}
                                value={form.retryCount}
                                onChange={e => updateForm('retryCount', e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                    </div>

                    <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <button
                                type="button"
                                onClick={() => updateForm('syncEnabled', !form.syncEnabled)}
                                className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.syncEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.syncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </span>
                                เปิด Sync อัตโนมัติ
                            </button>
                            <button
                                type="button"
                                onClick={() => updateForm('isActive', !form.isActive)}
                                className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                </span>
                                เปิดใช้งานเครื่อง
                            </button>
                        </div>
                        <button
                            onClick={saveDevice}
                            disabled={saving}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            บันทึก
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายการเครื่อง</h2>
                        <p className="text-sm text-gray-500">เครื่องที่ใช้ดึงข้อมูลเวลาเข้าออกจาก HIP</p>
                    </div>
                    <button
                        onClick={fetchDevices}
                        disabled={loadingDevices}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loadingDevices ? 'animate-spin' : ''}`} />
                        รีเฟรช
                    </button>
                </div>

                {loadingDevices ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : devices.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium text-gray-700 dark:text-gray-300">ยังไม่มีเครื่องบันทึกเวลา</p>
                        <p className="text-sm">กดเพิ่มเครื่องเพื่อเริ่มตั้งค่า HIP Sync</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">เครื่อง</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">สาขา</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">IP/Port</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Sync</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">สถานะล่าสุด</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {devices.map(device => {
                                    const testKey = `test-${device.id}`;
                                    const syncKey = `sync-${device.id}`;
                                    const backfillKey = `backfill-${device.id}`;
                                    return (
                                        <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${device.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</p>
                                                        <p className="text-xs text-gray-500">{device.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{device.branchName || '-'}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{device.host}:{device.port}</td>
                                            <td className="py-3 px-4">
                                                <div className="space-y-1">
                                                    <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${device.syncEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                        {device.syncEnabled ? `ทุก ${device.syncFrequencyMinutes} นาที` : 'ปิด Sync'}
                                                    </span>
                                                    <p className="text-xs text-gray-500">ถัดไป: {formatDateTime(device.nextSyncAt)}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="space-y-1">
                                                    <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${device.lastSyncStatus ? syncStatusClasses[device.lastSyncStatus] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                        {device.lastSyncStatus || 'ยังไม่เคย Sync'}
                                                    </span>
                                                    <p className="text-xs text-gray-500">{formatDateTime(device.lastSyncAt)}</p>
                                                    {device.lastError && <p className="text-xs text-red-600 dark:text-red-300 max-w-xs truncate">{device.lastError}</p>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openEditForm(device)}
                                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                        title="แก้ไข"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => runDeviceAction(device.id, 'test')}
                                                        disabled={actionLoading[testKey]}
                                                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                                                        title="ทดสอบการเชื่อมต่อ"
                                                    >
                                                        {actionLoading[testKey] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => runDeviceAction(device.id, 'sync')}
                                                        disabled={actionLoading[syncKey]}
                                                        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Sync ตอนนี้"
                                                    >
                                                        {actionLoading[syncKey] ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => runDeviceAction(device.id, 'backfill')}
                                                        disabled={actionLoading[backfillKey]}
                                                        className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Backfill ประวัติทั้งหมด"
                                                    >
                                                        {actionLoading[backfillKey] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="flex flex-col gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติ Sync ล่าสุด</h2>
                            <p className="text-sm text-gray-500">ผลการดึงข้อมูลจากเครื่องบันทึกเวลา</p>
                        </div>
                    </div>
                    <button
                        onClick={() => fetchSyncRuns()}
                        disabled={loadingRuns}
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        <RefreshCw className={`w-4 h-4 ${loadingRuns ? 'animate-spin' : ''}`} />
                        รีเฟรช
                    </button>
                </div>

                <div className="grid gap-3 border-b border-gray-100 bg-gray-50/70 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="space-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        เครื่อง
                        <select
                            value={syncRunFilters.deviceId}
                            onChange={event => updateSyncRunFilter('deviceId', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="ALL">ทุกเครื่อง</option>
                            {devices.map(device => (
                                <option key={device.id} value={String(device.id)}>{device.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Mode
                        <select
                            value={syncRunFilters.mode}
                            onChange={event => updateSyncRunFilter('mode', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="ALL">ทั้งหมด</option>
                            <option value="INCREMENTAL">Incremental</option>
                            <option value="BACKFILL">Backfill</option>
                            <option value="TEST">Test</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Status
                        <select
                            value={syncRunFilters.status}
                            onChange={event => updateSyncRunFilter('status', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="ALL">ทั้งหมด</option>
                            <option value="SUCCESS">Success</option>
                            <option value="FAILED">Failed</option>
                            <option value="RUNNING">Running</option>
                            <option value="PARTIAL">Partial</option>
                            <option value="SKIPPED">Skipped</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        ช่วงเวลา
                        <select
                            value={syncRunFilters.periodDays}
                            onChange={event => updateSyncRunFilter('periodDays', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="ALL">ทั้งหมด</option>
                            <option value="7">7 วัน</option>
                            <option value="30">30 วัน</option>
                            <option value="90">90 วัน</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        แสดง
                        <select
                            value={syncRunFilters.limit}
                            onChange={event => updateSyncRunFilter('limit', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="10">10 รายการ</option>
                            <option value="20">20 รายการ</option>
                            <option value="50">50 รายการ</option>
                        </select>
                    </label>
                    <div className="flex items-end">
                        <button
                            onClick={resetSyncRunFilters}
                            disabled={!syncRunsAreFiltered && syncRunFilters.limit === '20'}
                            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                            ล้างตัวกรอง
                        </button>
                    </div>
                </div>

                {loadingRuns ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : syncRuns.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>{syncRunsAreFiltered ? 'ไม่พบประวัติตามตัวกรอง' : 'ยังไม่มีประวัติ Sync'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">เครื่อง</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Mode</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Started</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">New</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Inserted</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Duplicate</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Confirmed</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {syncRuns.map(run => (
                                    <tr key={run.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">{run.deviceName || `Device #${run.deviceId}`}</td>
                                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{run.mode}</td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${syncStatusClasses[run.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {run.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(run.startedAt)}</td>
                                        <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-300">{run.newCount ?? 0}</td>
                                        <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-300">{run.insertedCount ?? 0}</td>
                                        <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-300">{run.duplicateCount ?? 0}</td>
                                        <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-300">{run.confirmedCount ?? 0}</td>
                                        <td className="py-3 px-4 text-sm text-red-600 dark:text-red-300 max-w-xs truncate">{run.errorMessage || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        แสดง {visibleSyncRunRange.start}-{visibleSyncRunRange.end} จาก {syncRunPagination.total} รายการ
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSyncRunPage(page => Math.max(1, page - 1))}
                            disabled={!syncRunPagination.hasPrevious || loadingRuns}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            ก่อนหน้า
                        </button>
                        <span className="min-w-20 text-center text-gray-500 dark:text-gray-400">
                            หน้า {syncRunPagination.page}/{syncRunPagination.totalPages}
                        </span>
                        <button
                            onClick={() => setSyncRunPage(page => page + 1)}
                            disabled={!syncRunPagination.hasNext || loadingRuns}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                            ถัดไป
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
