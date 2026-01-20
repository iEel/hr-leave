'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Shield,
    Server,
    Cloud,
    Settings,
    Save,
    Loader2,
    AlertTriangle,
    Check,
    X
} from 'lucide-react';

type AuthMode = 'LOCAL' | 'LDAP' | 'AZURE' | 'HYBRID';

interface AuthSettings {
    authMode: AuthMode;
    ldapUrl: string;
    ldapDomain: string;
    ldapBaseDN: string;
    ldapBindDN: string;
    azureAdEnabled: boolean;
    azureAdTenantId: string;
    azureAdClientId: string;
}

const AUTH_MODES = [
    { value: 'LOCAL', label: 'Local Only', desc: 'ใช้รหัสพนักงานและรหัสผ่านในระบบ', icon: <Settings className="w-5 h-5" /> },
    { value: 'LDAP', label: 'Active Directory (LDAP)', desc: 'ใช้ AD On-Premise สำหรับตรวจสอบรหัสผ่าน', icon: <Server className="w-5 h-5" /> },
    { value: 'AZURE', label: 'Azure AD / Entra ID', desc: 'ใช้ Microsoft 365 Login', icon: <Cloud className="w-5 h-5" /> },
    { value: 'HYBRID', label: 'Hybrid', desc: 'รองรับทั้ง LDAP และ Azure AD', icon: <Shield className="w-5 h-5" /> },
];

export default function AuthSettingsPage() {
    const { data: session } = useSession();
    const [settings, setSettings] = useState<AuthSettings>({
        authMode: 'LOCAL',
        ldapUrl: '',
        ldapDomain: '',
        ldapBaseDN: '',
        ldapBindDN: '',
        azureAdEnabled: false,
        azureAdTenantId: '',
        azureAdClientId: '',
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
            const res = await fetch('/api/hr/settings/auth');
            const data = await res.json();
            if (data.success) {
                setSettings(data.data);
            }
        } catch (error) {
            console.error('Error fetching auth settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: keyof AuthSettings, value: string | boolean) => {
        setSettings(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!confirm('ยืนยันการบันทึกการตั้งค่า Authentication?\n\nหมายเหตุ: การเปลี่ยนแปลงบางอย่างอาจต้อง Restart Server')) return;

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/hr/settings/auth', {
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
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ตั้งค่า Authentication
                        </h1>
                        <p className="text-gray-500">กำหนดวิธีการเข้าสู่ระบบ (Local, LDAP, Azure AD)</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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

            {/* Auth Mode Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">โหมด Authentication</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {AUTH_MODES.map((mode) => (
                        <button
                            key={mode.value}
                            onClick={() => handleChange('authMode', mode.value as AuthMode)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${settings.authMode === mode.value
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                                }`}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`p-2 rounded-lg ${settings.authMode === mode.value ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                    {mode.icon}
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-white">{mode.label}</span>
                            </div>
                            <p className="text-sm text-gray-500">{mode.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* LDAP Settings */}
            {(settings.authMode === 'LDAP' || settings.authMode === 'HYBRID') && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Server className="w-5 h-5 text-orange-500" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">LDAP / Active Directory</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LDAP URL</label>
                            <input
                                type="text"
                                value={settings.ldapUrl}
                                onChange={(e) => handleChange('ldapUrl', e.target.value)}
                                placeholder="ldap://dc1.example.com:389"
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Domain</label>
                            <input
                                type="text"
                                value={settings.ldapDomain}
                                onChange={(e) => handleChange('ldapDomain', e.target.value)}
                                placeholder="example.com"
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Base DN</label>
                            <input
                                type="text"
                                value={settings.ldapBaseDN}
                                onChange={(e) => handleChange('ldapBaseDN', e.target.value)}
                                placeholder="DC=example,DC=com"
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-500">
                        💡 LDAP Bind Password ต้องตั้งค่าใน Environment Variable (LDAP_BIND_PASSWORD) เพื่อความปลอดภัย
                    </p>
                </div>
            )}

            {/* Azure AD Settings */}
            {(settings.authMode === 'AZURE' || settings.authMode === 'HYBRID') && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Cloud className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Azure AD / Entra ID</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tenant ID</label>
                            <input
                                type="text"
                                value={settings.azureAdTenantId}
                                onChange={(e) => handleChange('azureAdTenantId', e.target.value)}
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client ID</label>
                            <input
                                type="text"
                                value={settings.azureAdClientId}
                                onChange={(e) => handleChange('azureAdClientId', e.target.value)}
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-500">
                        💡 Client Secret ต้องตั้งค่าใน Environment Variable (AZURE_AD_CLIENT_SECRET) เพื่อความปลอดภัย
                    </p>
                </div>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-700">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📌 หมายเหตุ</h3>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• Admin สามารถเข้าสู่ระบบด้วย Local Account ได้เสมอ ไม่ว่าจะเลือกโหมดใด</li>
                    <li>• พนักงานใหม่จาก AD จะถูกสร้างอัตโนมัติเมื่อ Login ครั้งแรก (JIT Provisioning)</li>
                    <li>• HR ต้องกำหนดหัวหน้างานให้พนักงานใหม่ก่อนจึงจะขอลาได้</li>
                    <li>• การเปลี่ยน Auth Mode อาจต้อง Restart Server</li>
                </ul>
            </div>
        </div>
    );
}
