'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
    AlertTriangle,
    Check,
    Clock,
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
    status: string;
    startedAt: string;
    newCount: number | null;
    insertedCount: number | null;
    duplicateCount: number | null;
    confirmedCount: number | null;
    errorMessage: string | null;
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
    return fallback;
}

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
    const [loadingDevices, setLoadingDevices] = useState(true);
    const [loadingRuns, setLoadingRuns] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<DeviceFormState>(defaultFormState);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isAdmin = session?.user?.role === 'ADMIN';

    const fetchDevices = async () => {
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
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถโหลดข้อมูลเครื่องบันทึกเวลาได้' });
        } finally {
            setLoadingDevices(false);
        }
    };

    const fetchSyncRuns = async () => {
        setLoadingRuns(true);
        try {
            const res = await fetch('/api/admin/attendance/sync-runs');
            const data: unknown = await res.json();
            if (
                data &&
                typeof data === 'object' &&
                'success' in data &&
                data.success === true &&
                'runs' in data &&
                Array.isArray(data.runs)
            ) {
                setSyncRuns(data.runs as AttendanceSyncRun[]);
            } else {
                setMessage({ type: 'error', text: getErrorMessage(data, 'ไม่สามารถโหลดประวัติ Sync ได้') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถโหลดประวัติ Sync ได้' });
        } finally {
            setLoadingRuns(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchDevices();
        fetchSyncRuns();
    }, [isAdmin]);

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
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถบันทึกเครื่องบันทึกเวลาได้' });
        } finally {
            setSaving(false);
        }
    };

    const runDeviceAction = async (deviceId: number, action: 'test' | 'sync') => {
        const actionKey = `${action}-${deviceId}`;
        setActionLoading(prev => ({ ...prev, [actionKey]: true }));
        setMessage(null);

        try {
            const res = await fetch(`/api/admin/attendance/devices/${deviceId}/${action}`, { method: 'POST' });
            const data: unknown = await res.json();

            if (res.ok && data && typeof data === 'object' && 'success' in data && data.success === true) {
                setMessage({
                    type: 'success',
                    text: action === 'test' ? 'ทดสอบการเชื่อมต่อสำเร็จ' : 'เริ่ม Sync เครื่องบันทึกเวลาเรียบร้อย',
                });
                await fetchDevices();
                await fetchSyncRuns();
            } else {
                setMessage({
                    type: 'error',
                    text: getErrorMessage(data, action === 'test' ? 'ทดสอบการเชื่อมต่อไม่สำเร็จ' : 'Sync ไม่สำเร็จ'),
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: action === 'test' ? 'ทดสอบการเชื่อมต่อไม่สำเร็จ' : 'Sync ไม่สำเร็จ',
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [actionKey]: false }));
        }
    };

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
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติ Sync ล่าสุด</h2>
                            <p className="text-sm text-gray-500">ผลการดึงข้อมูลจากเครื่องบันทึกเวลา</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchSyncRuns}
                        disabled={loadingRuns}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loadingRuns ? 'animate-spin' : ''}`} />
                        รีเฟรช
                    </button>
                </div>

                {loadingRuns ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : syncRuns.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>ยังไม่มีประวัติ Sync</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">เครื่อง</th>
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
            </div>
        </div>
    );
}
