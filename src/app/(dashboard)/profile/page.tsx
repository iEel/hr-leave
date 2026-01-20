'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    User,
    Mail,
    Building2,
    Briefcase,
    Calendar,
    Shield,
    Clock,
    Edit,
    Key,
    X,
    Loader2,
    CheckCircle,
    AlertCircle,
} from 'lucide-react';

const roleLabels: Record<string, string> = {
    EMPLOYEE: 'พนักงาน',
    MANAGER: 'หัวหน้าแผนก',
    HR: 'ฝ่ายบุคคล',
    ADMIN: 'ผู้ดูแลระบบ',
};

const companyLabels: Record<string, string> = {
    SONIC: 'บริษัท โซนิค อินเตอร์เฟรท จำกัด',
    GRANDLINK: 'บริษัท แกรนด์ลิงค์ ลอจิสติคส์ จำกัด',
};

interface UserProfile {
    firstName: string;
    lastName: string;
    email: string;
    employeeId: string;
    company: string;
    department: string;
    role: string;
}

export default function ProfilePage() {
    const { data: session, update: updateSession } = useSession();
    const user = session?.user;

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Modals
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);

    // Password form
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    // Fetch profile data
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
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const displayName = profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : (user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : '-');

    const profileFields = [
        { icon: User, label: 'รหัสพนักงาน', value: profile?.employeeId || user?.employeeId || '-' },
        { icon: User, label: 'ชื่อ-นามสกุล', value: displayName },
        { icon: Mail, label: 'อีเมล', value: profile?.email || user?.email || '-' },
        { icon: Building2, label: 'บริษัท', value: companyLabels[profile?.company || user?.company || ''] || profile?.company || '-' },
        { icon: Briefcase, label: 'แผนก', value: profile?.department || user?.department || '-' },
        { icon: Shield, label: 'ตำแหน่ง/Role', value: roleLabels[profile?.role || user?.role || ''] || profile?.role || '-' },
    ];

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');

        if (newPassword !== confirmPassword) {
            setPasswordError('รหัสผ่านใหม่ไม่ตรงกัน');
            return;
        }

        if (newPassword.length < 6) {
            setPasswordError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
            return;
        }

        setPasswordLoading(true);
        try {
            const res = await fetch('/api/profile/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'เกิดข้อผิดพลาด');
            }

            setPasswordSuccess(true);
            setTimeout(() => {
                setShowPasswordModal(false);
                setPasswordSuccess(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }, 2000);
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 mb-6 text-white">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center text-4xl font-bold">
                        {profile?.firstName?.[0] || user?.firstName?.[0] || 'U'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-1">
                            {displayName !== '-' ? displayName : 'Loading...'}
                        </h1>
                        <p className="text-blue-100">{profile?.department || user?.department} • {roleLabels[profile?.role || user?.role || ''] || profile?.role}</p>
                        <p className="text-blue-200 text-sm mt-2">{profile?.employeeId || user?.employeeId}</p>
                    </div>
                </div>
            </div>

            {/* Profile Info */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลส่วนตัว</h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {loading ? (
                        <div className="p-8 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                            <p className="text-gray-500 mt-2">กำลังโหลดข้อมูล...</p>
                        </div>
                    ) : (
                        profileFields.map((field, index) => {
                            const Icon = field.icon;
                            return (
                                <div key={index} className="px-6 py-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500">{field.label}</p>
                                        <p className="font-medium text-gray-900 dark:text-white">{field.value}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <button
                    onClick={() => setShowPasswordModal(true)}
                    className="flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-300 transition-all"
                >
                    <Key className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">เปลี่ยนรหัสผ่าน</span>
                </button>
                <button
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-300 transition-all"
                >
                    <Edit className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">แก้ไขข้อมูล</span>
                </button>
            </div>

            {/* Session Info */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Session จะหมดอายุอัตโนมัติใน 15 นาที หากไม่มีการใช้งาน</span>
                </div>
            </div>

            {/* Password Modal */}
            {showPasswordModal && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowPasswordModal(false)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">เปลี่ยนรหัสผ่าน</h3>
                                <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {passwordSuccess ? (
                                <div className="text-center py-8">
                                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                    <p className="text-lg font-medium text-gray-900 dark:text-white">เปลี่ยนรหัสผ่านสำเร็จ!</p>
                                </div>
                            ) : (
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    {passwordError && (
                                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            <span className="text-sm">{passwordError}</span>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            รหัสผ่านปัจจุบัน
                                        </label>
                                        <input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            required
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            รหัสผ่านใหม่
                                        </label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            ยืนยันรหัสผ่านใหม่
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowPasswordModal(false)}
                                            className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={passwordLoading}
                                            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                            บันทึก
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Edit Profile Modal */}
            {showEditModal && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowEditModal(false)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">แก้ไขข้อมูล</h3>
                                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="text-center py-8">
                                <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                                <p className="text-gray-600 dark:text-gray-400">
                                    กรุณาติดต่อฝ่าย HR เพื่อแก้ไขข้อมูลส่วนตัว
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    เพื่อความปลอดภัยของข้อมูล การแก้ไขต้องดำเนินการผ่าน HR เท่านั้น
                                </p>
                            </div>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="w-full py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
