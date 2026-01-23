'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Archive,
    Trash2,
    Users,
    Loader2,
    AlertTriangle,
    Check,
    X,
    Calendar,
    RefreshCw,
    Shield
} from 'lucide-react';

interface UserToArchive {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    deletedAt: string;
    daysSinceDeleted: number;
}

interface ArchivedUser {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    archivedAt: string;
    daysSinceArchived: number;
}

export default function UserLifecyclePage() {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<'archive' | 'purge'>('archive');
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Archive state
    const [usersToArchive, setUsersToArchive] = useState<UserToArchive[]>([]);
    const [archiveCount, setArchiveCount] = useState(0);

    // Purge state
    const [usersToPurge, setUsersToPurge] = useState<ArchivedUser[]>([]);
    const [purgeCount, setPurgeCount] = useState(0);
    const [purgeToken, setPurgeToken] = useState('');
    const [relatedData, setRelatedData] = useState({ leaveRequests: 0, leaveBalances: 0 });

    // Fetch preview data
    const fetchArchivePreview = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/archive-users');
            const data = await res.json();
            if (data.success) {
                setUsersToArchive(data.usersToArchive);
                setArchiveCount(data.count);
            }
        } catch (error) {
            console.error('Error fetching archive preview:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPurgePreview = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/purge-archived');
            const data = await res.json();
            if (data.success) {
                setUsersToPurge(data.usersToPurge);
                setPurgeCount(data.count);
                setPurgeToken(data.confirmationToken);
                setRelatedData(data.relatedData);
            }
        } catch (error) {
            console.error('Error fetching purge preview:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'archive') {
            fetchArchivePreview();
        } else {
            fetchPurgePreview();
        }
    }, [activeTab]);

    // Execute archive
    const handleArchive = async () => {
        if (!confirm('ยืนยันการ Archive ผู้ใช้ที่เลือก? ข้อมูลจะถูกย้ายไปตาราง Archive')) return;

        setExecuting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/archive-users', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `Archive สำเร็จ: ${data.archived.users} users, ${data.archived.leaveRequests} leave requests` });
                fetchArchivePreview();
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถ Archive ได้' });
        } finally {
            setExecuting(false);
        }
    };

    // Execute purge
    const handlePurge = async () => {
        if (!confirm('⚠️ คำเตือน: การ Purge จะลบข้อมูลถาวร ไม่สามารถกู้คืนได้! ยืนยันหรือไม่?')) return;

        setExecuting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/purge-archived', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmationToken: purgeToken })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `Purge สำเร็จ: ${data.purged.users} users ถูกลบถาวร` });
                fetchPurgePreview();
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถ Purge ได้' });
        } finally {
            setExecuting(false);
        }
    };

    // Admin only
    if (session?.user?.role !== 'ADMIN') {
        return (
            <div className="p-8 text-center">
                <Shield className="w-16 h-16 mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-gray-500">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        AD User Lifecycle
                    </h1>
                    <p className="text-gray-500">จัดการผู้ใช้ที่ถูกลบจาก AD (Archive / Purge)</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('archive')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'archive'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                >
                    <Archive className="w-5 h-5" />
                    Archive ({archiveCount})
                </button>
                <button
                    onClick={() => setActiveTab('purge')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'purge'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                >
                    <Trash2 className="w-5 h-5" />
                    Purge ({purgeCount})
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700'
                    }`}>
                    {message.type === 'success' ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-red-600" />}
                    <p className={message.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}>{message.text}</p>
                </div>
            )}

            {/* Archive Tab */}
            {activeTab === 'archive' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ผู้ใช้ที่พร้อม Archive</h2>
                            <p className="text-sm text-gray-500">ผู้ใช้ที่ถูกลบจาก AD มากกว่า 1 ปี</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={fetchArchivePreview}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                            <button
                                onClick={handleArchive}
                                disabled={executing || usersToArchive.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg"
                            >
                                {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                                Archive ทั้งหมด
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        </div>
                    ) : usersToArchive.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <Archive className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>ไม่มีผู้ใช้ที่ต้อง Archive</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">รหัสพนักงาน</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ชื่อ-นามสกุล</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">อีเมล</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">วันที่ถูกลบจาก AD</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">จำนวนวัน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usersToArchive.map((user) => (
                                        <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700/50">
                                            <td className="py-3 px-4 font-medium">{user.employeeId}</td>
                                            <td className="py-3 px-4">{user.firstName} {user.lastName}</td>
                                            <td className="py-3 px-4 text-gray-500">{user.email}</td>
                                            <td className="py-3 px-4 text-gray-500">
                                                {new Date(user.deletedAt).toLocaleDateString('th-TH')}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                                                    {user.daysSinceDeleted} วัน
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Purge Tab */}
            {activeTab === 'purge' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    {/* Warning */}
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                            <AlertTriangle className="w-5 h-5" />
                            <strong>คำเตือน:</strong> การ Purge จะลบข้อมูลถาวร ไม่สามารถกู้คืนได้!
                        </div>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลที่พร้อม Purge</h2>
                            <p className="text-sm text-gray-500">ผู้ใช้ที่ถูก Archive มากกว่า 3 ปี</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={fetchPurgePreview}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                            <button
                                onClick={handlePurge}
                                disabled={executing || usersToPurge.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg"
                            >
                                {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                Purge ทั้งหมด
                            </button>
                        </div>
                    </div>

                    {/* Related data summary */}
                    {usersToPurge.length > 0 && (
                        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                ข้อมูลที่จะถูกลบ: <strong>{usersToPurge.length}</strong> users,{' '}
                                <strong>{relatedData.leaveRequests}</strong> leave requests,{' '}
                                <strong>{relatedData.leaveBalances}</strong> leave balances
                            </p>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                        </div>
                    ) : usersToPurge.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <Trash2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>ไม่มีข้อมูลที่ต้อง Purge</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">รหัสพนักงาน</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ชื่อ-นามสกุล</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">วันที่ Archive</th>
                                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">จำนวนวัน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usersToPurge.map((user) => (
                                        <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700/50">
                                            <td className="py-3 px-4 font-medium">{user.employeeId}</td>
                                            <td className="py-3 px-4">{user.firstName} {user.lastName}</td>
                                            <td className="py-3 px-4 text-gray-500">
                                                {new Date(user.archivedAt).toLocaleDateString('th-TH')}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                                                    {user.daysSinceArchived} วัน
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Info Box */}
            <div className="mt-6 bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-700">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-2">📌 Data Retention Policy</h3>
                <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
                    <li>• <strong>0-1 ปี:</strong> ผู้ใช้ที่ถูกลบจาก AD จะมีสถานะ AD_DELETED (ยังอยู่ในระบบ)</li>
                    <li>• <strong>1-3 ปี:</strong> สามารถ Archive ย้ายไปตาราง Archive (เก็บเป็นประวัติ)</li>
                    <li>• <strong>&gt; 3 ปี:</strong> สามารถ Purge ลบข้อมูลถาวร</li>
                </ul>
            </div>
        </div>
    );
}
