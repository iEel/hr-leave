'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Users,
    LayoutDashboard,
    Clock,
    Calendar,
    TrendingUp,
    UserCheck,
    AlertCircle,
    ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { formatLeaveDays } from '@/lib/leave-utils';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

interface TeamMember {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    role: string;
    isActive: boolean;
    startDate: string;
}

interface LeaveBreakdown {
    leaveType: string;
    count: number;
    totalDays: number;
}

interface Stats {
    totalMembers: number;
    pendingRequests: number;
    onLeaveToday: number;
    leavesThisMonth: number;
    totalDaysUsed: number;
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

export default function ManagerOverviewPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [leaveBreakdown, setLeaveBreakdown] = useState<LeaveBreakdown[]>([]);

    useEffect(() => {
        fetchTeamData();
    }, []);

    const fetchTeamData = async () => {
        try {
            const res = await fetch('/api/manager/team');
            const data = await res.json();
            if (data.success) {
                setTeam(data.data.team);
                setStats(data.data.stats);
                setLeaveBreakdown(data.data.leaveBreakdown);
            }
        } catch (error) {
            console.error('Error fetching team:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <DashboardSkeleton />;
    }

    if (team.length === 0) {
        return (
            <div className="animate-fade-in">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                        <LayoutDashboard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ภาพรวมแผนก
                        </h1>
                        <p className="text-gray-500">สรุปข้อมูลทีมงาน</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
                    <AlertCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        ไม่มีสมาชิกในทีม
                    </h2>
                    <p className="text-gray-500">
                        คุณยังไม่มีลูกน้องในระบบ
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                        <LayoutDashboard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ภาพรวมแผนก
                        </h1>
                        <p className="text-gray-500">
                            สวัสดี {session?.user?.firstName} | {session?.user?.department}
                        </p>
                    </div>
                </div>
                <Link
                    href="/manager/team"
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                >
                    <Users className="w-4 h-4" />
                    ดูสมาชิกทั้งหมด
                    <ChevronRight className="w-4 h-4" />
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {stats?.totalMembers || 0}
                    </p>
                    <p className="text-sm text-gray-500">สมาชิกในทีม</p>
                </div>

                <Link href="/approvals" className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:border-yellow-300 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-yellow-600">
                        {stats?.pendingRequests || 0}
                    </p>
                    <p className="text-sm text-gray-500">รออนุมัติ</p>
                </Link>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <UserCheck className="w-5 h-5 text-red-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-red-600">
                        {stats?.onLeaveToday || 0}
                    </p>
                    <p className="text-sm text-gray-500">ลาวันนี้</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-green-600">
                        {formatLeaveDays(stats?.totalDaysUsed || 0)}
                    </p>
                    <p className="text-sm text-gray-500">วันลาเดือนนี้</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Leave Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-teal-600" />
                        สรุปการลาปีนี้
                    </h3>
                    {leaveBreakdown.length === 0 ? (
                        <p className="text-center text-gray-400 py-8">ยังไม่มีข้อมูลการลา</p>
                    ) : (
                        <div className="space-y-3">
                            {leaveBreakdown.map((item) => {
                                const typeInfo = LEAVE_TYPE_LABELS[item.leaveType] || { label: item.leaveType, color: 'bg-gray-500' };
                                return (
                                    <div key={item.leaveType} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-3 h-3 rounded-full ${typeInfo.color}`} />
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {typeInfo.label}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-gray-900 dark:text-white">
                                                {formatLeaveDays(item.totalDays)}
                                            </span>
                                            <span className="text-xs text-gray-400 ml-2">
                                                ({item.count} ใบ)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Team Members Preview */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-teal-600" />
                            สมาชิกในทีม
                        </h3>
                        <Link href="/manager/team" className="text-sm text-teal-600 hover:text-teal-700">
                            ดูทั้งหมด →
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {team.slice(0, 5).map((member) => (
                            <div key={member.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-semibold">
                                    {member.firstName.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">
                                        {member.firstName} {member.lastName}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {member.employeeId} • {member.department}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {team.length > 5 && (
                            <Link
                                href="/manager/team"
                                className="block text-center py-3 text-teal-600 hover:text-teal-700 font-medium"
                            >
                                ดูเพิ่มอีก {team.length - 5} คน →
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
