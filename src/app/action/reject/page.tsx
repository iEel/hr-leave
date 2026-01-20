'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

function RejectContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    // States: LOADING | FORM | SUBMITTING | SUCCESS | ERROR
    const [status, setStatus] = useState<'LOADING' | 'FORM' | 'SUBMITTING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('ERROR');
            setMessage('ไม่พบ Token หรือลิงก์ไม่ถูกต้อง');
            return;
        }

        // Check Token Status
        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/email/action?token=${token}`);
                const data = await res.json();

                if (res.ok) {
                    if (data.status !== 'PENDING') {
                        setStatus('ERROR');
                        setMessage(`รายการนี้ถูกดำเนินการไปแล้ว (Status: ${data.status})`);
                    } else {
                        // Ready
                        setStatus('FORM');
                    }
                } else {
                    setStatus('ERROR');
                    setMessage(data.error || 'Link expired or invalid');
                }
            } catch (error) {
                setStatus('ERROR');
                setMessage('Error checking token status');
            }
        };

        checkStatus();
    }, [token]);

    const handleReject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) return;

        setStatus('SUBMITTING');
        try {
            const res = await fetch('/api/email/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, reason })
            });

            const data = await res.json();

            if (res.ok) {
                setStatus('SUCCESS');
            } else {
                setStatus('ERROR');
                setMessage(data.error || 'เกิดข้อผิดพลาดในการปฏิเสธ');
            }
        } catch (error) {
            setStatus('ERROR');
            setMessage('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">

                {/* 0. LOADING STATE */}
                {status === 'LOADING' && (
                    <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-700">กำลังตรวจสอบข้อมูล...</h3>
                    </div>
                )}

                {/* 1. FORM STATE */}
                {status === 'FORM' && (
                    <form onSubmit={handleReject} className="flex flex-col gap-4">
                        <div className="text-center mb-4">
                            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8 text-yellow-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">ยืนยันการไม่อนุมัติ (Reject)</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                กรุณาระบุเหตุผลที่ไม่อนุมัติคำขอนี้ เพื่อแจ้งให้พนักงานทราบ
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                เหตุผล (Reason) <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all dark:bg-white dark:text-gray-900"
                                placeholder="เช่น งานยังไม่เสร็จ, มีคนลาเยอะแล้ว..."
                                rows={3}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!reason.trim()}
                            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
                        >
                            ยืนยันการไม่อนุมัติ
                        </button>
                    </form>
                )}

                {/* 2. SUBMITTING STATE */}
                {status === 'SUBMITTING' && (
                    <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-700">กำลังบันทึกข้อมูล...</h3>
                    </div>
                )}

                {/* 3. SUCCESS STATE */}
                {status === 'SUCCESS' && (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">ดำเนินการสำเร็จ</h2>
                        <p className="text-gray-600">
                            ระบบได้บันทึกการปฏิเสธคำขอและแจ้งพนักงานเรียบร้อยแล้ว
                        </p>
                    </div>
                )}

                {/* 4. ERROR STATE */}
                {status === 'ERROR' && (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">ทำรายการไม่สำเร็จ</h2>
                        <p className="text-red-500 font-medium bg-red-50 px-4 py-2 rounded-lg">
                            {message}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            ลิงก์อาจหมดอายุ หรือมีการทำรายการไปแล้ว
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ActionRejectPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <RejectContent />
        </Suspense>
    );
}
