'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, User, Lock, AlertCircle, Loader2 } from 'lucide-react';

// Separate component that uses useSearchParams
function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
    const error = searchParams.get('error');

    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(error ? 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' : '');
    const [showMicrosoftButton, setShowMicrosoftButton] = useState(false);

    // Fetch auth mode on mount
    useEffect(() => {
        fetch('/api/auth/mode')
            .then(res => res.json())
            .then(data => {
                setShowMicrosoftButton(data.showMicrosoftButton);
            })
            .catch(() => {
                setShowMicrosoftButton(false);
            });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage('');

        try {
            const result = await signIn('credentials', {
                employeeId,
                password,
                redirect: false,
            });

            if (result?.error) {
                setErrorMessage(result.error);
                setIsLoading(false);
            } else {
                // Log login to audit
                try {
                    await fetch('/api/auth/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'LOGIN' })
                    });
                } catch (e) {
                    console.error('Failed to log login:', e);
                }
                router.push(callbackUrl);
                router.refresh();
            }
        } catch (error) {
            setErrorMessage('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Error Message */}
            {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-200 text-sm">{errorMessage}</p>
                </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Employee ID Field */}
                <div>
                    <label htmlFor="employeeId" className="block text-sm font-medium text-white/80 mb-2">
                        รหัสพนักงาน
                    </label>
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                            id="employeeId"
                            type="text"
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            placeholder="กรอกรหัสพนักงาน"
                            required
                            disabled={isLoading}
                            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* Password Field */}
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-2">
                        รหัสผ่าน
                    </label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="กรอกรหัสผ่าน"
                            required
                            disabled={isLoading}
                            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            กำลังเข้าสู่ระบบ...
                        </>
                    ) : (
                        <>
                            <LogIn className="w-5 h-5" />
                            เข้าสู่ระบบ
                        </>
                    )}
                </button>
            </form>

            {/* Microsoft Login Button - Only show when Azure AD or Hybrid mode */}
            {showMicrosoftButton && (
                <>
                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/20"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-3 bg-transparent text-white/40">หรือ</span>
                        </div>
                    </div>

                    <button
                        onClick={() => signIn('microsoft-entra-id', { callbackUrl })}
                        disabled={isLoading}
                        className="w-full py-3.5 px-4 rounded-xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                        </svg>
                        Sign in with Microsoft
                    </button>
                </>
            )}
        </>
    );
}

// Loading fallback for Suspense
function LoginFormSkeleton() {
    return (
        <div className="space-y-5 animate-pulse">
            <div>
                <div className="h-4 w-20 bg-white/20 rounded mb-2"></div>
                <div className="h-12 bg-white/10 rounded-xl"></div>
            </div>
            <div>
                <div className="h-4 w-16 bg-white/20 rounded mb-2"></div>
                <div className="h-12 bg-white/10 rounded-xl"></div>
            </div>
            <div className="h-12 bg-white/20 rounded-xl"></div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 p-4">
            {/* Background decorations */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
            </div>

            {/* Login Card - Glassmorphism */}
            <div className="relative w-full max-w-md">
                <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8">
                    {/* Logo & Title */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-4">
                            <LogIn className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            HR Leave Management
                        </h1>
                        <p className="text-white/60 text-sm">
                            ระบบจัดการการลางาน
                        </p>
                    </div>

                    {/* Wrap LoginForm with Suspense */}
                    <Suspense fallback={<LoginFormSkeleton />}>
                        <LoginForm />
                    </Suspense>

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-white/10 text-center">
                        <p className="text-white/40 text-xs">
                            © 2024 Sonic Interfreight / Grandlink Logistics
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
