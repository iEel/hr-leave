'use client';

import type { AttendanceDaySummary } from '@/lib/attendance/repository';
import type { AttendanceLeaveAdjustment } from '@/lib/attendance/schedule-rules';
import { getAttendanceRowDisplay, type AttendancePunchTone } from '@/lib/attendance/display';
import { CalendarDays, Clock3, ExternalLink, FilterX, Loader2, Paperclip, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    tone: 'subtle' | 'warning' | 'danger' | 'success';
}

interface LeaveDetail {
    id: number;
    leaveRequestNo: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    startTime: string | null;
    endTime: string | null;
    timeSlot: string;
    reason: string | null;
    status: string;
    approverName: string | null;
    approvedAt: string | null;
    medicalCertificateFile: string | null;
}

interface LeaveDetailApiResponse {
    success?: boolean;
    data?: LeaveDetail;
    error?: string;
}

function getCurrentMonth(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
    VACATION: 'พักร้อน',
    SICK: 'ลาป่วย',
    PERSONAL: 'ลากิจ',
    MATERNITY: 'ลาคลอด',
    MILITARY: 'เกณฑ์ทหาร',
    ORDINATION: 'ลาบวช',
    STERILIZATION: 'ลาทำหมัน',
    TRAINING: 'ลาฝึกอบรม',
    OTHER: 'อื่นๆ',
};

const LEAVE_STATUS_LABELS: Record<string, string> = {
    PENDING: 'รออนุมัติ',
    APPROVED: 'อนุมัติ',
    REJECTED: 'ไม่อนุมัติ',
    CANCELLED: 'ยกเลิก',
};

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
    const display = getAttendanceRowDisplay(day);

    if (day.isLate) {
        badges.push({ label: display.statusLabel ?? 'สาย', tone: 'warning' });
    } else if (display.statusLabel) {
        badges.push({ label: display.statusLabel, tone: 'success' });
    }

    if (day.missingCheckIn) {
        badges.push({ label: 'ขาดเวลาเข้า', tone: 'danger' });
    }

    if (day.missingCheckOut) {
        badges.push({ label: 'ขาดเวลาออก', tone: 'danger' });
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

    if (tone === 'danger') {
        return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300';
    }

    if (tone === 'success') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300';
    }

    return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
}

function getSummaryCardClassName(filter: QuickFilter, isActive: boolean): string {
    const base = 'group rounded-xl border p-4 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900';

    if (filter === 'LATE') {
        return `${base} ${isActive
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
            : 'border-gray-100 bg-white hover:border-amber-200 hover:bg-amber-50/60 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-900/70 dark:hover:bg-amber-950/20'}`;
    }

    if (filter === 'INCOMPLETE') {
        return `${base} ${isActive
            ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'
            : 'border-gray-100 bg-white hover:border-rose-200 hover:bg-rose-50/60 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-rose-900/70 dark:hover:bg-rose-950/20'}`;
    }

    return `${base} ${isActive
        ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
        : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/60 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-900/70 dark:hover:bg-blue-950/20'}`;
}

function formatLeaveDateRange(leave: Pick<LeaveDetail, 'startDate' | 'endDate'>): string {
    return leave.startDate === leave.endDate
        ? formatThaiDate(leave.startDate)
        : `${formatThaiDate(leave.startDate)} - ${formatThaiDate(leave.endDate)}`;
}

function formatLeaveTimeRange(leave: Pick<LeaveDetail, 'isHourly' | 'startTime' | 'endTime' | 'timeSlot'>): string {
    if (leave.isHourly && leave.startTime && leave.endTime) {
        return `${leave.startTime} - ${leave.endTime}`;
    }

    if (leave.timeSlot === 'HALF_MORNING') return 'ครึ่งวันเช้า';
    if (leave.timeSlot === 'HALF_AFTERNOON') return 'ครึ่งวันบ่าย';

    return 'เต็มวัน';
}

function getLeaveChipLabel(leave: AttendanceLeaveAdjustment): string {
    return leave.isStatusAdjusting
        ? `${leave.leaveRequestNo} ใช้ปรับสถานะ`
        : leave.leaveRequestNo;
}

function getLeaveTypeLabel(leaveType: string): string {
    return LEAVE_TYPE_LABELS[leaveType] ?? leaveType;
}

function getLeaveStatusLabel(status: string): string {
    return LEAVE_STATUS_LABELS[status] ?? status;
}

function getPunchClassName(tone: AttendancePunchTone): string {
    if (tone === 'late') {
        return 'text-sm font-semibold text-amber-700 dark:text-amber-300';
    }

    if (tone === 'missing') {
        return 'inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300';
    }

    return 'text-sm text-gray-700 dark:text-gray-300';
}

function getRowClassName(day: AttendanceDaySummary): string {
    if (day.isIncomplete) {
        return 'bg-rose-50/35 hover:bg-rose-50/70 dark:bg-rose-950/10 dark:hover:bg-rose-950/20';
    }

    if (day.isLate) {
        return 'bg-amber-50/35 hover:bg-amber-50/70 dark:bg-amber-950/10 dark:hover:bg-amber-950/20';
    }

    return 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
}

export default function AttendancePage() {
    const initialMonth = useMemo(() => getCurrentMonth(), []);
    const [periodMonth, setPeriodMonth] = useState(initialMonth);
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
    const [checkInFrom, setCheckInFrom] = useState('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [days, setDays] = useState<AttendanceDaySummary[]>([]);
    const [settings, setSettings] = useState<AttendanceApiSettings | null>(null);
    const [period, setPeriod] = useState<AttendanceApiPeriod | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLeaveDetail, setSelectedLeaveDetail] = useState<LeaveDetail | null>(null);
    const [isLeaveDetailLoading, setIsLeaveDetailLoading] = useState(false);
    const [leaveDetailError, setLeaveDetailError] = useState<string | null>(null);
    const detailRequestIdRef = useRef(0);
    const detailAbortControllerRef = useRef<AbortController | null>(null);
    const leaveDetailDialogRef = useRef<HTMLDivElement | null>(null);
    const leaveDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
    const lastLeaveTriggerRef = useRef<HTMLButtonElement | null>(null);
    const isLeaveDetailOpen = selectedLeaveDetail != null || isLeaveDetailLoading || leaveDetailError != null;

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

    const openLeaveDetail = useCallback(async (leaveId: number, triggerButton: HTMLButtonElement) => {
        lastLeaveTriggerRef.current = triggerButton;
        detailAbortControllerRef.current?.abort();

        const controller = new AbortController();
        const requestId = detailRequestIdRef.current + 1;
        detailRequestIdRef.current = requestId;
        detailAbortControllerRef.current = controller;

        setSelectedLeaveDetail(null);
        setLeaveDetailError(null);
        setIsLeaveDetailLoading(true);

        try {
            const response = await fetch(`/api/leave/detail/${leaveId}`, { signal: controller.signal });
            const data = await response.json() as LeaveDetailApiResponse;

            if (controller.signal.aborted || detailRequestIdRef.current !== requestId) {
                return;
            }

            if (!response.ok || !data.success || !data.data) {
                throw new Error(data.error || 'Failed to fetch leave detail');
            }

            setSelectedLeaveDetail(data.data);
        } catch (detailError) {
            if (controller.signal.aborted || detailRequestIdRef.current !== requestId) {
                return;
            }

            setLeaveDetailError(detailError instanceof Error ? detailError.message : 'Failed to fetch leave detail');
        } finally {
            if (!controller.signal.aborted && detailRequestIdRef.current === requestId) {
                setIsLeaveDetailLoading(false);
                detailAbortControllerRef.current = null;
            }
        }
    }, []);

    const closeLeaveDetail = useCallback(() => {
        detailAbortControllerRef.current?.abort();
        detailAbortControllerRef.current = null;
        detailRequestIdRef.current += 1;
        setSelectedLeaveDetail(null);
        setLeaveDetailError(null);
        setIsLeaveDetailLoading(false);

        const triggerButton = lastLeaveTriggerRef.current;
        lastLeaveTriggerRef.current = null;
        window.requestAnimationFrame(() => {
            if (triggerButton?.isConnected) {
                triggerButton.focus();
            }
        });
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        fetchAttendance(controller.signal);

        return () => {
            controller.abort();
        };
    }, [fetchAttendance]);

    useEffect(() => {
        if (!isLeaveDetailOpen) {
            return;
        }

        if (leaveDetailCloseButtonRef.current) {
            leaveDetailCloseButtonRef.current.focus();
        } else {
            leaveDetailDialogRef.current?.focus();
        }
    }, [isLeaveDetailOpen]);

    useEffect(() => {
        if (!isLeaveDetailOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeLeaveDetail();
                return;
            }

            if (event.key === 'Tab') {
                const dialog = leaveDetailDialogRef.current;
                if (!dialog) {
                    return;
                }

                const focusableSelectors = [
                    'a[href]',
                    'button:not([disabled])',
                    'input:not([disabled])',
                    'select:not([disabled])',
                    'textarea:not([disabled])',
                    '[tabindex]:not([tabindex="-1"])',
                ].join(',');
                const focusableElements = Array.from(
                    dialog.querySelectorAll<HTMLElement>(focusableSelectors)
                ).filter((element) => element.offsetParent !== null || element === document.activeElement);

                if (focusableElements.length === 0) {
                    event.preventDefault();
                    dialog.focus();
                    return;
                }

                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];

                if (event.shiftKey && document.activeElement === firstFocusable) {
                    event.preventDefault();
                    lastFocusable.focus();
                    return;
                }

                if (!event.shiftKey && document.activeElement === lastFocusable) {
                    event.preventDefault();
                    firstFocusable.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeLeaveDetail, isLeaveDetailOpen]);

    const clearFilters = () => {
        setPeriodMonth(getCurrentMonth());
        setCheckInFrom('');
        setQuickFilter('ALL');
        setShowAdvancedFilters(false);
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
    const hasActiveFilters = periodMonth !== initialMonth || checkInFrom !== '' || quickFilter !== 'ALL';

    const summaryCards: Array<{
        filter: QuickFilter;
        label: string;
        value: number;
        detail: string;
        valueClassName: string;
    }> = [
        {
            filter: 'ALL',
            label: 'วันที่มีข้อมูล',
            value: summary.total,
            detail: 'ดูรายการทั้งหมดในรอบนี้',
            valueClassName: 'text-gray-900 dark:text-white',
        },
        {
            filter: 'LATE',
            label: 'เข้าสาย',
            value: summary.late,
            detail: normalLateAfterTime ? `วันปกติหลัง ${normalLateAfterTime}` : 'วันที่เข้าสาย',
            valueClassName: 'text-amber-600 dark:text-amber-300',
        },
        {
            filter: 'INCOMPLETE',
            label: 'ข้อมูลไม่ครบ',
            value: summary.incomplete,
            detail: 'ขาดเวลาเข้า/ออก',
            valueClassName: 'text-rose-600 dark:text-rose-300',
        },
    ];

    const emptyMessage = days.length === 0 || quickFilter === 'ALL'
        ? 'ยังไม่พบข้อมูลเวลาเข้า-ออกจาก HIP ในรอบนี้'
        : quickFilter === 'LATE'
            ? 'ไม่พบวันที่เข้าสายในรอบนี้'
            : 'ไม่พบวันที่ข้อมูลไม่ครบในรอบนี้';

    const renderPunch = (day: AttendanceDaySummary, punch: 'checkIn' | 'checkOut') => {
        const display = getAttendanceRowDisplay(day);
        const text = punch === 'checkIn' ? display.checkInText : display.checkOutText;
        const tone = punch === 'checkIn' ? display.checkInTone : display.checkOutTone;

        return (
            <div className="flex flex-col items-start gap-1">
                <span className={getPunchClassName(tone)}>{text}</span>
                {punch === 'checkIn' && display.lateMinutes != null ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        ช้า {display.lateMinutes} นาที
                    </span>
                ) : null}
            </div>
        );
    };

    const renderLeaveChips = (day: AttendanceDaySummary) => {
        if (day.relatedLeaveRequests.length === 0) {
            return null;
        }

        return day.relatedLeaveRequests.map((leave) => (
            <button
                key={`${day.date}-${leave.leaveRequestId}`}
                type="button"
                onClick={(event) => openLeaveDetail(leave.leaveRequestId, event.currentTarget)}
                className={`attendance-leave-chip inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${leave.isStatusAdjusting
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60'}`}
                title={`${leave.label} ${getLeaveTypeLabel(leave.leaveType)}`}
            >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{getLeaveChipLabel(leave)}</span>
            </button>
        ));
    };
    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เวลาเข้า-ออก</h1>
                {period ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        รอบ {formatThaiDate(period.from)} - {formatThaiDate(period.to)}
                    </p>
                ) : null}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <label className="w-full max-w-sm space-y-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">รอบคำนวณเดือน</span>
                        <input
                            type="month"
                            value={periodMonth}
                            onChange={(event) => setPeriodMonth(event.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            aria-expanded={showAdvancedFilters}
                            onClick={() => setShowAdvancedFilters((isOpen) => !isOpen)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto"
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            ตัวกรองเพิ่มเติม
                            {checkInFrom ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                    เวลาเข้า &gt;= {checkInFrom}
                                </span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={clearFilters}
                            disabled={!hasActiveFilters}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto"
                        >
                            <FilterX className="h-4 w-4" />
                            ล้างตัวกรอง
                        </button>
                    </div>
                </div>

                {showAdvancedFilters ? (
                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                        <label className="block max-w-sm space-y-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">เวลาเข้าเริ่มตั้งแต่</span>
                            <input
                                type="time"
                                value={checkInFrom}
                                onChange={(event) => setCheckInFrom(event.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            />
                        </label>
                    </div>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {summaryCards.map((card) => (
                    <button
                        key={card.filter}
                        type="button"
                        aria-pressed={quickFilter === card.filter}
                        onClick={() => setQuickFilter(card.filter)}
                        className={getSummaryCardClassName(card.filter, quickFilter === card.filter)}
                    >
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                        <p className={`mt-1 text-2xl font-semibold ${card.valueClassName}`}>{card.value}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{card.detail}</p>
                    </button>
                ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col gap-4 border-b border-gray-100 p-4 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <Clock3 className="h-5 w-5 text-blue-600" />
                        <div>
                            <h2 className="font-semibold text-gray-900 dark:text-white">รายการเวลาเข้า-ออก</h2>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                แสดง {filteredDays.length} จาก {days.length} วัน
                            </p>
                        </div>
                    </div>
                    <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/60 sm:w-auto">
                        {([
                            ['ALL', 'ทั้งหมด'],
                            ['LATE', 'เข้าสาย'],
                            ['INCOMPLETE', 'ข้อมูลไม่ครบ'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={quickFilter === value}
                                onClick={() => setQuickFilter(value)}
                                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${quickFilter === value
                                    ? 'bg-white text-blue-700 shadow-sm dark:bg-gray-800 dark:text-blue-300'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</div>
                ) : error ? (
                    <div className="p-8 text-center text-red-600 dark:text-red-300">{error}</div>
                ) : filteredDays.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <CalendarDays className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                        {emptyMessage}
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            วันที่
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            เวลาเข้า
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            เวลาออก
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            สถานะ
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredDays.map((day) => (
                                        <tr key={day.date} className={`${getRowClassName(day)} transition-colors`}>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                                {formatThaiDate(day.date)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {renderPunch(day, 'checkIn')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {renderPunch(day, 'checkOut')}
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
                                                    {renderLeaveChips(day)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-gray-700 md:hidden">
                            {filteredDays.map((day) => (
                                <div key={day.date} className={`${getRowClassName(day)} p-4 transition-colors`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {formatThaiDate(day.date)}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                บันทึก {day.scanCount} ครั้ง
                                            </p>
                                        </div>
                                        <div className="flex max-w-[58%] flex-wrap justify-end gap-1.5">
                                            {getStatusBadges(day).map((badge) => (
                                                <span
                                                    key={`${day.date}-${badge.label}`}
                                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getBadgeClassName(badge.tone)}`}
                                                >
                                                    {badge.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {day.relatedLeaveRequests.length > 0 ? (
                                        <div className="mobile-leave-chip-list mt-3 flex max-w-full min-w-0 flex-wrap gap-1.5">
                                            {renderLeaveChips(day)}
                                        </div>
                                    ) : null}
                                    <div className="mt-4 grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลาเข้า</p>
                                            {renderPunch(day, 'checkIn')}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลาออก</p>
                                            {renderPunch(day, 'checkOut')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
            {isLeaveDetailOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={closeLeaveDetail}>
                    <div
                        ref={leaveDetailDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="leave-detail-title"
                        tabIndex={-1}
                        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl outline-none dark:bg-gray-800"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-700">
                            <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">รายละเอียดใบลา</p>
                                <h3 id="leave-detail-title" className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                                    {selectedLeaveDetail?.leaveRequestNo ?? 'กำลังโหลด...'}
                                </h3>
                            </div>
                            <button
                                ref={leaveDetailCloseButtonRef}
                                type="button"
                                onClick={closeLeaveDetail}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                aria-label="ปิดรายละเอียดใบลา"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto p-5">
                            {isLeaveDetailLoading ? (
                                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    กำลังโหลดรายละเอียดใบลา...
                                </div>
                            ) : leaveDetailError ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                                    {leaveDetailError}
                                </div>
                            ) : selectedLeaveDetail ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">ประเภท</p>
                                            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{getLeaveTypeLabel(selectedLeaveDetail.leaveType)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">สถานะ</p>
                                            <span className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                {getLeaveStatusLabel(selectedLeaveDetail.status)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">วันที่ลา</p>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{formatLeaveDateRange(selectedLeaveDetail)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลา</p>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{formatLeaveTimeRange(selectedLeaveDetail)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">ผู้อนุมัติ</p>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLeaveDetail.approverName ?? '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลาอนุมัติ</p>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">
                                                {selectedLeaveDetail.approvedAt ? formatThaiDate(selectedLeaveDetail.approvedAt) : '-'}
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เหตุผล</p>
                                        <p className="mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                                            {selectedLeaveDetail.reason || '-'}
                                        </p>
                                    </div>

                                    {selectedLeaveDetail.medicalCertificateFile ? (
                                        <a
                                            href={selectedLeaveDetail.medicalCertificateFile}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                                        >
                                            <Paperclip className="h-4 w-4" />
                                            ดูเอกสารแนบ
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
