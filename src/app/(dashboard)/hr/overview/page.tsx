'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
    Building2,
    Users,
    CalendarCheck,
    CalendarClock,
    TrendingUp,
    Clock,
    AlertCircle,
    Check,
    X,
    Loader2,
    ArrowRight
} from 'lucide-react';

interface OverviewData {
    employees: {
        total: number;
        active: number;
        byCompany: { company: string; count: number }[];
        byDepartment: { department: string; count: number }[];
    };
    leaves: {
        pending: number;
        approvedThisMonth: number;
        rejectedThisMonth: number;
        totalThisYear: number;
    };
    balances: {
        avgVacationRemaining: number;
        avgSickRemaining: number;
    };
}

export default function HROverviewPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<OverviewData | null>(null);

    const fetchOverview = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/hr/overview');
            const result = await res.json();
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Error fetching overview:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        ภาพรวม HR
                    </h1>
                    <p className="text-gray-500">สรุปข้อมูลพนักงานและการลา</p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <Link href="/hr/employees" className="text-blue-500 hover:text-blue-600">
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {data?.employees.total || 0}
                    </p>
                    <p className="text-sm text-gray-500">พนักงานทั้งหมด</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <Link href="/approvals" className="text-amber-500 hover:text-amber-600">
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {data?.leaves.pending || 0}
                    </p>
                    <p className="text-sm text-gray-500">รออนุมัติ</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <Check className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {data?.leaves.approvedThisMonth || 0}
                    </p>
                    <p className="text-sm text-gray-500">อนุมัติเดือนนี้</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                        <Link href="/hr/analytics" className="text-purple-500 hover:text-purple-600">
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {data?.leaves.totalThisYear || 0}
                    </p>
                    <p className="text-sm text-gray-500">ใบลาปีนี้</p>
                </div>
            </div>

            {/* Company & Department Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* By Company */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        พนักงานตามบริษัท
                    </h2>
                    <div className="space-y-3">
                        {data?.employees.byCompany.map(item => (
                            <div key={item.company} className="flex items-center justify-between">
                                <span className="text-gray-600 dark:text-gray-300">{item.company}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{ width: `${(item.count / (data?.employees.total || 1)) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">
                                        {item.count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* By Department */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        พนักงานตามแผนก (Top 5)
                    </h2>
                    <div className="space-y-3">
                        {data?.employees.byDepartment.slice(0, 5).map(item => (
                            <div key={item.department} className="flex items-center justify-between">
                                <span className="text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                                    {item.department || 'ไม่ระบุ'}
                                </span>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full"
                                            style={{ width: `${(item.count / (data?.employees.total || 1)) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">
                                        {item.count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    ลิงก์ด่วน
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Link
                        href="/hr/employees"
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
                    >
                        <Users className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">จัดการพนักงาน</span>
                    </Link>
                    <Link
                        href="/hr/holidays"
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
                    >
                        <CalendarCheck className="w-6 h-6 mx-auto mb-2 text-green-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">จัดการวันหยุด</span>
                    </Link>
                    <Link
                        href="/hr/year-end"
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
                    >
                        <CalendarClock className="w-6 h-6 mx-auto mb-2 text-orange-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">ประมวลผลสิ้นปี</span>
                    </Link>
                    <Link
                        href="/hr/reports"
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
                    >
                        <TrendingUp className="w-6 h-6 mx-auto mb-2 text-purple-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">รายงาน</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
