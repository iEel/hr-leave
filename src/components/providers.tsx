'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <SessionProvider refetchOnWindowFocus={true} refetchInterval={60}>
            <ToastProvider>
                {children}
            </ToastProvider>
        </SessionProvider>
    );
}
