'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { formatLeaveDays } from '@/lib/leave-utils';
import {
    History,
    Calendar,
    Clock,
    Filter,
    Search,
    ChevronLeft,
    ChevronRight,
    X,
    CheckCircle,
    XCircle,
    AlertCircle,
    Loader2,
    Briefcase,
    Heart,
    User,
    Baby,
    Shield,
    Church,
    Scissors,
    GraduationCap,
    CalendarPlus,
    RefreshCw,
    HelpCircle,
} from 'lucide-react';

// Leave type mapping
const leaveTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    VACATION: { label: 'ลาพักร้อน', icon: Briefcase, color: 'from-blue-500 to-blue-600' },
    SICK: { label: 'ลาป่วย', icon: Heart, color: 'from-red-500 to-red-600' },
    PERSONAL: { label: 'ลากิจ', icon: User, color: 'from-purple-500 to-purple-600' },
    MATERNITY: { label: 'ลาคลอด', icon: Baby, color: 'from-pink-500 to-pink-600' },
    MILITARY: { label: 'เกณฑ์ทหาร', icon: Shield, color: 'from-green-500 to-green-600' },
    ORDINATION: { label: 'ลาบวช', icon: Church, color: 'from-yellow-500 to-yellow-600' },
    STERILIZATION: { label: 'ลาทำหมัน', icon: Scissors, color: 'from-teal-500 to-teal-600' },
    TRAINING: { label: 'ลาฝึกอบรม', icon: GraduationCap, color: 'from-indigo-500 to-indigo-600' },
    OTHER: { label: 'อื่นๆ', icon: HelpCircle, color: 'from-gray-500 to-gray-600' },
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    PENDING: { label: 'รออนุมัติ', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
    APPROVED: { label: 'อนุมัติแล้ว', color: 'text-green-700', bgColor: 'bg-green-100' },
    REJECTED: { label: 'ไม่อนุมัติ', color: 'text-red-700', bgColor: 'bg-red-100' },
    CANCELLED: { label: 'ยกเลิก', color: 'text-gray-700', bgColor: 'bg-gray-100' },
};

interface LeaveRecord {
    id: number;
    leaveType: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    startTime: string | null;
    endTime: string | null;
    usageAmount: number;
    reason: string;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
    approvedAt: string | null;
    approverName: string | null;
}

export default function LeaveHistoryPage() {
    const { data: session } = useSession();
    const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterType, setFilterType] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [cancellingId, setCancellingId] = useState<number | null>(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);

    // Fetch leave history from API
    const fetchLeaves = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus !== 'ALL') params.append('status', filterStatus);
            if (filterType !== 'ALL') params.append('leaveType', filterType);

            const response = await fetch(`/api/leave/history?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                setLeaves(result.data);
            }
        } catch (error) {
            console.error('Error fetching leave history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch on mount and when filters change
    useEffect(() => {
        fetchLeaves();
    }, [filterStatus, filterType]);

    // Filter by search query (client-side)
    const filteredLeaves = leaves.filter((leave) => {
        if (searchQuery && !leave.reason.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const handleCancelClick = (leave: LeaveRecord) => {
        setSelectedLeave(leave);
        setShowCancelModal(true);
    };

    const handleConfirmCancel = async () => {
        if (!selectedLeave) return;

        setCancellingId(selectedLeave.id);

        try {
            const response = await fetch('/api/leave/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaveId: selectedLeave.id }),
            });

            const result = await response.json();

            if (result.success) {
                // Refresh the list
                fetchLeaves();
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error cancelling leave:', error);
        } finally {
            setCancellingId(null);
            setShowCancelModal(false);
            setSelectedLeave(null);
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                        <History className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ประวัติการลา
                        </h1>
                        <p className="text-gray-500">ดูและจัดการประวัติการลาของคุณ</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchLeaves}
                        className="inline-flex items-center gap-2 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                        <RefreshCw className="w-5 h-5" />
                        รีเฟรช
                    </button>
                    <Link
                        href="/leave/request"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
                    >
                        <CalendarPlus className="w-5 h-5" />
                        ขอลางานใหม่
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="ค้นหาจากเหตุผล..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="ALL">ทุกสถานะ</option>
                        <option value="PENDING">รออนุมัติ</option>
                        <option value="APPROVED">อนุมัติแล้ว</option>
                        <option value="REJECTED">ไม่อนุมัติ</option>
                        <option value="CANCELLED">ยกเลิก</option>
                    </select>

                    {/* Type Filter */}
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="ALL">ทุกประเภท</option>
                        {Object.entries(leaveTypeConfig).map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                </div>
            ) : (
                /* Leave List */
                <div className="space-y-4">
                    {filteredLeaves.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                            <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">ไม่พบประวัติการลา</p>
                            <Link
                                href="/leave/request"
                                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <CalendarPlus className="w-4 h-4" />
                                ขอลางานครั้งแรก
                            </Link>
                        </div>
                    ) : (
                        filteredLeaves.map((leave) => {
                            const typeConfig = leaveTypeConfig[leave.leaveType];
                            const status = statusConfig[leave.status];
                            const Icon = typeConfig?.icon || Calendar;
                            const canCancel = leave.status === 'PENDING';

                            return (
                                <div
                                    key={leave.id}
                                    className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                                        {/* Icon */}
                                        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${typeConfig?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center flex-shrink-0`}>
                                            <Icon className="w-7 h-7 text-white" />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                                        {typeConfig?.label || leave.leaveType}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {leave.startDate === leave.endDate
                                                            ? leave.startDate
                                                            : `${leave.startDate} - ${leave.endDate}`
                                                        }
                                                        {leave.isHourly && leave.startTime && leave.endTime && (
                                                            <span className="ml-1">({leave.startTime} - {leave.endTime})</span>
                                                        )}
                                                        <span className="mx-2">•</span>
                                                        {formatLeaveDays(leave.usageAmount)}
                                                    </p>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                        {leave.reason}
                                                    </p>
                                                    {leave.status === 'REJECTED' && leave.rejectionReason && (
                                                        <p className="text-sm text-red-600 mt-1">
                                                            เหตุผลที่ไม่อนุมัติ: {leave.rejectionReason}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Status Badge */}
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                                                    {leave.status === 'APPROVED' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                    {leave.status === 'REJECTED' && <XCircle className="w-3 h-3 mr-1" />}
                                                    {leave.status === 'PENDING' && <Clock className="w-3 h-3 mr-1" />}
                                                    {status.label}
                                                </span>
                                            </div>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                                <div className="text-xs text-gray-500">
                                                    ยื่นเมื่อ: {leave.createdAt}
                                                    {leave.approverName && (
                                                        <span className="ml-3">อนุมัติโดย: {leave.approverName}</span>
                                                    )}
                                                </div>

                                                {/* Cancel Button */}
                                                {canCancel && (
                                                    <button
                                                        onClick={() => handleCancelClick(leave)}
                                                        disabled={cancellingId === leave.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {cancellingId === leave.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <X className="w-4 h-4" />
                                                        )}
                                                        ยกเลิกใบลา
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {showCancelModal && selectedLeave && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowCancelModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                                    <AlertCircle className="w-8 h-8 text-red-600" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                    ยืนยันการยกเลิกใบลา
                                </h3>
                                <p className="text-gray-500 mb-6">
                                    คุณต้องการยกเลิกใบลา{leaveTypeConfig[selectedLeave.leaveType]?.label}
                                    วันที่ {selectedLeave.startDate} ใช่หรือไม่?
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        ไม่ยกเลิก
                                    </button>
                                    <button
                                        onClick={handleConfirmCancel}
                                        disabled={cancellingId !== null}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {cancellingId !== null ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : null}
                                        ยืนยันยกเลิก
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
