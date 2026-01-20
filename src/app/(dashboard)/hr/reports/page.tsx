'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    FileText,
    Download,
    RefreshCw,
    Loader2,
    Calendar,
    BarChart3,
    Users,
    FileSpreadsheet
} from 'lucide-react';
import { formatLeaveDays } from '@/lib/leave-utils';

interface AttendanceData {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    department: string;
    company: string;
    vacationDays: number;
    sickDays: number;
    personalDays: number;
    totalLeaveDays: number;
}

interface SummaryData {
    leaveType: string;
    status: string;
    count: number;
    totalDays: number;
}

const leaveTypeNames: Record<string, string> = {
    'VACATION': 'พักร้อน',
    'SICK': 'ลาป่วย',
    'PERSONAL': 'ลากิจ',
    'MATERNITY': 'ลาคลอด',
    'MILITARY': 'เกณฑ์ทหาร',
    'ORDINATION': 'ลาบวช',
    'OTHER': 'อื่นๆ'
};

const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function ReportsPage() {
    const { data: session } = useSession();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [year, setYear] = useState(currentYear);
    const [month, setMonth] = useState(currentMonth);
    const [loading, setLoading] = useState(false);
    const [attendance, setAttendance] = useState<AttendanceData[]>([]);
    const [summary, setSummary] = useState<SummaryData[]>([]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/hr/reports/monthly?year=${year}&month=${month}`);
            const data = await res.json();
            if (data.success) {
                setAttendance(data.data.attendance);
                setSummary(data.data.summary);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = () => {
        window.location.href = `/api/hr/reports/monthly?year=${year}&month=${month}&format=csv`;
    };

    useEffect(() => {
        fetchReport();
    }, [year, month]);

    // Calculate summary totals
    const approvedSummary = summary.filter(s => s.status === 'APPROVED');
    const totalApprovedDays = approvedSummary.reduce((sum, s) => sum + s.totalDays, 0);
    const totalApprovedCount = approvedSummary.reduce((sum, s) => sum + s.count, 0);

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            รายงาน
                        </h1>
                        <p className="text-gray-500">สรุปข้อมูลการลาประจำเดือน</p>
                    </div>
                </div>

                {/* Month/Year Selector */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <select
                            value={month}
                            onChange={e => setMonth(parseInt(e.target.value))}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                        >
                            {monthNames.map((name, idx) => (
                                <option key={idx} value={idx + 1}>{name}</option>
                            ))}
                        </select>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                        >
                            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={fetchReport}
                        disabled={loading}
                        className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <BarChart3 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">ใบลาทั้งหมด</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {totalApprovedCount} ใบ
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Calendar className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">วันลารวม</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {formatLeaveDays(totalApprovedDays)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">พนักงานที่ลา</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {attendance.filter(a => a.totalLeaveDays > 0).length} คน
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">เฉลี่ย/คน</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {attendance.length > 0 ? formatLeaveDays(totalApprovedDays / attendance.length) : '0 วัน'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Leave Type Breakdown */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            สรุปตามประเภทการลา
                        </h2>
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

                    {/* Employee Attendance Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                รายละเอียดรายบุคคล ({monthNames[month - 1]} {year})
                            </h2>
                        </div>
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
                                    {attendance.filter(a => a.totalLeaveDays > 0).map(emp => (
                                        <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="py-3 px-4">
                                                <p className="font-medium text-gray-900 dark:text-white">{emp.firstName} {emp.lastName}</p>
                                                <p className="text-xs text-gray-500">{emp.employeeId}</p>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                                                {emp.department}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`${emp.vacationDays > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                                                    {formatLeaveDays(emp.vacationDays)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`${emp.sickDays > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                                    {formatLeaveDays(emp.sickDays)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`${emp.personalDays > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                                                    {formatLeaveDays(emp.personalDays)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="font-bold text-gray-900 dark:text-white">
                                                    {formatLeaveDays(emp.totalLeaveDays)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {attendance.filter(a => a.totalLeaveDays > 0).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-gray-500">
                                                ไม่มีพนักงานลาในเดือนนี้
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
