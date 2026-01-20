'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function ApproveContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'LOADING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('ERROR');
            setMessage('ไม่พบ Token หรือลิงก์ไม่ถูกต้อง');
            return;
        }

        const processApproval = async () => {
            try {
                const res = await fetch('/api/email/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, reason: 'Approved via Email' })
                });

                const data = await res.json();

                if (res.ok) {
                    setStatus('SUCCESS');
                } else {
                    setStatus('ERROR');
                    setMessage(data.error || 'เกิดข้อผิดพลาดในการอนุมัติ');
                }
            } catch (error) {
                setStatus('ERROR');
                setMessage('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
            }
        };

        processApproval();
    }, [token]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                {status === 'LOADING' && (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                        <h2 className="text-xl font-bold text-gray-800">กำลังประมวลผลการอนุมัติ...</h2>
                        <p className="text-gray-500">กรุณารอสักครู่</p>
                    </div>
                )}

                {status === 'SUCCESS' && (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">อนุมัติเรียบร้อยแล้ว!</h2>
                        <p className="text-gray-600">
                            ระบบได้บันทึกการอนุมัติของคุณแล้ว พนักงานจะได้รับการแจ้งเตือนทันที
                        </p>
                    </div>
                )}

                {status === 'ERROR' && (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">ทำรายการไม่สำเร็จ</h2>
                        <p className="text-red-500 font-medium bg-red-50 px-4 py-2 rounded-lg">
                            {message}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            ใบลาอาจถูกยกเลิกหรือดำเนินการไปแล้ว หรือลิงก์หมดอายุ
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ActionApprovePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ApproveContent />
        </Suspense>
    );
}
