'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    CalendarPlus,
    History,
    User,
    Users,
    CheckSquare,
    CalendarDays,
    Settings,
    BarChart3,
    FileText,
    Shield,
    Bell,
    LogOut,
    Menu,
    X,
    Building2,
    ChevronDown,
    CalendarClock,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { UserRole } from '@/types';

interface UserProfile {
    firstName: string;
    lastName: string;
    employeeId: string;
}

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
    roles?: UserRole[];
}

const navItems: NavItem[] = [
    { href: '/dashboard', label: 'แดชบอร์ด', icon: <LayoutDashboard className="w-5 h-5" /> },
    { href: '/leave/request', label: 'ขอลางาน', icon: <CalendarPlus className="w-5 h-5" /> },
    { href: '/leave/history', label: 'ประวัติการลา', icon: <History className="w-5 h-5" /> },
    { href: '/holidays', label: 'ปฏิทินวันหยุด', icon: <CalendarDays className="w-5 h-5" /> },
    { href: '/profile', label: 'โปรไฟล์', icon: <User className="w-5 h-5" /> },
];

const managerNavItems: NavItem[] = [
    { href: '/approvals', label: 'รออนุมัติ', icon: <CheckSquare className="w-5 h-5" />, roles: [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN] },
    { href: '/manager/overview', label: 'ภาพรวมแผนก', icon: <CalendarDays className="w-5 h-5" />, roles: [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN] },
    { href: '/manager/team', label: 'สมาชิกในทีม', icon: <Users className="w-5 h-5" />, roles: [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN] },
    { href: '/manager/calendar', label: 'ปฏิทินทีม', icon: <CalendarClock className="w-5 h-5" />, roles: [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN] },
];

const hrNavItems: NavItem[] = [
    { href: '/hr/overview', label: 'ภาพรวม HR', icon: <Building2 className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/leaves', label: 'ประวัติลาทั้งหมด', icon: <FileText className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/employees', label: 'จัดการพนักงาน', icon: <Users className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/holidays', label: 'จัดการวันหยุด', icon: <CalendarDays className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/settings', label: 'ตั้งค่าระบบ', icon: <Settings className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/year-end', label: 'ประมวลผลสิ้นปี', icon: <CalendarClock className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/analytics', label: 'วิเคราะห์ข้อมูล', icon: <BarChart3 className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/audit-logs', label: 'Audit Logs', icon: <Shield className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
    { href: '/hr/reports', label: 'รายงาน', icon: <FileText className="w-5 h-5" />, roles: [UserRole.HR, UserRole.ADMIN] },
];

const adminNavItems: NavItem[] = [
    { href: '/admin/auth-settings', label: 'ตั้งค่า Authentication', icon: <Shield className="w-5 h-5" />, roles: [UserRole.ADMIN] },
];

export function Sidebar() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isHrExpanded, setIsHrExpanded] = useState(pathname.startsWith('/hr'));
    const [isManagerExpanded, setIsManagerExpanded] = useState(
        pathname.startsWith('/approvals') || pathname.startsWith('/manager')
    );

    // Fetch profile for name display
    const [profile, setProfile] = useState<UserProfile | null>(null);
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch('/api/profile');
                const data = await res.json();
                if (data.success) {
                    setProfile(data.data);
                }
            } catch (error) {
                console.error('Error fetching profile:', error);
            }
        };
        if (session?.user?.id) {
            fetchProfile();
        }
    }, [session?.user?.id]);

    const userRole = session?.user?.role as UserRole;

    const canAccess = (roles?: UserRole[]) => {
        if (!roles) return true;
        return roles.includes(userRole);
    };

    const NavLink = ({ item }: { item: NavItem }) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
            <Link
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
            >
                {item.icon}
                <span className="font-medium">{item.label}</span>
            </Link>
        );
    };

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <Link href="/dashboard" className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                        <CalendarDays className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-gray-900 dark:text-white">HR Leave</h1>
                        <p className="text-xs text-gray-500">ระบบจัดการการลา</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {/* Main Nav */}
                {navItems.map((item) => (
                    <NavLink key={item.href} item={item} />
                ))}

                {/* Manager Section */}
                {(userRole === UserRole.MANAGER || userRole === UserRole.HR || userRole === UserRole.ADMIN) && (
                    <div className="pt-4">
                        <button
                            onClick={() => setIsManagerExpanded(!isManagerExpanded)}
                            className="flex items-center justify-between w-full px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400"
                        >
                            <span>หัวหน้างาน</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${isManagerExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isManagerExpanded && (
                            <div className="space-y-1 mt-1">
                                {managerNavItems
                                    .filter((item) => canAccess(item.roles))
                                    .map((item) => (
                                        <NavLink key={item.href} item={item} />
                                    ))}
                            </div>
                        )}
                    </div>
                )}

                {/* HR Section */}
                {(userRole === UserRole.HR || userRole === UserRole.ADMIN) && (
                    <div className="pt-4">
                        <button
                            onClick={() => setIsHrExpanded(!isHrExpanded)}
                            className="flex items-center justify-between w-full px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400"
                        >
                            <span>HR / Admin</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${isHrExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isHrExpanded && (
                            <div className="space-y-1 mt-1">
                                {hrNavItems
                                    .filter((item) => canAccess(item.roles))
                                    .map((item) => (
                                        <NavLink key={item.href} item={item} />
                                    ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Admin Only Section */}
                {userRole === UserRole.ADMIN && (
                    <div className="pt-4">
                        <div className="px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                            System Admin
                        </div>
                        <div className="space-y-1">
                            {adminNavItems
                                .filter((item) => canAccess(item.roles))
                                .map((item) => (
                                    <NavLink key={item.href} item={item} />
                                ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                        {profile?.firstName?.[0] || session?.user?.firstName?.[0] || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                            {profile?.firstName || session?.user?.firstName} {profile?.lastName || session?.user?.lastName}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{profile?.employeeId || session?.user?.employeeId}</p>
                    </div>
                </div>
                <button
                    onClick={async () => {
                        try {
                            await fetch('/api/auth/log', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'LOGOUT' })
                            });
                        } catch (e) {
                            console.error('Failed to log logout:', e);
                        }
                        signOut({ callbackUrl: '/login' });
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">ออกจากระบบ</span>
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-white shadow-lg dark:bg-gray-800"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={`lg:hidden fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 z-50 transform transition-transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <button
                    onClick={() => setIsMobileOpen(false)}
                    className="absolute top-4 right-4 p-2"
                >
                    <X className="w-6 h-6" />
                </button>
                <SidebarContent />
            </aside>

            {/* Desktop Sidebar */}
            <aside className="hidden lg:block fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                <SidebarContent />
            </aside>
        </>
    );
}
