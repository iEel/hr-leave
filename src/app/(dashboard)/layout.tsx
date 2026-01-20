import { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

interface DashboardLayoutProps {
    children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <Sidebar />
            <div className="lg:ml-72">
                <Topbar />
                <main className="p-4 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
