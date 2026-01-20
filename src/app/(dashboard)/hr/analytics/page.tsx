'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    BarChart3,
    TrendingUp,
    Users,
    Calendar,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Award,
    PieChart,
} from 'lucide-react';
import { formatLeaveDays } from '@/lib/leave-utils';

interface AnalyticsData {
    year: number;
    summary: {
        totalRequests: number;
        approved: number;
        rejected: number;
        pending: number;
        cancelled: number;
        totalDaysUsed: number;
    };
    byType: Array<{
        leaveType: string;
        count: number;
        daysUsed: number;
    }>;
    byMonth: Array<{
        month: number;
        count: number;
        daysUsed: number;
    }>;
    topUsers: Array<{
        employeeName: string;
        department: string;
        requestCount: number;
        totalDays: number;
    }>;
    totalEmployees: number;
}

const LEAVE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    VACATION: { label: 'ลาพักร้อน', color: 'bg-blue-500' },
    SICK: { label: 'ลาป่วย', color: 'bg-red-500' },
    PERSONAL: { label: 'ลากิจ', color: 'bg-purple-500' },
    MATERNITY: { label: 'ลาคลอด', color: 'bg-pink-500' },
    MILITARY: { label: 'เกณฑ์ทหาร', color: 'bg-green-500' },
    ORDINATION: { label: 'ลาบวช', color: 'bg-yellow-500' },
    STERILIZATION: { label: 'ลาทำหมัน', color: 'bg-teal-500' },
    TRAINING: { label: 'ลาฝึกอบรม', color: 'bg-indigo-500' },
};

const MONTH_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function HRAnalyticsPage() {
    const { data: session } = useSession();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());

    const fetchAnalytics = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/hr/analytics?year=${year}`);
            const result = await response.json();
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [year]);

    // Calculate max for charts
    const maxMonthlyCount = data?.byMonth ? Math.max(...data.byMonth.map(m => m.count), 1) : 1;
    const maxTypeCount = data?.byType ? Math.max(...data.byType.map(t => t.count), 1) : 1;

    if (isLoading) {
        return (
            <div className="animate-fade-in flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            วิเคราะห์ข้อมูล
                        </h1>
                        <p className="text-gray-500">สถิติและแนวโน้มการลา</p>
                    </div>
                </div>

                {/* Year Selector */}
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-2 shadow-sm border border-gray-100 dark:border-gray-700">
                    <button
                        onClick={() => setYear(year - 1)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-gray-900 dark:text-white min-w-[100px] text-center">
                        ปี {year + 543}
                    </span>
                    <button
                        onClick={() => setYear(year + 1)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-gray-500 text-sm">ใบลาทั้งหมด</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                            {data?.summary.totalRequests || 0}
                        </p>
                        <span className="text-sm text-gray-500">รายการ</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <span className="text-gray-500 text-sm">อนุมัติแล้ว</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold text-green-600">
                            {data?.summary.approved || 0}
                        </p>
                        <span className="text-sm text-gray-500">รายการ</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <span className="text-gray-500 text-sm">รออนุมัติ</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold text-yellow-600">
                            {data?.summary.pending || 0}
                        </p>
                        <span className="text-sm text-gray-500">รายการ</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                        <span className="text-gray-500 text-sm">วันลาใช้ไป</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold text-purple-600">
                            {formatLeaveDays(data?.summary.totalDaysUsed || 0)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Monthly Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        แนวโน้มรายเดือน
                    </h3>
                    <div className="flex items-end gap-2 h-48">
                        {MONTH_NAMES.map((monthName, index) => {
                            const monthData = data?.byMonth.find(m => m.month === index + 1);
                            const count = monthData?.count || 0;
                            const height = (count / maxMonthlyCount) * 100;

                            return (
                                <div key={index} className="flex-1 flex flex-col items-center">
                                    <div className="w-full flex flex-col items-center justify-end h-40">
                                        <span className="text-xs text-gray-500 mb-1">{count}</span>
                                        <div
                                            className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all"
                                            style={{ height: `${Math.max(height, 4)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 mt-2">{monthName}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By Type Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-purple-600" />
                        ตามประเภทการลา
                    </h3>
                    <div className="space-y-4">
                        {data?.byType.map((item) => {
                            const typeInfo = LEAVE_TYPE_LABELS[item.leaveType] || { label: item.leaveType, color: 'bg-gray-500' };
                            const percentage = (item.count / maxTypeCount) * 100;

                            return (
                                <div key={item.leaveType}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {typeInfo.label}
                                        </span>
                                        <span className="text-sm text-gray-500">
                                            {item.count} ใบ ({formatLeaveDays(item.daysUsed || 0)})
                                        </span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${typeInfo.color} rounded-full transition-all`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {(!data?.byType || data.byType.length === 0) && (
                            <p className="text-center text-gray-500 py-8">ไม่มีข้อมูล</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Users */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-600" />
                    พนักงานที่ใช้วันลามากที่สุด
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-700">
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">อันดับ</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">พนักงาน</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">แผนก</th>
                                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">จำนวนใบลา</th>
                                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">วันลารวม</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {data?.topUsers.map((user, index) => (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="py-4 px-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${index === 0 ? 'bg-yellow-500' :
                                            index === 1 ? 'bg-gray-400' :
                                                index === 2 ? 'bg-orange-500' :
                                                    'bg-gray-300'
                                            }`}>
                                            {index + 1}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 font-medium text-gray-900 dark:text-white">
                                        {user.employeeName}
                                    </td>
                                    <td className="py-4 px-4 text-gray-500">
                                        {user.department || '-'}
                                    </td>
                                    <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                                        {user.requestCount}
                                    </td>
                                    <td className="py-4 px-4 text-right font-semibold text-purple-600">
                                        {formatLeaveDays(user.totalDays || 0)}
                                    </td>
                                </tr>
                            ))}
                            {(!data?.topUsers || data.topUsers.length === 0) && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500">
                                        ไม่มีข้อมูล
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
