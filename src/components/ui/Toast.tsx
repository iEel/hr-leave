'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

const toastStyles: Record<ToastType, { bg: string; icon: ReactNode; border: string }> = {
    success: {
        bg: 'bg-green-50 dark:bg-green-900/30',
        border: 'border-green-200 dark:border-green-800',
        icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    },
    error: {
        bg: 'bg-red-50 dark:bg-red-900/30',
        border: 'border-red-200 dark:border-red-800',
        icon: <XCircle className="w-5 h-5 text-red-500" />,
    },
    warning: {
        bg: 'bg-yellow-50 dark:bg-yellow-900/30',
        border: 'border-yellow-200 dark:border-yellow-800',
        icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    },
    info: {
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        border: 'border-blue-200 dark:border-blue-800',
        icon: <Info className="w-5 h-5 text-blue-500" />,
    },
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, message, type, duration };

        setToasts((prev) => [...prev, newToast]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    const success = useCallback((message: string, duration?: number) => {
        addToast(message, 'success', duration);
    }, [addToast]);

    const error = useCallback((message: string, duration?: number) => {
        addToast(message, 'error', duration);
    }, [addToast]);

    const warning = useCallback((message: string, duration?: number) => {
        addToast(message, 'warning', duration);
    }, [addToast]);

    const info = useCallback((message: string, duration?: number) => {
        addToast(message, 'info', duration);
    }, [addToast]);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
                {toasts.map((toast) => {
                    const style = toastStyles[toast.type];
                    return (
                        <div
                            key={toast.id}
                            className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border ${style.bg} ${style.border} animate-slide-in-right`}
                        >
                            <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
                            <p className="flex-1 text-sm text-gray-800 dark:text-gray-200 font-medium">
                                {toast.message}
                            </p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
