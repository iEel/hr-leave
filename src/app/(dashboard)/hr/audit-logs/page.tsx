'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Shield,
    Search,
    Filter,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Calendar,
    User,
    FileText,
    Eye
} from 'lucide-react';

interface AuditLog {
    id: number;
    userId: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    action: string;
    targetTable: string;
    targetId: number | null;
    oldValue: string | null;
    newValue: string | null;
    ipAddress: string | null;
    createdAt: string;
}

const actionNames: Record<string, string> = {
    'LOGIN': 'เข้าสู่ระบบ',
    'LOGOUT': 'ออกจากระบบ',
    'CREATE_EMPLOYEE': 'สร้างพนักงาน',
    'UPDATE_EMPLOYEE': 'แก้ไขพนักงาน',
    'DELETE_EMPLOYEE': 'ลบพนักงาน',
    'RESET_PASSWORD': 'รีเซ็ตรหัสผ่าน',
    'CREATE_LEAVE_REQUEST': 'ยื่นขอลา',
    'CANCEL_LEAVE_REQUEST': 'ยกเลิกใบลา',
    'APPROVE_LEAVE': 'อนุมัติใบลา',
    'REJECT_LEAVE': 'ไม่อนุมัติใบลา',
    'CREATE_HOLIDAY': 'เพิ่มวันหยุด',
    'UPDATE_HOLIDAY': 'แก้ไขวันหยุด',
    'DELETE_HOLIDAY': 'ลบวันหยุด',
    'UPDATE_SETTINGS': 'แก้ไขการตั้งค่า',
    'YEAR_END_PROCESS': 'ประมวลผลสิ้นปี',
    'IMPORT_EMPLOYEES': 'Import พนักงาน',
    'EXPORT_EMPLOYEES': 'Export พนักงาน'
};

const actionColors: Record<string, string> = {
    'LOGIN': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'LOGOUT': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    'CREATE_EMPLOYEE': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'UPDATE_EMPLOYEE': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    'DELETE_EMPLOYEE': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'RESET_PASSWORD': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'APPROVE_LEAVE': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'REJECT_LEAVE': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'YEAR_END_PROCESS': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function AuditLogsPage() {
    const { data: session } = useSession();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [availableActions, setAvailableActions] = useState<string[]>([]);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Modal for viewing details
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '30',
                ...(actionFilter && { action: actionFilter }),
                ...(dateFrom && { dateFrom }),
                ...(dateTo && { dateTo })
            });

            const res = await fetch(`/api/hr/audit-logs?${params}`);
            const data = await res.json();

            if (data.success) {
                setLogs(data.data.logs);
                setTotalPages(data.data.pagination.totalPages);
                setTotal(data.data.pagination.total);
                setAvailableActions(data.data.availableActions);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter, dateFrom, dateTo]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-gray-700 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Audit Logs
                        </h1>
                        <p className="text-gray-500">ประวัติการใช้งานระบบ ({total} รายการ)</p>
                    </div>
                </div>
                <button
                    onClick={() => { setPage(1); fetchLogs(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    รีเฟรช
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">ตัวกรอง:</span>
                    </div>

                    <select
                        value={actionFilter}
                        onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                    >
                        <option value="">-- ทุกกิจกรรม --</option>
                        {availableActions.map(act => (
                            <option key={act} value={act}>{actionNames[act] || act}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => { setDateTo(e.target.value); setPage(1); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                        />
                    </div>

                    {(actionFilter || dateFrom || dateTo) && (
                        <button
                            onClick={() => { setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
                            className="text-sm text-red-500 hover:text-red-700"
                        >
                            ล้างตัวกรอง
                        </button>
                    )}
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        ไม่พบข้อมูล Audit Log
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">เวลา</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">ผู้ใช้</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">กิจกรรม</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">รายละเอียด</th>
                                    <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">ดู</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                            {formatDate(log.createdAt)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                    {log.firstName?.[0] || '?'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {log.firstName} {log.lastName}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{log.employeeId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                                                {actionNames[log.action] || log.action}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                                            <span className="text-gray-400">{log.targetTable}</span>
                                            {log.targetId && <span className="ml-1">#{log.targetId}</span>}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {(log.oldValue || log.newValue) && (
                                                <button
                                                    onClick={() => setSelectedLog(log)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            หน้า {page} จาก {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            รายละเอียด Log #{selectedLog.id}
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500">กิจกรรม:</span>
                                    <span className={`ml-2 px-2 py-1 rounded-lg text-xs font-medium ${actionColors[selectedLog.action] || 'bg-gray-100 text-gray-700'}`}>
                                        {actionNames[selectedLog.action] || selectedLog.action}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500">เวลา:</span>
                                    <span className="ml-2 text-gray-900 dark:text-white">{formatDate(selectedLog.createdAt)}</span>
                                </div>
                            </div>

                            {selectedLog.oldValue && (
                                <div>
                                    <p className="text-sm font-medium text-red-600 mb-1">ข้อมูลเดิม:</p>
                                    <pre className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs overflow-x-auto">
                                        {JSON.stringify(JSON.parse(selectedLog.oldValue), null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedLog.newValue && (
                                <div>
                                    <p className="text-sm font-medium text-green-600 mb-1">ข้อมูลใหม่:</p>
                                    <pre className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs overflow-x-auto">
                                        {JSON.stringify(JSON.parse(selectedLog.newValue), null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setSelectedLog(null)}
                            className="mt-6 w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                            ปิด
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
