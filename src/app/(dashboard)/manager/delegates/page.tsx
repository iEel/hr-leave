'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
    UserCheck,
    Plus,
    X,
    Loader2,
    Calendar,
    Clock,
    Trash2,
    Search,
    Users,
    AlertCircle,
    CheckCircle,
    History,
} from 'lucide-react';

interface Delegate {
    id: number;
    delegateUserId: number;
    delegateName: string;
    department: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    status: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
    createdAt: string;
}

interface UserOption {
    id: number;
    name: string;
    department: string;
    employeeId: string;
}

export default function DelegatesPage() {
    const { data: session } = useSession();
    const [delegates, setDelegates] = useState<Delegate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Form state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserOption[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchDelegates = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/manager/delegates');
            const data = await res.json();
            if (data.success) {
                setDelegates(data.data);
            }
        } catch (error) {
            console.error('Error fetching delegates:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDelegates();
    }, [fetchDelegates]);

    // Search users for delegate selection
    const searchUsers = async (query: string) => {
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/manager/delegates/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success) {
                setSearchResults(data.data);
            }
        } catch (error) {
            console.error('Error searching users:', error);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) searchUsers(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleCreate = async () => {
        if (!selectedUser || !startDate || !endDate) return;

        setProcessing(true);
        try {
            const res = await fetch('/api/manager/delegates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    delegateUserId: selectedUser.id,
                    startDate,
                    endDate,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                setShowModal(false);
                resetForm();
                fetchDelegates();
            } else {
                showToast(data.error, 'error');
            }
        } catch (error) {
            showToast('เกิดข้อผิดพลาดในการสร้าง', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleCancel = async (id: number) => {
        if (!confirm('ต้องการยกเลิกการมอบหมายนี้หรือไม่?')) return;

        setProcessingId(id);
        try {
            const res = await fetch(`/api/manager/delegates?id=${id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                fetchDelegates();
            } else {
                showToast(data.error, 'error');
            }
        } catch (error) {
            showToast('เกิดข้อผิดพลาดในการยกเลิก', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const resetForm = () => {
        setSearchQuery('');
        setSearchResults([]);
        setSelectedUser(null);
        setStartDate('');
        setEndDate('');
    };

    const activeDelegates = delegates.filter(d => d.status === 'ACTIVE' || d.status === 'UPCOMING');
    const historyDelegates = delegates.filter(d => d.status === 'EXPIRED' || d.status === 'CANCELLED');

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    กำลังใช้งาน
                </span>;
            case 'UPCOMING':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    <Clock className="w-3 h-3" />
                    รอเริ่มต้น
                </span>;
            case 'EXPIRED':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    หมดอายุ
                </span>;
            case 'CANCELLED':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    ยกเลิก
                </span>;
        }
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="animate-fade-in">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-white animate-fade-in ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                    {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                        <UserCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            มอบหมายผู้อนุมัติแทน
                        </h1>
                        <p className="text-gray-500">กำหนดผู้อนุมัติใบลาแทนเมื่อคุณไม่อยู่</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/25"
                >
                    <Plus className="w-5 h-5" />
                    เพิ่มผู้แทน
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                        <p className="font-medium mb-1">วิธีการทำงาน</p>
                        <ul className="space-y-1 text-amber-600 dark:text-amber-400">
                            <li>• ผู้แทนจะเห็นใบลาของทีมคุณและสามารถอนุมัติ/ไม่อนุมัติได้</li>
                            <li>• ทั้งคุณและผู้แทนจะได้รับแจ้งเตือนเมื่อมีใบลาใหม่</li>
                            <li>• ผู้แทนไม่สามารถอนุมัติใบลาของตัวเองได้</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                </div>
            ) : (
                <>
                    {/* Active Delegates */}
                    <div className="mb-8">
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            <Users className="w-5 h-5 text-amber-600" />
                            ผู้แทนที่ใช้งานอยู่ ({activeDelegates.length})
                        </h2>
                        {activeDelegates.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-gray-100 dark:border-gray-700">
                                <UserCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-500">ยังไม่มีผู้แทนที่กำลังใช้งาน</p>
                                <p className="text-gray-400 text-sm mt-1">กดปุ่ม &quot;เพิ่มผู้แทน&quot; เพื่อเริ่ม</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {activeDelegates.map((d) => (
                                    <div key={d.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg">
                                                    {d.delegateName?.[0] || 'U'}
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-gray-900 dark:text-white">{d.delegateName}</h3>
                                                    <p className="text-sm text-gray-500">{d.employeeId} • {d.department || 'ไม่ระบุแผนก'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 sm:gap-4">
                                                <div className="text-right">
                                                    <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                                                        <Calendar className="w-4 h-4 text-gray-400" />
                                                        {d.startDate} - {d.endDate}
                                                    </div>
                                                    <div className="mt-1">{getStatusBadge(d.status)}</div>
                                                </div>
                                                <button
                                                    onClick={() => handleCancel(d.id)}
                                                    disabled={processingId === d.id}
                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
                                                    title="ยกเลิก"
                                                >
                                                    {processingId === d.id ? (
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-5 h-5" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* History */}
                    {historyDelegates.length > 0 && (
                        <div>
                            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                <History className="w-5 h-5 text-gray-400" />
                                ประวัติ ({historyDelegates.length})
                            </h2>
                            <div className="grid gap-3">
                                {historyDelegates.map((d) => (
                                    <div key={d.id} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 opacity-75">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 font-bold">
                                                {d.delegateName?.[0] || 'U'}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-700 dark:text-gray-300">{d.delegateName}</p>
                                                <p className="text-xs text-gray-400">{d.startDate} - {d.endDate}</p>
                                            </div>
                                            {getStatusBadge(d.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Create Modal */}
            {showModal && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">เพิ่มผู้อนุมัติแทน</h3>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* User Search */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    เลือกผู้แทน <span className="text-red-500">*</span>
                                </label>
                                {selectedUser ? (
                                    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                                            {selectedUser.name[0]}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900 dark:text-white">{selectedUser.name}</p>
                                            <p className="text-xs text-gray-500">{selectedUser.employeeId} • {selectedUser.department || 'ไม่ระบุ'}</p>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedUser(null); setSearchQuery(''); setSearchResults([]); }}
                                            className="p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-lg"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="ค้นหาจากชื่อหรือรหัสพนักงาน..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-amber-500"
                                        />
                                        {isSearching && (
                                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                                        )}

                                        {/* Search Dropdown */}
                                        {searchResults.length > 0 && !selectedUser && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg max-h-48 overflow-y-auto z-10">
                                                {searchResults.map((user) => (
                                                    <button
                                                        key={user.id}
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setSearchQuery('');
                                                            setSearchResults([]);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
                                                    >
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                                                            {user.name[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900 dark:text-white text-sm">{user.name}</p>
                                                            <p className="text-xs text-gray-500">{user.employeeId} • {user.department || 'ไม่ระบุ'}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        วันเริ่มต้น <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        min={today}
                                        onChange={(e) => {
                                            setStartDate(e.target.value);
                                            if (endDate && e.target.value > endDate) {
                                                setEndDate(e.target.value);
                                            }
                                        }}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        วันสิ้นสุด <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        min={startDate || today}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!selectedUser || !startDate || !endDate || processing}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {processing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserCheck className="w-4 h-4" />
                                    )}
                                    มอบหมาย
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
