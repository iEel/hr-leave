'use client';

import type { AttendanceDaySummary } from '@/lib/attendance/repository';
import { CalendarDays, Clock3, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type QuickFilter = 'ALL' | 'LATE' | 'INCOMPLETE';

interface AttendanceApiSettings {
    workStartTime: string;
    breakStartTime: string;
    weekdayGraceMinutes: number;
    periodStartDay: number;
}

interface AttendanceApiPeriod {
    month: string;
    from: string;
    to: string;
}

interface AttendanceApiResponse {
    success: boolean;
    error?: string;
    days?: AttendanceDaySummary[];
    settings?: AttendanceApiSettings;
    period?: AttendanceApiPeriod;
}

interface StatusBadge {
    label: string;
    tone: 'subtle' | 'warning';
}

function getCurrentMonth(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function formatThaiDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function addMinutes(value: string, minutes: number): string {
    const [hours, minuteValue] = value.split(':').map(Number);
    const totalMinutes = ((hours * 60) + minuteValue + minutes) % 1440;
    const normalizedMinutes = totalMinutes < 0 ? totalMinutes + 1440 : totalMinutes;
    const nextHours = Math.floor(normalizedMinutes / 60);
    const nextMinutes = normalizedMinutes % 60;

    return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

function getStatusBadges(day: AttendanceDaySummary): StatusBadge[] {
    const badges: StatusBadge[] = [];

    if (day.isLate) {
        badges.push({ label: 'เข้าเกินเวลา', tone: 'warning' });
    }

    if (day.missingCheckIn) {
        badges.push({ label: 'ขาดเวลาเข้า', tone: 'warning' });
    }

    if (day.missingCheckOut) {
        badges.push({ label: 'ขาดเวลาออก', tone: 'warning' });
    }

    if (day.dayType === 'WORKING_SATURDAY') {
        badges.push({ label: 'เสาร์ทำงาน', tone: 'subtle' });
    }

    if (day.dayType === 'NON_WORKDAY') {
        badges.push({ label: 'วันหยุด', tone: 'subtle' });
    }

    return badges.length > 0 ? badges : [{ label: 'ปกติ', tone: 'subtle' }];
}

function getBadgeClassName(tone: StatusBadge['tone']): string {
    if (tone === 'warning') {
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300';
    }

    return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
}

export default function AttendancePage() {
    const initialMonth = useMemo(() => getCurrentMonth(), []);
    const [periodMonth, setPeriodMonth] = useState(initialMonth);
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
    const [checkInFrom, setCheckInFrom] = useState('');
    const [days, setDays] = useState<AttendanceDaySummary[]>([]);
    const [settings, setSettings] = useState<AttendanceApiSettings | null>(null);
    const [period, setPeriod] = useState<AttendanceApiPeriod | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAttendance = useCallback(async (signal: AbortSignal) => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (periodMonth) params.set('period', periodMonth);
            if (checkInFrom) params.set('checkInFrom', checkInFrom);

            const response = await fetch(`/api/attendance/me?${params.toString()}`, { signal });
            const data = await response.json() as AttendanceApiResponse;

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to fetch attendance');
            }

            if (signal.aborted) {
                return;
            }

            setDays(data.days ?? []);
            setSettings(data.settings ?? null);
            setPeriod(data.period ?? null);
        } catch (fetchError) {
            if (signal.aborted) {
                return;
            }

            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
                return;
            }

            setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch attendance');
            setDays([]);
            setSettings(null);
            setPeriod(null);
        } finally {
            if (!signal.aborted) {
                setIsLoading(false);
            }
        }
    }, [checkInFrom, periodMonth]);

    useEffect(() => {
        const controller = new AbortController();

        fetchAttendance(controller.signal);

        return () => {
            controller.abort();
        };
    }, [fetchAttendance]);

    const clearFilters = () => {
        setPeriodMonth(getCurrentMonth());
        setCheckInFrom('');
        setQuickFilter('ALL');
    };

    const summary = useMemo(() => ({
        total: days.length,
        late: days.filter((day) => day.isLate).length,
        incomplete: days.filter((day) => day.isIncomplete).length,
    }), [days]);

    const filteredDays = useMemo(() => {
        if (quickFilter === 'LATE') {
            return days.filter((day) => day.isLate);
        }

        if (quickFilter === 'INCOMPLETE') {
            return days.filter((day) => day.isIncomplete);
        }

        return days;
    }, [days, quickFilter]);

    const normalLateAfterTime = settings
        ? addMinutes(settings.workStartTime, settings.weekdayGraceMinutes)
        : null;

    const emptyMessage = days.length === 0 || quickFilter === 'ALL'
        ? 'ยังไม่พบข้อมูลเวลาเข้า-ออกจาก HIP ในรอบนี้'
        : quickFilter === 'LATE'
            ? 'ไม่พบวันที่เข้าเกินเวลาในรอบนี้'
            : 'ไม่พบวันที่ข้อมูลไม่ครบในรอบนี้';

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เวลาเข้า-ออก</h1>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">รอบคำนวณเดือน</span>
                        <input
                            type="month"
                            value={periodMonth}
                            onChange={(event) => setPeriodMonth(event.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                        {period ? (
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                รอบ {formatThaiDate(period.from)} - {formatThaiDate(period.to)}
                            </span>
                        ) : null}
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">เวลาเข้า ตั้งแต่</span>
                        <input
                            type="time"
                            value={checkInFrom}
                            onChange={(event) => setCheckInFrom(event.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </label>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            ล้างตัวกรอง
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">วันที่มีข้อมูล</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{summary.total}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เข้าเกินเวลา</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-300">{summary.late}</p>
                    {normalLateAfterTime ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">วันปกติหลัง {normalLateAfterTime}</p>
                    ) : null}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">ข้อมูลไม่ครบ</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{summary.incomplete}</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <Clock3 className="w-5 h-5 text-blue-600" />
                        <h2 className="font-semibold text-gray-900 dark:text-white">รายการเวลาเข้า-ออก</h2>
                    </div>
                    <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/60 sm:w-auto">
                        {([
                            ['ALL', 'ทั้งหมด'],
                            ['LATE', 'เข้าเกินเวลา'],
                            ['INCOMPLETE', 'ข้อมูลไม่ครบ'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={quickFilter === value}
                                onClick={() => setQuickFilter(value)}
                                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                                    quickFilter === value
                                        ? 'bg-white text-blue-700 shadow-sm dark:bg-gray-800 dark:text-blue-300'
                                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
                ) : error ? (
                    <div className="p-8 text-center text-red-600">{error}</div>
                ) : filteredDays.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        {emptyMessage}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        วันที่
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        เวลาเข้า
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        เวลาออก
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        สถานะ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredDays.map((day) => (
                                    <tr key={day.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                            {formatThaiDate(day.date)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {day.checkIn ?? '--:--'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {day.checkOut ?? '--:--'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {getStatusBadges(day).map((badge) => (
                                                    <span
                                                        key={`${day.date}-${badge.label}`}
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getBadgeClassName(badge.tone)}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
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
