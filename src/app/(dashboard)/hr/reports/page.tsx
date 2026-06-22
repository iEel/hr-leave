'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Calendar, Clock3, Download, ExternalLink, FileSpreadsheet, FileText, Loader2, Paperclip, RefreshCw, Users, X } from 'lucide-react';
import { formatLeaveDays } from '@/lib/leave-utils';

type ReportTab = 'LEAVE' | 'ATTENDANCE';
type AttendanceStatusFilter = 'ALL' | 'LATE' | 'ADJUSTED_BY_LEAVE' | 'INCOMPLETE' | 'NO_HIP_DATA';

interface AttendanceData { id: number; employeeId: string; firstName: string; lastName: string; department: string; company: string; vacationDays: number; sickDays: number; personalDays: number; totalLeaveDays: number; }
interface SummaryData { leaveType: string; status: string; count: number; totalDays: number; }
interface RelatedLeaveRequest { leaveRequestId: number; leaveRequestNo: string; isStatusAdjusting?: boolean; }
interface AttendanceReportRow {
    date: string; employeeId: string; employeeName: string; department: string; company: string;
    checkIn: string | null; checkOut: string | null; rawIsLate: boolean; rawIsIncomplete: boolean;
    isLate: boolean; isIncomplete: boolean; effectiveLateAfterTime: string | null; finalStatus: string;
    adjustedByApprovedLeave: boolean; leaveRequestId: number | null; leaveRequestNo: string | null;
    relatedLeaveRequests: RelatedLeaveRequest[];
}
interface AttendanceReportSummary { total: number; late: number; adjustedByLeave: number; incomplete: number; noHipData: number; }
interface LeaveDetail {
    id: number; leaveRequestNo: string; leaveType: string; startDate: string; endDate: string;
    isHourly: boolean; startTime: string | null; endTime: string | null; timeSlot: string;
    reason: string | null; status: string; approverName: string | null; approvedAt: string | null; medicalCertificateFile: string | null;
}
interface LeaveDetailApiResponse { success?: boolean; data?: LeaveDetail; error?: string; }

const emptyAttendanceSummary: AttendanceReportSummary = { total: 0, late: 0, adjustedByLeave: 0, incomplete: 0, noHipData: 0 };
const leaveTypeNames: Record<string, string> = { VACATION: 'พักร้อน', SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', MATERNITY: 'ลาคลอด', MILITARY: 'เกณฑ์ทหาร', ORDINATION: 'ลาบวช', STERILIZATION: 'ลาทำหมัน', TRAINING: 'ลาฝึกอบรม', OTHER: 'อื่นๆ' };
const leaveStatusNames: Record<string, string> = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติ', REJECTED: 'ไม่อนุมัติ', CANCELLED: 'ยกเลิก' };
const attendanceStatusOptions: Array<{ value: AttendanceStatusFilter; label: string }> = [
    { value: 'ALL', label: 'ทั้งหมด' },
    { value: 'LATE', label: 'สาย' },
    { value: 'ADJUSTED_BY_LEAVE', label: 'ไม่คิดสายจากใบลา' },
    { value: 'INCOMPLETE', label: 'ข้อมูลไม่ครบ' },
    { value: 'NO_HIP_DATA', label: 'ไม่พบข้อมูล HIP' },
];
const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function formatThaiDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatLeaveDateRange(leave: Pick<LeaveDetail, 'startDate' | 'endDate'>): string {
    return leave.startDate === leave.endDate ? formatThaiDate(leave.startDate) : `${formatThaiDate(leave.startDate)} - ${formatThaiDate(leave.endDate)}`;
}
function formatLeaveTimeRange(leave: Pick<LeaveDetail, 'isHourly' | 'startTime' | 'endTime' | 'timeSlot'>): string {
    if (leave.isHourly && leave.startTime && leave.endTime) return `${leave.startTime} - ${leave.endTime}`;
    if (leave.timeSlot === 'HALF_MORNING') return 'ครึ่งวันเช้า';
    if (leave.timeSlot === 'HALF_AFTERNOON') return 'ครึ่งวันบ่าย';
    return 'เต็มวัน';
}
function getAttendanceStatusClassName(row: AttendanceReportRow): string {
    if (row.finalStatus === 'ไม่คิดสายจากใบลา') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300';
    if (row.finalStatus === 'ข้อมูลไม่ครบ') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300';
    if (row.finalStatus === 'สาย') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300';
    if (row.finalStatus === 'ไม่พบข้อมูล HIP') return 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200';
    if (row.finalStatus === 'ปกติ') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300';
    return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300';
}
function getAttendanceRowClassName(row: AttendanceReportRow): string {
    if (row.finalStatus === 'ข้อมูลไม่ครบ') return 'bg-rose-50/35 hover:bg-rose-50/70 dark:bg-rose-950/10 dark:hover:bg-rose-950/20';
    if (row.finalStatus === 'สาย') return 'bg-amber-50/35 hover:bg-amber-50/70 dark:bg-amber-950/10 dark:hover:bg-amber-950/20';
    if (row.finalStatus === 'ไม่คิดสายจากใบลา') return 'bg-emerald-50/35 hover:bg-emerald-50/70 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20';
    if (row.finalStatus === 'ไม่พบข้อมูล HIP') return 'bg-gray-50/70 hover:bg-gray-100 dark:bg-gray-900/30 dark:hover:bg-gray-900/50';
    return 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
}

export default function ReportsPage() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [activeTab, setActiveTab] = useState<ReportTab>('LEAVE');
    const [year, setYear] = useState(currentYear);
    const [month, setMonth] = useState(currentMonth);
    const [loading, setLoading] = useState(false);
    const [attendance, setAttendance] = useState<AttendanceData[]>([]);
    const [summary, setSummary] = useState<SummaryData[]>([]);
    const [attendanceRows, setAttendanceRows] = useState<AttendanceReportRow[]>([]);
    const [attendanceSummary, setAttendanceSummary] = useState<AttendanceReportSummary>(emptyAttendanceSummary);
    const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusFilter>('ALL');
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [attendanceError, setAttendanceError] = useState<string | null>(null);
    const [selectedLeaveDetail, setSelectedLeaveDetail] = useState<LeaveDetail | null>(null);
    const [isLeaveDetailLoading, setIsLeaveDetailLoading] = useState(false);
    const [leaveDetailError, setLeaveDetailError] = useState<string | null>(null);
    const attendanceRequestIdRef = useRef(0);
    const attendanceAbortControllerRef = useRef<AbortController | null>(null);
    const detailRequestIdRef = useRef(0);
    const detailAbortControllerRef = useRef<AbortController | null>(null);
    const leaveDetailDialogRef = useRef<HTMLDivElement | null>(null);
    const leaveDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
    const lastLeaveTriggerRef = useRef<HTMLButtonElement | null>(null);
    const isLeaveDetailOpen = selectedLeaveDetail != null || isLeaveDetailLoading || leaveDetailError != null;

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/hr/reports/monthly?year=${year}&month=${month}`);
            const data = await res.json();
            if (data.success) { setAttendance(data.data.attendance); setSummary(data.data.summary); }
        } catch (error) { console.error('Error fetching report:', error); }
        finally { setLoading(false); }
    }, [month, year]);

    const exportCSV = () => { window.location.href = `/api/hr/reports/monthly?year=${year}&month=${month}&format=csv`; };

    const fetchAttendanceReport = useCallback(async () => {
        attendanceAbortControllerRef.current?.abort();
        const controller = new AbortController();
        const requestId = attendanceRequestIdRef.current + 1;
        attendanceRequestIdRef.current = requestId;
        attendanceAbortControllerRef.current = controller;

        setAttendanceRows([]);
        setAttendanceSummary(emptyAttendanceSummary);
        setAttendanceError(null);
        setAttendanceLoading(true);

        try {
            const period = `${year}-${String(month).padStart(2, '0')}`;
            const res = await fetch(`/api/hr/reports/attendance?period=${period}&status=${attendanceStatus}`, { signal: controller.signal });
            const data = await res.json();
            if (controller.signal.aborted || attendanceRequestIdRef.current !== requestId) return;
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch attendance report');
            setAttendanceRows(data.rows ?? []);
            setAttendanceSummary(data.summary ?? emptyAttendanceSummary);
        } catch (error) {
            if (controller.signal.aborted || attendanceRequestIdRef.current !== requestId) return;
            console.error('Error fetching attendance report:', error);
            setAttendanceError(error instanceof Error ? error.message : 'Failed to fetch attendance report');
        } finally {
            if (!controller.signal.aborted && attendanceRequestIdRef.current === requestId) {
                setAttendanceLoading(false);
                attendanceAbortControllerRef.current = null;
            }
        }
    }, [attendanceStatus, month, year]);

    const exportAttendanceCSV = () => {
        const period = `${year}-${String(month).padStart(2, '0')}`;
        window.location.href = `/api/hr/reports/attendance?period=${period}&status=${attendanceStatus}&format=csv`;
    };

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
            if (controller.signal.aborted || detailRequestIdRef.current !== requestId) return;
            if (!response.ok || !data.success || !data.data) throw new Error(data.error || 'Failed to fetch leave detail');
            setSelectedLeaveDetail(data.data);
        } catch (detailError) {
            if (controller.signal.aborted || detailRequestIdRef.current !== requestId) return;
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
        window.requestAnimationFrame(() => { if (triggerButton?.isConnected) triggerButton.focus(); });
    }, []);

    useEffect(() => { fetchReport(); }, [fetchReport]);
    useEffect(() => {
        if (activeTab !== 'ATTENDANCE') return;
        fetchAttendanceReport();
    }, [activeTab, fetchAttendanceReport]);
    useEffect(() => {
        if (!isLeaveDetailOpen) return;
        if (leaveDetailCloseButtonRef.current) leaveDetailCloseButtonRef.current.focus();
        else leaveDetailDialogRef.current?.focus();
    }, [isLeaveDetailOpen]);
    useEffect(() => {
        if (!isLeaveDetailOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeLeaveDetail();
                return;
            }

            if (event.key === 'Tab') {
                const dialog = leaveDetailDialogRef.current;
                if (!dialog) return;

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
        return () => { document.removeEventListener('keydown', handleKeyDown); };
    }, [closeLeaveDetail, isLeaveDetailOpen]);

    const approvedSummary = summary.filter(s => s.status === 'APPROVED');
    const totalApprovedDays = approvedSummary.reduce((sum, s) => sum + s.totalDays, 0);
    const totalApprovedCount = approvedSummary.reduce((sum, s) => sum + s.count, 0);
    const employeesWithLeave = attendance.filter(a => a.totalLeaveDays > 0);
    const attendanceMetricCards: Array<{ label: string; value: number; colorClassName: string }> = [
        { label: 'สาย', value: attendanceSummary.late, colorClassName: 'text-amber-600 dark:text-amber-300' },
        { label: 'ไม่คิดสายจากใบลา', value: attendanceSummary.adjustedByLeave, colorClassName: 'text-emerald-600 dark:text-emerald-300' },
        { label: 'ข้อมูลไม่ครบ', value: attendanceSummary.incomplete, colorClassName: 'text-rose-600 dark:text-rose-300' },
        { label: 'ไม่พบข้อมูล HIP', value: attendanceSummary.noHipData, colorClassName: 'text-gray-700 dark:text-gray-200' },
    ];

    const renderLeaveLink = (row: AttendanceReportRow) => {
        const primaryLeave: RelatedLeaveRequest[] = row.leaveRequestId && row.leaveRequestNo
            ? [{ leaveRequestId: row.leaveRequestId, leaveRequestNo: row.leaveRequestNo }]
            : [];
        const leaves = [...primaryLeave, ...(row.relatedLeaveRequests ?? [])].filter((leave, index, items) => (
            items.findIndex(item => item.leaveRequestId === leave.leaveRequestId) === index
        ));
        if (leaves.length === 0) return <span className="text-gray-400">-</span>;

        return (
            <div className="flex flex-wrap gap-1.5">
                {leaves.map((leave) => (
                    <button
                        key={`${row.date}-${leave.leaveRequestId}`}
                        type="button"
                        onClick={(event) => openLeaveDetail(leave.leaveRequestId, event.currentTarget)}
                        className="inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60 dark:focus:ring-offset-gray-800"
                    >
                        {leave.leaveRequestNo}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">รายงาน</h1>
                        <p className="text-gray-500">{activeTab === 'LEAVE' ? 'สรุปข้อมูลการลาประจำเดือน' : 'ตรวจสอบเวลาเข้า-ออกและผลปรับจากใบลา'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                            {monthNames.map((name, idx) => <option key={idx} value={idx + 1}>{name}</option>)}
                        </select>
                        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button type="button" onClick={activeTab === 'LEAVE' ? fetchReport : fetchAttendanceReport} disabled={activeTab === 'LEAVE' ? loading : attendanceLoading} className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-60" aria-label="โหลดรายงานใหม่">
                        <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${(activeTab === 'LEAVE' ? loading : attendanceLoading) ? 'animate-spin' : ''}`} />
                    </button>
                    <button type="button" onClick={activeTab === 'LEAVE' ? exportCSV : exportAttendanceCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                        <FileSpreadsheet className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/60">
                {([['LEAVE', 'รายงานการลา'], ['ATTENDANCE', 'เวลาเข้า-ออก']] as const).map(([tab, label]) => (
                    <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white text-emerald-700 shadow-sm dark:bg-gray-800 dark:text-emerald-300' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'LEAVE' ? (
                loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-blue-600" /></div><div><p className="text-sm text-gray-500">ใบลาทั้งหมด</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{totalApprovedCount} ใบ</p></div></div></div>
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Calendar className="w-5 h-5 text-green-600" /></div><div><p className="text-sm text-gray-500">วันลารวม</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{formatLeaveDays(totalApprovedDays)}</p></div></div></div>
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><Users className="w-5 h-5 text-purple-600" /></div><div><p className="text-sm text-gray-500">พนักงานที่ลา</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{employeesWithLeave.length} คน</p></div></div></div>
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><FileText className="w-5 h-5 text-orange-600" /></div><div><p className="text-sm text-gray-500">เฉลี่ย/คน</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{attendance.length > 0 ? formatLeaveDays(totalApprovedDays / attendance.length) : '0 วัน'}</p></div></div></div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">สรุปตามประเภทการลา</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {approvedSummary.map(s => (
                                    <div key={s.leaveType} className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                        <p className="text-sm text-gray-500">{leaveTypeNames[s.leaveType] || s.leaveType}</p>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{formatLeaveDays(s.totalDays)}</p>
                                        <p className="text-xs text-gray-400">{s.count} ใบ</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดรายบุคคล ({monthNames[month - 1]} {year})</h2></div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">พนักงาน</th>
                                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">แผนก</th>
                                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">พักร้อน</th>
                                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">ลาป่วย</th>
                                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">ลากิจ</th>
                                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase font-bold">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {employeesWithLeave.map(emp => (
                                            <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="py-3 px-4"><p className="font-medium text-gray-900 dark:text-white">{emp.firstName} {emp.lastName}</p><p className="text-xs text-gray-500">{emp.employeeId}</p></td>
                                                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{emp.department}</td>
                                                <td className="py-3 px-4 text-center"><span className={emp.vacationDays > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>{formatLeaveDays(emp.vacationDays)}</span></td>
                                                <td className="py-3 px-4 text-center"><span className={emp.sickDays > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{formatLeaveDays(emp.sickDays)}</span></td>
                                                <td className="py-3 px-4 text-center"><span className={emp.personalDays > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>{formatLeaveDays(emp.personalDays)}</span></td>
                                                <td className="py-3 px-4 text-center"><span className="font-bold text-gray-900 dark:text-white">{formatLeaveDays(emp.totalLeaveDays)}</span></td>
                                            </tr>
                                        ))}
                                        {employeesWithLeave.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-500">ไม่มีพนักงานลาในเดือนนี้</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )
            ) : (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <label className="block max-w-sm space-y-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">สถานะ</span>
                                <select value={attendanceStatus} onChange={e => setAttendanceStatus(e.target.value as AttendanceStatusFilter)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                                    {attendanceStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button type="button" onClick={fetchAttendanceReport} disabled={attendanceLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
                                    {attendanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                                    โหลดรายงานเวลาเข้า-ออก
                                </button>
                                <button type="button" onClick={exportAttendanceCSV} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                                    <Download className="h-4 w-4" />
                                    Export CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {attendanceMetricCards.map(card => (
                            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                                <p className={`mt-1 text-2xl font-semibold ${card.colorClassName}`}>{card.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-700">
                            <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-emerald-600" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดเวลาเข้า-ออก ({monthNames[month - 1]} {year})</h2><p className="text-xs text-gray-500 dark:text-gray-400">ทั้งหมด {attendanceSummary.total} รายการ</p></div></div>
                        </div>
                        {attendanceLoading ? (
                            <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400"><Loader2 className="h-5 w-5 animate-spin" />กำลังโหลดข้อมูล...</div>
                        ) : attendanceError ? (
                            <div className="py-12 text-center text-rose-600 dark:text-rose-300">{attendanceError}</div>
                        ) : attendanceRows.length === 0 ? (
                            <div className="py-12 text-center text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลรายงานเวลาเข้า-ออกสำหรับตัวกรองนี้</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">วันที่</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">พนักงาน</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">แผนก</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">เวลาเข้า</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">เวลาออก</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">เกณฑ์สาย</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">สถานะสุดท้าย</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">ใบลา</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {attendanceRows.map(row => (
                                            <tr key={`${row.date}-${row.employeeId}`} className={`${getAttendanceRowClassName(row)} transition-colors`}>
                                                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">{formatThaiDate(row.date)}</td>
                                                <td className="px-4 py-3"><p className="font-medium text-gray-900 dark:text-white">{row.employeeName}</p><p className="text-xs text-gray-500">{row.employeeId}</p></td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><p>{row.department || '-'}</p><p className="text-xs text-gray-400">{row.company || '-'}</p></td>
                                                <td className={`whitespace-nowrap px-4 py-3 ${row.rawIsLate ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>{row.checkIn ?? '-'}</td>
                                                <td className={`whitespace-nowrap px-4 py-3 ${row.rawIsIncomplete ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-gray-700 dark:text-gray-300'}`}>{row.checkOut ?? '-'}</td>
                                                <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{row.effectiveLateAfterTime ?? '-'}</td>
                                                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getAttendanceStatusClassName(row)}`}>{row.finalStatus}</span></td>
                                                <td className="px-4 py-3">{renderLeaveLink(row)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                                <h3 id="leave-detail-title" className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{selectedLeaveDetail?.leaveRequestNo ?? 'กำลังโหลด...'}</h3>
                            </div>
                            <button ref={leaveDetailCloseButtonRef} type="button" onClick={closeLeaveDetail} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-gray-700 dark:hover:text-gray-200" aria-label="ปิดรายละเอียดใบลา">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto p-5">
                            {isLeaveDetailLoading ? (
                                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />กำลังโหลดรายละเอียดใบลา...</div>
                            ) : leaveDetailError ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{leaveDetailError}</div>
                            ) : selectedLeaveDetail ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">ประเภท</p><p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{leaveTypeNames[selectedLeaveDetail.leaveType] ?? selectedLeaveDetail.leaveType}</p></div>
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">สถานะ</p><span className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">{leaveStatusNames[selectedLeaveDetail.status] ?? selectedLeaveDetail.status}</span></div>
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">วันที่ลา</p><p className="mt-1 text-sm text-gray-900 dark:text-white">{formatLeaveDateRange(selectedLeaveDetail)}</p></div>
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลา</p><p className="mt-1 text-sm text-gray-900 dark:text-white">{formatLeaveTimeRange(selectedLeaveDetail)}</p></div>
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">ผู้อนุมัติ</p><p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLeaveDetail.approverName ?? '-'}</p></div>
                                        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลาอนุมัติ</p><p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedLeaveDetail.approvedAt ? formatDateTime(selectedLeaveDetail.approvedAt) : '-'}</p></div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">เหตุผล</p>
                                        <p className="mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">{selectedLeaveDetail.reason || '-'}</p>
                                    </div>
                                    {selectedLeaveDetail.medicalCertificateFile ? (
                                        <a href={selectedLeaveDetail.medicalCertificateFile} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-300 dark:hover:text-blue-200">
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
