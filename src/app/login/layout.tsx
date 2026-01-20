import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'เข้าสู่ระบบ | HR Leave Management',
    description: 'ระบบจัดการการลางาน - เข้าสู่ระบบ',
};

export default function LoginLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
