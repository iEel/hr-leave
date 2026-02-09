'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatLeaveDays } from '@/lib/leave-utils';
import {
    CheckSquare,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Search,
    Filter,
    User,
    Calendar,
    MessageSquare,
    Loader2,
    Briefcase,
    Heart,
    Baby,
    Shield,
    Church,
    Scissors,
    GraduationCap,
    RefreshCw,
    UserCheck,
} from 'lucide-react';

// Leave type config
const leaveTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    VACATION: { label: 'ลาพักร้อน', icon: Briefcase, color: 'from-blue-500 to-blue-600' },
    SICK: { label: 'ลาป่วย', icon: Heart, color: 'from-red-500 to-red-600' },
    PERSONAL: { label: 'ลากิจ', icon: User, color: 'from-purple-500 to-purple-600' },
    MATERNITY: { label: 'ลาคลอด', icon: Baby, color: 'from-pink-500 to-pink-600' },
    MILITARY: { label: 'เกณฑ์ทหาร', icon: Shield, color: 'from-green-500 to-green-600' },
    ORDINATION: { label: 'ลาบวช', icon: Church, color: 'from-yellow-500 to-yellow-600' },
    STERILIZATION: { label: 'ลาทำหมัน', icon: Scissors, color: 'from-teal-500 to-teal-600' },
    TRAINING: { label: 'ลาฝึกอบรม', icon: GraduationCap, color: 'from-indigo-500 to-indigo-600' },
};

interface PendingRequest {
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
    hasMedicalCert: boolean;
    medicalCertificateFile: string | null;
    createdAt: string;
    isDelegated?: boolean;
    originalManagerName?: string | null;
}

export default function ApprovalsPage() {
    const { data: session } = useSession();
    const [requests, setRequests] = useState<PendingRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    // Fetch pending requests from API
    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/leave/pending');
            const result = await response.json();
            if (result.success) {
                setRequests(result.data);
            }
        } catch (error) {
            console.error('Error fetching pending requests:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    // Filter requests
    const filteredRequests = requests.filter((req) => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                req.employeeName.toLowerCase().includes(query) ||
                req.employeeId.toLowerCase().includes(query) ||
                req.reason.toLowerCase().includes(query)
            );
        }
        return true;
    });

    const handleApprove = async (id: number) => {
        setProcessingId(id);
        try {
            const response = await fetch('/api/leave/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaveId: id, action: 'APPROVE' }),
            });
            const result = await response.json();
            if (result.success) {
                setRequests(prev => prev.filter(r => r.id !== id));
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error approving leave:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleRejectClick = (request: PendingRequest) => {
        setSelectedRequest(request);
        setRejectReason('');
        setShowRejectModal(true);
    };

    const handleConfirmReject = async () => {
        if (!selectedRequest || !rejectReason.trim()) return;

        setProcessingId(selectedRequest.id);
        try {
            const response = await fetch('/api/leave/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leaveId: selectedRequest.id,
                    action: 'REJECT',
                    rejectionReason: rejectReason,
                }),
            });
            const result = await response.json();
            if (result.success) {
                setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error rejecting leave:', error);
        } finally {
            setProcessingId(null);
            setShowRejectModal(false);
            setSelectedRequest(null);
            setRejectReason('');
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center">
                        <CheckSquare className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            รออนุมัติ
                        </h1>
                        <p className="text-gray-500">คำขอลาที่รอการพิจารณา</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={fetchRequests}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        รีเฟรช
                    </button>
                    <div className="px-4 py-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-xl">
                        <span className="text-yellow-700 dark:text-yellow-300 font-semibold">
                            {requests.length} รายการรออนุมัติ
                        </span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="ค้นหาจากชื่อพนักงาน, รหัส, หรือเหตุผล..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                </div>
            ) : (
                /* Requests List */
                <div className="space-y-4">
                    {filteredRequests.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <p className="text-gray-500">ไม่มีคำขอรออนุมัติ</p>
                        </div>
                    ) : (
                        filteredRequests.map((request) => {
                            const typeConfig = leaveTypeConfig[request.leaveType];
                            const Icon = typeConfig?.icon || Calendar;

                            return (
                                <div
                                    key={request.id}
                                    className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                        {/* Employee Info */}
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                                {request.employeeName?.[0] || 'U'}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    {request.employeeName}
                                                </h3>
                                                <p className="text-sm text-gray-500">
                                                    {request.employeeId} • {request.department || 'ไม่ระบุ'}
                                                </p>
                                                {request.isDelegated && request.originalManagerName && (
                                                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                        <UserCheck className="w-3 h-3" />
                                                        แทน {request.originalManagerName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Leave Info */}
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${typeConfig?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {typeConfig?.label || request.leaveType}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {request.startDate === request.endDate
                                                        ? request.startDate
                                                        : `${request.startDate} - ${request.endDate}`
                                                    }
                                                    {request.isHourly && request.startTime && request.endTime && (
                                                        <span className="ml-1">({request.startTime} - {request.endTime})</span>
                                                    )}
                                                    <span className="ml-1">({formatLeaveDays(request.usageAmount)})</span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleApprove(request.id)}
                                                disabled={processingId === request.id}
                                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                                            >
                                                {processingId === request.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="w-4 h-4" />
                                                )}
                                                อนุมัติ
                                            </button>
                                            <button
                                                onClick={() => handleRejectClick(request)}
                                                disabled={processingId === request.id}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                ไม่อนุมัติ
                                            </button>
                                        </div>
                                    </div>

                                    {/* Request Details */}
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-start gap-2">
                                            <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5" />
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                <span className="font-medium">เหตุผล:</span> {request.reason}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span>ยื่นเมื่อ: {request.createdAt}</span>
                                            {request.hasMedicalCert && (
                                                request.medicalCertificateFile ? (
                                                    <a
                                                        href={request.medicalCertificateFile}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                                                    >
                                                        📎 ดูใบรับรองแพทย์
                                                    </a>
                                                ) : (
                                                    <span className="text-green-600">✓ มีใบรับรองแพทย์</span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && selectedRequest && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowRejectModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                                    <XCircle className="w-8 h-8 text-red-600" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                    ไม่อนุมัติคำขอลา
                                </h3>
                                <p className="text-gray-500">
                                    {selectedRequest.employeeName} - {leaveTypeConfig[selectedRequest.leaveType]?.label}
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    เหตุผลที่ไม่อนุมัติ <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="กรุณาระบุเหตุผล..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRejectModal(false)}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleConfirmReject}
                                    disabled={!rejectReason.trim() || processingId !== null}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {processingId !== null ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : null}
                                    ยืนยันไม่อนุมัติ
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
