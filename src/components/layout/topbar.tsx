'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bell, Search, Check, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useToast } from '../ui/Toast';

interface Notification {
    id: number;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    link: string | null;
    relatedId: number | null;
    createdAt: string;
}

export function Topbar() {
    const { data: session } = useSession();
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const toast = useToast();
    const prevNotificationsRef = useRef<number[]>([]);
    const isFirstFetchRef = useRef(true);

    // Fetch notifications
    const fetchNotifications = async () => {
        try {
            const response = await fetch('/api/notifications');
            const result = await response.json();
            if (result.success) {
                const newNotifications = result.data as Notification[];

                // Check for new unread notifications (not on first fetch)
                if (!isFirstFetchRef.current) {
                    const prevIds = prevNotificationsRef.current;
                    const newUnreadNotifications = newNotifications.filter(
                        (n: Notification) => !n.isRead && !prevIds.includes(n.id)
                    );

                    // Show toast for each new notification
                    newUnreadNotifications.forEach((notification: Notification) => {
                        toast.info(`📬 ${notification.title}: ${notification.message}`, 5000);
                    });
                }

                // Update refs
                isFirstFetchRef.current = false;
                prevNotificationsRef.current = newNotifications.map((n: Notification) => n.id);

                setNotifications(newNotifications);
                setUnreadCount(result.unreadCount);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    // Fetch on mount and periodically
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 15000); // Every 15 seconds
        return () => clearInterval(interval);
    }, []);

    // Refresh when dropdown opens
    const handleBellClick = () => {
        if (!showNotifications) {
            fetchNotifications(); // Refresh immediately when opening
        }
        setShowNotifications(!showNotifications);
    };

    // Mark single notification as read and navigate
    const handleNotificationClick = async (notification: Notification) => {
        // Mark as read if not already read
        if (!notification.isRead) {
            try {
                await fetch('/api/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notificationId: notification.id }),
                });
                // Update local state
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, isRead: true } : n
                ));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        }

        // Navigate to link if exists
        if (notification.link) {
            setShowNotifications(false);
            router.push(notification.link);
        }
    };

    // Mark all as read
    const markAllAsRead = async () => {
        setIsLoading(true);
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (error) {
            console.error('Error marking notifications as read:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Format time ago
    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
        return dateString;
    };

    return (
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700">
            <div className="h-full px-4 lg:px-8 flex items-center justify-between">
                {/* Left side - Page Title / Search */}
                <div className="flex items-center gap-4 lg:ml-0 ml-14">
                    <div className="relative hidden md:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="ค้นหา..."
                            className="pl-10 pr-4 py-2 w-64 rounded-xl bg-gray-100 dark:bg-gray-800 border-0 focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                </div>

                {/* Right side - Notifications & User */}
                <div className="flex items-center gap-4">
                    {/* Notification Bell */}
                    <div className="relative">
                        <button
                            onClick={handleBellClick}
                            className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <Bell className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowNotifications(false)}
                                />
                                <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">การแจ้งเตือน</h3>
                                        {unreadCount > 0 && (
                                            <button
                                                onClick={markAllAsRead}
                                                disabled={isLoading}
                                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Check className="w-3 h-3" />
                                                )}
                                                อ่านทั้งหมด
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {notifications.length === 0 ? (
                                            <div className="p-6 text-center text-gray-500">
                                                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                                <p className="text-sm">ไม่มีการแจ้งเตือน</p>
                                            </div>
                                        ) : (
                                            notifications.map((notification) => (
                                                <div
                                                    key={notification.id}
                                                    onClick={() => handleNotificationClick(notification)}
                                                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 transition-colors ${!notification.isRead
                                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                                                        : ''
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {!notification.isRead && (
                                                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm font-medium ${notification.isRead
                                                                ? 'text-gray-600 dark:text-gray-400'
                                                                : 'text-gray-900 dark:text-white'
                                                                }`}>
                                                                {notification.title}
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                                {notification.message}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <p className="text-xs text-blue-500">
                                                                    {formatTimeAgo(notification.createdAt)}
                                                                </p>
                                                                {notification.link && (
                                                                    <span className="text-xs text-gray-400">• คลิกเพื่อดูรายละเอียด</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    {notifications.length > 0 && (
                                        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                                            <button
                                                onClick={() => {
                                                    setShowNotifications(false);
                                                    router.push('/notifications');
                                                }}
                                                className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                ดูทั้งหมด
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Dark Mode Toggle */}
                    <ThemeToggle />

                    {/* User Info (Desktop) */}
                    <div className="hidden md:flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {session?.user?.firstName} {session?.user?.lastName}
                            </p>
                            <p className="text-xs text-gray-500">{session?.user?.department || 'Loading...'}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                            {session?.user?.firstName?.[0] || 'U'}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
