'use client';

import { useState, useEffect } from 'react';
import {
    FileText,
    Search,
    Filter,
    Loader2,
    Calendar,
    User,
    Download,
    Eye,
    Paperclip,
    CheckCircle,
    XCircle,
    Clock,
} from 'lucide-react';
import { formatLeaveDays, formatHourlyDuration } from '@/lib/leave-utils';
import { ListSkeleton } from '@/components/ui/Skeleton';

interface LeaveRecord {
    id: number;
    employeeId: string;
    employeeName: string;
    department: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    startTime: string | null;
    endTime: string | null;
    usageAmount: number;
    reason: string;
    status: string;
    hasMedicalCert: boolean;
    medicalCertificateFile: string | null;
    rejectionReason: string | null;
    createdAt: string;
    approverName: string | null;
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
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    PENDING: { label: 'รออนุมัติ', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    APPROVED: { label: 'อนุมัติ', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    REJECTED: { label: 'ไม่อนุมัติ', color: 'bg-red-100 text-red-700', icon: XCircle },
    CANCELLED: { label: 'ยกเลิก', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

export default function HRLeavesPage() {
    const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [medicalCertFilter, setMedicalCertFilter] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
    const [cancelTarget, setCancelTarget] = useState<LeaveRecord | null>(null);

    useEffect(() => {
        fetchLeaves();
    }, [statusFilter, typeFilter, medicalCertFilter]);

    const fetchLeaves = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            if (typeFilter) params.append('leaveType', typeFilter);
            if (medicalCertFilter) params.append('hasMedicalCert', 'true');
            if (search) params.append('search', search);

            const res = await fetch(`/api/hr/leaves?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setLeaves(data.data);
            }
        } catch (error) {
            console.error('Error fetching leaves:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchLeaves();
    };

    const handleConfirmCancel = async () => {
        if (!cancelTarget) return;
        setLoading(true);
        try {
            const res = await fetch('/api/leave/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaveId: cancelTarget.id })
            });
            const data = await res.json();
            if (data.success) {
                setCancelTarget(null);
                fetchLeaves();
            } else {
                alert(data.error || 'Failed to cancel leave');
            }
        } catch (error) {
            console.error('Error cancelling leave:', error);
            alert('Failed to cancel leave');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="animate-fade-in">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                ประวัติการลาทั้งหมด
                            </h1>
                            <p className="text-gray-500">ดูและจัดการใบลาของพนักงาน</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-100 dark:border-gray-700">
                    <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อหรือรหัสพนักงาน..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                        >
                            <option value="">ทุกสถานะ</option>
                            <option value="PENDING">รออนุมัติ</option>
                            <option value="APPROVED">อนุมัติ</option>
                            <option value="REJECTED">ไม่อนุมัติ</option>
                            <option value="CANCELLED">ยกเลิก</option>
                        </select>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                        >
                            <option value="">ทุกประเภท</option>
                            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                        <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={medicalCertFilter}
                                onChange={(e) => setMedicalCertFilter(e.target.checked)}
                                className="w-4 h-4 text-purple-600"
                            />
                            <Paperclip className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">มีใบรับรองแพทย์</span>
                        </label>
                        <button
                            type="submit"
                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium"
                        >
                            ค้นหา
                        </button>
                    </form>
                </div>

                {/* Results */}
                {loading ? (
                    <ListSkeleton items={5} />
                ) : (
                    <div className="space-y-3">
                        {leaves.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
                                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                                <p className="text-gray-500">ไม่พบข้อมูลการลา</p>
                            </div>
                        ) : (
                            leaves.map((leave) => {
                                const statusInfo = STATUS_LABELS[leave.status] || STATUS_LABELS.PENDING;
                                const StatusIcon = statusInfo.icon;
                                return (
                                    <div
                                        key={leave.id}
                                        className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow"
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                            {/* Employee */}
                                            <div className="flex items-center gap-3 min-w-[200px]">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                                                    {leave.employeeName?.charAt(0) || 'U'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {leave.employeeName}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {leave.employeeId} • {leave.department || '-'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Leave Info */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                                        {statusInfo.label}
                                                    </span>
                                                    {leave.hasMedicalCert && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                                            <Paperclip className="w-3 h-3" />
                                                            ใบรับรองแพทย์
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500">
                                                    {leave.startDate === leave.endDate ? leave.startDate : `${leave.startDate} - ${leave.endDate}`}
                                                    {leave.isHourly && leave.startTime && leave.endTime && (
                                                        <span className="ml-1">({leave.startTime} - {leave.endTime})</span>
                                                    )}
                                                    <span className="ml-2">({leave.isHourly && leave.startTime && leave.endTime
                                                        ? formatHourlyDuration(leave.startTime, leave.endTime)
                                                        : formatLeaveDays(leave.usageAmount)})</span>
                                                </p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                {/* Cancel Button (REVOKE) */}
                                                {(leave.status === 'APPROVED' || leave.status === 'PENDING') && (
                                                    <button
                                                        onClick={() => setCancelTarget(leave)}
                                                        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                                        title="ยกเลิก/เพิกถอน"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                        <span className="hidden md:inline">ยกเลิก</span>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setSelectedLeave(leave)}
                                                    className="flex items-center gap-2 px-3 py-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-colors"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    ดูรายละเอียด
                                                </button>
                                                {leave.medicalCertificateFile && (
                                                    <a
                                                        href={leave.medicalCertificateFile}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                                                    >
                                                        <Paperclip className="w-4 h-4" />
                                                        ใบรับรอง
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

            </div>

            {/* Confirm Cancel Modal */}
            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ยืนยันการยกเลิกใบลา</h3>
                        <p className="text-gray-500 mb-4">
                            คุณต้องการยกเลิกใบลาของ <b>{cancelTarget.employeeName}</b> หรือไม่?
                            {cancelTarget.status === 'APPROVED' && (
                                <span className="block mt-2 text-red-500 text-sm">
                                    * ระบบจะคืนวันลาให้กับพนักงานโดยอัตโนมัติ
                                </span>
                            )}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setCancelTarget(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/50 dark:text-gray-300 rounded-lg"
                            >
                                ปิด
                            </button>
                            <button
                                onClick={handleConfirmCancel}
                                disabled={loading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selectedLeave && !cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedLeave(null)}>
                    <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                        {/* ... Content ... */}
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                รายละเอียดใบลา
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">พนักงาน</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{selectedLeave.employeeName}</p>
                                    <p className="text-xs text-gray-400">{selectedLeave.employeeId}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">แผนก</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{selectedLeave.department}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">ประเภท</p>
                                    <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {LEAVE_TYPE_LABELS[selectedLeave.leaveType] || selectedLeave.leaveType}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">จำนวนวัน</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{selectedLeave.isHourly && selectedLeave.startTime && selectedLeave.endTime
                                        ? formatHourlyDuration(selectedLeave.startTime, selectedLeave.endTime)
                                        : formatLeaveDays(selectedLeave.usageAmount)}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-gray-500 mb-1">วันที่ลา</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        {selectedLeave.startDate} - {selectedLeave.endDate}
                                        {selectedLeave.isHourly && selectedLeave.startTime && selectedLeave.endTime && (
                                            <span className="ml-2 text-gray-500 text-sm">
                                                ({selectedLeave.startTime} - {selectedLeave.endTime})
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-gray-500 mb-1">เหตุผล</p>
                                    <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl text-sm">
                                        {selectedLeave.reason || '-'}
                                    </p>
                                </div>
                                {selectedLeave.rejectionReason && (
                                    <div className="col-span-2">
                                        <p className="text-xs text-red-500 mb-1">เหตุผลที่ไม่อนุมัติ</p>
                                        <p className="text-red-700 bg-red-50 p-3 rounded-xl text-sm">
                                            {selectedLeave.rejectionReason}
                                        </p>
                                    </div>
                                )}
                                <div className="col-span-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-4 mt-2">
                                    <div>
                                        <p className="text-xs text-gray-500">สถานะ</p>
                                        <div className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_LABELS[selectedLeave.status]?.color}`}>
                                            {STATUS_LABELS[selectedLeave.status]?.label}
                                        </div>
                                    </div>
                                    {selectedLeave.medicalCertificateFile && (
                                        <a
                                            href={selectedLeave.medicalCertificateFile}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                                        >
                                            <Paperclip className="w-4 h-4" />
                                            ดูใบรับรองแพทย์
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                            <button
                                onClick={() => setSelectedLeave(null)}
                                className="w-full py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-xl font-medium text-gray-700 dark:text-white transition-colors shadow-sm"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
