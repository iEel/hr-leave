import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getPool } from '@/lib/db';
import { formatLeaveDays } from '@/lib/leave-utils';
import {
    CalendarDays,
    Clock,
    TrendingUp,
    AlertCircle,
    ArrowRight,
    Briefcase,
    Heart,
    User,
    Baby,
    Shield,
    Church,
    Scissors,
    GraduationCap,
    HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

// Leave type icons mapping
const leaveTypeIcons: Record<string, React.ReactNode> = {
    VACATION: <Briefcase className="w-5 h-5" />,
    SICK: <Heart className="w-5 h-5" />,
    PERSONAL: <User className="w-5 h-5" />,
    MATERNITY: <Baby className="w-5 h-5" />,
    MILITARY: <Shield className="w-5 h-5" />,
    ORDINATION: <Church className="w-5 h-5" />,
    STERILIZATION: <Scissors className="w-5 h-5" />,
    TRAINING: <GraduationCap className="w-5 h-5" />,
    OTHER: <HelpCircle className="w-5 h-5" />,
};

const leaveTypeNames: Record<string, string> = {
    VACATION: 'พักร้อน',
    SICK: 'ลาป่วย',
    PERSONAL: 'ลากิจ',
    MATERNITY: 'ลาคลอด',
    MILITARY: 'เกณฑ์ทหาร',
    ORDINATION: 'ลาบวช',
    STERILIZATION: 'ทำหมัน',
    TRAINING: 'ฝึกอบรม',
    OTHER: 'อื่นๆ',
};

const leaveTypeColors: Record<string, string> = {
    VACATION: 'from-blue-500 to-blue-600',
    SICK: 'from-red-500 to-red-600',
    PERSONAL: 'from-purple-500 to-purple-600',
    MATERNITY: 'from-pink-500 to-pink-600',
    MILITARY: 'from-green-500 to-green-600',
    ORDINATION: 'from-yellow-500 to-yellow-600',
    STERILIZATION: 'from-teal-500 to-teal-600',
    TRAINING: 'from-indigo-500 to-indigo-600',
    OTHER: 'from-gray-500 to-gray-600',
};

// Fetch leave balances from database
async function getLeaveBalances(userId: number) {
    try {
        const pool = await getPool();
        const currentYear = new Date().getFullYear();

        // Query leave balances
        let result = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT leaveType as type, entitlement, used, remaining
                FROM LeaveBalances
                WHERE userId = @userId AND year = @year
                ORDER BY leaveType
            `);

        // If no balances exist, create default ones
        if (result.recordset.length === 0) {
            const quotaResult = await pool.request().query(`
                SELECT leaveType, defaultDays FROM LeaveQuotaSettings
            `);

            for (const quota of quotaResult.recordset) {
                await pool.request()
                    .input('userId', userId)
                    .input('leaveType', quota.leaveType)
                    .input('year', currentYear)
                    .input('entitlement', quota.defaultDays)
                    .input('remaining', quota.defaultDays)
                    .query(`
                        INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver)
                        VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0)
                    `);
            }

            // Re-query
            result = await pool.request()
                .input('userId', userId)
                .input('year', currentYear)
                .query(`
                    SELECT leaveType as type, entitlement, used, remaining
                    FROM LeaveBalances
                    WHERE userId = @userId AND year = @year
                    ORDER BY leaveType
                `);
        }

        return result.recordset;
    } catch (error) {
        console.error('Error fetching leave balances:', error);
        return [];
    }
}

// Fetch recent leave requests from database
async function getRecentRequests(userId: number) {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT TOP 5
                    id,
                    leaveType as type,
                    CONVERT(varchar, startDatetime, 23) as startDate,
                    CONVERT(varchar, endDatetime, 23) as endDate,
                    status,
                    usageAmount as days,
                    isHourly,
                    startTime,
                    endTime
                FROM LeaveRequests
                WHERE userId = @userId
                ORDER BY createdAt DESC
            `);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching recent requests:', error);
        return [];
    }
}

// Fetch upcoming holidays from database
async function getUpcomingHolidays() {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TOP 5
                CONVERT(varchar, date, 23) as date,
                name
            FROM PublicHolidays
            WHERE date >= GETDATE()
            ORDER BY date ASC
        `);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching holidays:', error);
        return [];
    }
}

export default async function DashboardPage() {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    const userId = Number(session.user.id);

    // Fetch data from database
    const leaveBalances = await getLeaveBalances(userId);
    const recentRequests = await getRecentRequests(userId);
    const upcomingHolidays = await getUpcomingHolidays();

    const statusColors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        APPROVED: 'bg-green-100 text-green-800',
        REJECTED: 'bg-red-100 text-red-800',
        CANCELLED: 'bg-gray-100 text-gray-800',
    };

    const statusNames: Record<string, string> = {
        PENDING: 'รออนุมัติ',
        APPROVED: 'อนุมัติแล้ว',
        REJECTED: 'ไม่อนุมัติ',
        CANCELLED: 'ยกเลิก',
    };

    // Filter to show only main leave types
    const mainLeaveTypes = ['VACATION', 'SICK', 'PERSONAL'];
    const displayBalances = leaveBalances.filter(b => mainLeaveTypes.includes(b.type));

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Welcome Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        สวัสดี, {session.user.firstName}! 👋
                    </h1>
                    <p className="text-gray-500 mt-1">
                        ยินดีต้อนรับสู่ระบบจัดการการลางาน
                    </p>
                </div>
                <Link
                    href="/leave/request"
                    data-tour="request-leave-btn"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 transition-all"
                >
                    <CalendarDays className="w-5 h-5" />
                    ขอลางาน
                </Link>
            </div>

            {/* Stats Cards - Leave Balances */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="dashboard-balance">
                {displayBalances.length > 0 ? displayBalances.map((balance) => (
                    <div
                        key={balance.type}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${leaveTypeColors[balance.type] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white`}>
                                        {leaveTypeIcons[balance.type]}
                                    </div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {leaveTypeNames[balance.type] || balance.type}
                                    </span>
                                </div>
                                <div className="mt-4">
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {formatLeaveDays(balance.remaining)}
                                    </p>
                                    <p className="text-sm text-gray-500 mt-1">
                                        ใช้ไป {formatLeaveDays(balance.used)} / {formatLeaveDays(balance.entitlement)}
                                    </p>
                                </div>
                            </div>
                            <div className="w-16 h-16">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                        cx="32"
                                        cy="32"
                                        r="28"
                                        fill="none"
                                        stroke="#e5e7eb"
                                        strokeWidth="8"
                                    />
                                    <circle
                                        cx="32"
                                        cy="32"
                                        r="28"
                                        fill="none"
                                        stroke="url(#gradient)"
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(balance.remaining / balance.entitlement) * 176} 176`}
                                    />
                                    <defs>
                                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#6366f1" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-3 text-center py-8 text-gray-500">
                        กำลังโหลดข้อมูลวันลา...
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Leave Requests */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700" data-tour="leave-history">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-blue-600" />
                            <h2 className="font-semibold text-gray-900 dark:text-white">ประวัติการลาล่าสุด</h2>
                        </div>
                        <Link
                            href="/leave/history"
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                            ดูทั้งหมด
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {recentRequests.length > 0 ? recentRequests.map((request) => (
                            <div key={request.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${leaveTypeColors[request.type] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white`}>
                                            {leaveTypeIcons[request.type]}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {leaveTypeNames[request.type] || request.type}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {request.startDate} {request.startDate !== request.endDate && `- ${request.endDate}`}
                                                {request.isHourly && request.startTime && request.endTime && (
                                                    <span className="ml-1">({request.startTime} - {request.endTime})</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusColors[request.status]}`}>
                                            {statusNames[request.status]}
                                        </span>
                                        <p className="text-sm text-gray-500 mt-1">{formatLeaveDays(request.days)}</p>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="p-8 text-center text-gray-500">
                                ยังไม่มีประวัติการลา
                            </div>
                        )}
                    </div>
                </div>

                {/* Upcoming Holidays */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700" data-tour="upcoming-holidays">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <h2 className="font-semibold text-gray-900 dark:text-white">วันหยุดที่กำลังจะมาถึง</h2>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcomingHolidays.length > 0 ? upcomingHolidays.map((holiday, index) => (
                            <div key={index} className="p-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white">
                                    <CalendarDays className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{holiday.name}</p>
                                    <p className="text-sm text-gray-500">{holiday.date}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="p-8 text-center text-gray-500">
                                ไม่มีวันหยุดที่กำลังจะมาถึง
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Info Card */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
                <div className="flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold mb-1">ข้อควรรู้</h3>
                        <p className="text-sm text-blue-100">
                            หากลาป่วยตั้งแต่ 3 วันขึ้นไป กรุณาแนบใบรับรองแพทย์ และหากต้องการยกเลิกใบลา สามารถทำได้เฉพาะกรณีที่สถานะยังเป็น &quot;รออนุมัติ&quot; เท่านั้น
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
