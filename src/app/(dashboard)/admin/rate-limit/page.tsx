'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Shield,
    Gauge,
    Save,
    Loader2,
    AlertTriangle,
    Check,
    X,
    Clock,
    Key,
    Zap
} from 'lucide-react';

interface RateLimitSettings {
    enabled: boolean;
    loginMaxAttempts: number;
    loginWindowSeconds: number;
    apiMaxRequests: number;
    apiWindowSeconds: number;
}

export default function RateLimitSettingsPage() {
    const { data: session } = useSession();
    const [settings, setSettings] = useState<RateLimitSettings>({
        enabled: true,
        loginMaxAttempts: 5,
        loginWindowSeconds: 300,
        apiMaxRequests: 100,
        apiWindowSeconds: 60,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/rate-limit');
            const data = await res.json();
            if (data.success) {
                setSettings(data.data);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: keyof RateLimitSettings, value: boolean | number) => {
        setSettings(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        // Remove confirm to prevent interaction issues
        // if (!confirm('ยืนยันการบันทึกการตั้งค่า Rate Limiting?')) return;

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/rate-limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const result = await res.json();

            if (result.success) {
                setMessage({ type: 'success', text: 'บันทึกการตั้งค่าเรียบร้อย' });
                setHasChanges(false);
            } else {
                setMessage({ type: 'error', text: result.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถบันทึกการตั้งค่าได้' });
        } finally {
            setSaving(false);
        }
    };

    // Only Admin can access
    if (session?.user?.role !== 'ADMIN') {
        return (
            <div className="p-8 text-center">
                <Shield className="w-16 h-16 mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-gray-500">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center">
                        <Gauge className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ตั้งค่า Rate Limiting
                        </h1>
                        <p className="text-gray-500">ป้องกันการโจมตีแบบ Brute Force และการใช้งานเกินขนาด</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    บันทึก
                </button>
            </div>

            {/* Messages */}
            {hasChanges && (
                <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <p className="text-yellow-800 dark:text-yellow-200">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
                </div>
            )}

            {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700'
                    }`}>
                    {message.type === 'success' ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-red-600" />}
                    <p className={message.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}>{message.text}</p>
                </div>
            )}

            {/* Enable/Disable Toggle */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${settings.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดใช้งาน Rate Limiting</h2>
                            <p className="text-sm text-gray-500">ป้องกันการโจมตีและการใช้งานเกินขนาด</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleChange('enabled', !settings.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>
            </div>

            {/* Login Rate Limit */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-red-100 text-red-600">
                        <Key className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Login Rate Limit</h2>
                        <p className="text-sm text-gray-500">จำกัดจำนวนครั้งการพยายาม Login จาก IP เดียวกัน</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            จำนวนครั้งสูงสุด
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={settings.loginMaxAttempts}
                            onChange={(e) => handleChange('loginMaxAttempts', parseInt(e.target.value) || 5)}
                            disabled={!settings.enabled}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                        />
                        <p className="mt-1 text-xs text-gray-500">ครั้ง (1-100)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ช่วงเวลา (วินาที)
                        </label>
                        <input
                            type="number"
                            min={60}
                            max={3600}
                            value={settings.loginWindowSeconds}
                            onChange={(e) => handleChange('loginWindowSeconds', parseInt(e.target.value) || 300)}
                            disabled={!settings.enabled}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                        />
                        <p className="mt-1 text-xs text-gray-500">{Math.floor(settings.loginWindowSeconds / 60)} นาที (60-3600 วินาที)</p>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        💡 ตัวอย่าง: อนุญาตให้ Login ผิดได้ <strong>{settings.loginMaxAttempts} ครั้ง</strong> ภายใน <strong>{Math.floor(settings.loginWindowSeconds / 60)} นาที</strong> ถ้าเกินจะถูกบล็อค
                    </p>
                </div>
            </div>

            {/* API Rate Limit */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Rate Limit</h2>
                        <p className="text-sm text-gray-500">จำกัดจำนวน Request ต่อนาทีสำหรับ API ทั่วไป</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            จำนวน Request สูงสุด
                        </label>
                        <input
                            type="number"
                            min={10}
                            max={1000}
                            value={settings.apiMaxRequests}
                            onChange={(e) => handleChange('apiMaxRequests', parseInt(e.target.value) || 100)}
                            disabled={!settings.enabled}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                        />
                        <p className="mt-1 text-xs text-gray-500">Request (10-1000)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ช่วงเวลา (วินาที)
                        </label>
                        <input
                            type="number"
                            min={10}
                            max={300}
                            value={settings.apiWindowSeconds}
                            onChange={(e) => handleChange('apiWindowSeconds', parseInt(e.target.value) || 60)}
                            disabled={!settings.enabled}
                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                        />
                        <p className="mt-1 text-xs text-gray-500">{settings.apiWindowSeconds} วินาที (10-300)</p>
                    </div>
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-6 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">📌 หมายเหตุ</h3>
                <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
                    <li>• Rate Limiting ใช้ In-Memory Store - จะ reset เมื่อ Server restart</li>
                    <li>• Login Rate Limit ใช้ IP Address เป็น identifier</li>
                    <li>• ถ้าผู้ใช้ถูกบล็อค จะได้รับ Error 429 (Too Many Requests)</li>
                    <li>• การตั้งค่าจะมีผลทันทีหลังบันทึก</li>
                </ul>
            </div>
        </div>
    );
}
