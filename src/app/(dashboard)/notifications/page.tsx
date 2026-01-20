'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Bell,
    Check,
    Loader2,
    CheckCheck,
    Trash2,
} from 'lucide-react';

interface Notification {
    id: number;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    link: string | null;
    createdAt: string;
}

export default function NotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications?all=true');
            const data = await res.json();
            if (data.success) {
                setNotifications(data.data);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: number) => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId: id }),
            });
            setNotifications(prev => prev.map(n =>
                n.id === id ? { ...n, isRead: true } : n
            ));
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    const markAllAsRead = async () => {
        setProcessing(true);
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (error) {
            console.error('Error marking all as read:', error);
        } finally {
            setProcessing(false);
        }
    };

    const handleClick = async (notification: Notification) => {
        if (!notification.isRead) {
            await markAsRead(notification.id);
        }
        if (notification.link) {
            router.push(notification.link);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                        <Bell className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            การแจ้งเตือน
                        </h1>
                        <p className="text-gray-500">
                            {unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'ไม่มีรายการที่ยังไม่ได้อ่าน'}
                        </p>
                    </div>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={markAllAsRead}
                        disabled={processing}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        {processing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <CheckCheck className="w-4 h-4" />
                        )}
                        อ่านทั้งหมดแล้ว
                    </button>
                )}
            </div>

            {/* Notifications List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
                        <p className="text-gray-500">กำลังโหลด...</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="p-12 text-center">
                        <Bell className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500">ไม่มีการแจ้งเตือน</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => handleClick(notification)}
                                className={`p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${!notification.isRead
                                        ? 'bg-blue-50 dark:bg-blue-900/10 border-l-4 border-l-blue-500'
                                        : ''
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${notification.isRead ? 'bg-gray-300' : 'bg-blue-500'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className={`font-medium ${notification.isRead
                                                        ? 'text-gray-600 dark:text-gray-400'
                                                        : 'text-gray-900 dark:text-white'
                                                    }`}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {notification.message}
                                                </p>
                                            </div>
                                            {!notification.isRead && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        markAsRead(notification.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"
                                                    title="ทำเครื่องหมายว่าอ่านแล้ว"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <p className="text-xs text-gray-400">
                                                {formatDate(notification.createdAt)}
                                            </p>
                                            {notification.link && (
                                                <span className="text-xs text-blue-500">• คลิกเพื่อดูรายละเอียด</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
