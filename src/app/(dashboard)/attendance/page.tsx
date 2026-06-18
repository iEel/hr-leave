'use client';

import type { AttendanceDaySummary } from '@/lib/attendance/repository';
import { CalendarDays, Clock3, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function formatDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCurrentMonth(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(month: string): { from: string; to: string } {
    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(year, monthNumber - 1, 1);
    const end = new Date(year, monthNumber, 0);

    return {
        from: formatDate(start),
        to: formatDate(end),
    };
}

export default function AttendancePage() {
    const initialMonth = useMemo(() => getCurrentMonth(), []);
    const initialRange = useMemo(() => getMonthRange(initialMonth), [initialMonth]);
    const [month, setMonth] = useState(initialMonth);
    const [from, setFrom] = useState(initialRange.from);
    const [to, setTo] = useState(initialRange.to);
    const [checkInFrom, setCheckInFrom] = useState('');
    const [days, setDays] = useState<AttendanceDaySummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAttendance = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            if (checkInFrom) params.set('checkInFrom', checkInFrom);

            const response = await fetch(`/api/attendance/me?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to fetch attendance');
            }

            setDays(data.days ?? []);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch attendance');
            setDays([]);
        } finally {
            setIsLoading(false);
        }
    }, [checkInFrom, from, to]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    const handleMonthChange = (value: string) => {
        setMonth(value);
        if (value) {
            const range = getMonthRange(value);
            setFrom(range.from);
            setTo(range.to);
        }
    };

    const clearFilters = () => {
        const currentMonth = getCurrentMonth();
        const range = getMonthRange(currentMonth);

        setMonth(currentMonth);
        setFrom(range.from);
        setTo(range.to);
        setCheckInFrom('');
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เวลาเข้า-ออก</h1>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">เดือน</span>
                        <input
                            type="month"
                            value={month}
                            onChange={(event) => handleMonthChange(event.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">จากวันที่</span>
                        <input
                            type="date"
                            value={from}
                            onChange={(event) => setFrom(event.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ถึงวันที่</span>
                        <input
                            type="date"
                            value={to}
                            onChange={(event) => setTo(event.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
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

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <Clock3 className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-900 dark:text-white">รายการเวลาเข้า-ออก</h2>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
                ) : error ? (
                    <div className="p-8 text-center text-red-600">{error}</div>
                ) : days.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        ยังไม่พบข้อมูลเวลาเข้า-ออก
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {days.map((day) => (
                                    <tr key={day.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                            {day.date}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {day.checkIn ?? '--:--'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {day.checkOut ?? '--:--'}
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
