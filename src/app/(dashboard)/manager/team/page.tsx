'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Users,
    Search,
    Loader2,
    ChevronLeft,
    Mail,
    CalendarDays,
    XCircle,
    ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { formatLeaveDays, formatHourlyDuration } from '@/lib/leave-utils';

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

interface BalanceData {
    employee: {
        firstName: string;
        lastName: string;
        employeeId: string;
        department: string;
    };
    year: number;
    balances: Array<{
        leaveType: string;
        entitlement: number;
        used: number;
        remaining: number;
        carryOver: number;
    }>;
    leaveHistory: Array<{
        id: number;
        leaveType: string;
        startDate: string;
        endDate: string;
        days: number;
        isHourly: boolean;
        startTime: string | null;
        endTime: string | null;
        status: string;
    }>;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
    VACATION: 'ลาพักร้อน',
    SICK: 'ลาป่วย',
    PERSONAL: 'ลากิจ',
    MATERNITY: 'ลาคลอด',
    MILITARY: 'เกณฑ์ทหาร',
    ORDINATION: 'ลาบวช',
    STERILIZATION: 'ลาทำหมัน',
    TRAINING: 'ลาฝึกอบรม',
    OTHER: 'อื่นๆ',
};

export default function ManagerTeamPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [search, setSearch] = useState('');

    // Balance modal
    const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);

    useEffect(() => {
        fetchTeamData();
    }, []);

    const fetchTeamData = async () => {
        try {
            const res = await fetch('/api/manager/team');
            const data = await res.json();
            if (data.success) {
                setTeam(data.data.team);
            }
        } catch (error) {
            console.error('Error fetching team:', error);
        } finally {
            setLoading(false);
        }
    };

    const openBalanceModal = async (member: TeamMember) => {
        setSelectedMember(member);
        setBalanceLoading(true);
        setIsBalanceModalOpen(true);
        setBalanceData(null);

        try {
            const res = await fetch(`/api/hr/employee-balance/${member.id}`);
            const data = await res.json();
            if (data.success) {
                setBalanceData(data.data);
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
        } finally {
            setBalanceLoading(false);
        }
    };

    const filteredTeam = team.filter(member =>
        member.firstName.toLowerCase().includes(search.toLowerCase()) ||
        member.lastName.toLowerCase().includes(search.toLowerCase()) ||
        member.employeeId.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
        );
    }

    return (
        <>
            <div className="animate-fade-in">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/manager/overview"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </Link>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                            <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                สมาชิกในทีม
                            </h1>
                            <p className="text-gray-500">
                                {team.length} คน | {session?.user?.department}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="ค้นหาสมาชิก..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500"
                        />
                    </div>
                </div>

                {/* Team Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTeam.map((member) => (
                        <div
                            key={member.id}
                            className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow"
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                                    {member.firstName.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                        {member.firstName} {member.lastName}
                                    </h3>
                                    <p className="text-sm text-gray-500 truncate">
                                        {member.employeeId}
                                    </p>
                                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                                        <Mail className="w-3 h-3" />
                                        <span className="truncate">{member.email}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button
                                    onClick={() => openBalanceModal(member)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-600 rounded-xl transition-colors font-medium"
                                >
                                    <CalendarDays className="w-4 h-4" />
                                    ดูวันลา
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredTeam.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        ไม่พบสมาชิกที่ค้นหา
                    </div>
                )}
            </div>

            {/* Balance Modal */}
            {isBalanceModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsBalanceModalOpen(false)}>
                    <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                        วันลาของ {balanceData?.employee.firstName} {balanceData?.employee.lastName}
                                    </h2>
                                    <p className="text-sm text-gray-500">
                                        {balanceData?.employee.employeeId} | {balanceData?.employee.department}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsBalanceModalOpen(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <XCircle className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        {balanceLoading ? (
                            <div className="p-12 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                            </div>
                        ) : balanceData ? (
                            <div className="p-6">
                                {/* Balance Cards */}
                                <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">
                                    วันลาคงเหลือ ปี {balanceData.year}
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                                    {balanceData.balances.map(b => (
                                        <div key={b.leaveType} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-center">
                                            <p className="text-xs text-gray-500 mb-1">
                                                {LEAVE_TYPE_LABELS[b.leaveType] || b.leaveType}
                                            </p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {b.entitlement === 0 && b.carryOver === 0 ? 'ไม่จำกัด' : formatLeaveDays(b.remaining)}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                ใช้ {formatLeaveDays(b.used)} / {b.entitlement === 0 && b.carryOver === 0 ? 'ไม่จำกัด' : formatLeaveDays(b.entitlement + b.carryOver)}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                {/* Leave History */}
                                <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">
                                    ประวัติการลาปีนี้
                                </h3>
                                {balanceData.leaveHistory.length === 0 ? (
                                    <p className="text-center text-gray-400 py-4">ยังไม่มีประวัติการลา</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {balanceData.leaveHistory.map(h => (
                                            <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-2 h-2 rounded-full ${h.status === 'APPROVED' ? 'bg-green-500' :
                                                        h.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'
                                                        }`} />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {LEAVE_TYPE_LABELS[h.leaveType] || h.leaveType}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {h.startDate} - {h.endDate}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                                                        {h.isHourly && h.startTime && h.endTime
                                                            ? formatHourlyDuration(h.startTime, h.endTime)
                                                            : formatLeaveDays(h.days)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-gray-500">
                                ไม่พบข้อมูลวันลา
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
