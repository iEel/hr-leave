import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { UserRole, Company } from '@/types';

// Extend NextAuth types
declare module 'next-auth' {
    interface User {
        id: string;
        employeeId: string;
        email: string;
        firstName: string;
        lastName: string;
        role: UserRole;
        company: Company;
        department: string;
        departmentHeadId: number | null;
    }

    interface Session {
        user: User;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        employeeId: string;
        role: UserRole;
        company: Company;
        department: string;
        departmentHeadId: number | null;
    }
}

// Demo users as fallback (in case DB connection fails)
const DEMO_USERS = [
    {
        id: '1',
        employeeId: 'ADMIN001',
        password: 'admin123',
        email: 'admin@sonic.co.th',
        firstName: 'System',
        lastName: 'Administrator',
        role: UserRole.ADMIN,
        company: Company.SONIC,
        department: 'IT',
        departmentHeadId: null,
    },
];

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: 'Employee Login',
            credentials: {
                employeeId: { label: 'รหัสพนักงาน', type: 'text' },
                password: { label: 'รหัสผ่าน', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.employeeId || !credentials?.password) {
                    throw new Error('กรุณากรอกรหัสพนักงานและรหัสผ่าน');
                }

                const employeeId = credentials.employeeId as string;
                const password = credentials.password as string;

                try {
                    // Try to authenticate via API (which connects to DB)
                    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3002';
                    const response = await fetch(`${baseUrl}/api/auth/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ employeeId, password }),
                    });

                    if (response.ok) {
                        const user = await response.json();
                        return user;
                    }

                    // If API returns specific error, use that message
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.message) {
                        throw new Error(errorData.message);
                    }
                } catch (error) {
                    console.log('DB auth failed, trying demo mode...', error);
                }

                // Fallback to demo users if DB fails
                const demoUser = DEMO_USERS.find(
                    (u) => u.employeeId === employeeId && u.password === password
                );

                if (demoUser) {
                    return {
                        id: demoUser.id,
                        employeeId: demoUser.employeeId,
                        email: demoUser.email,
                        firstName: demoUser.firstName,
                        lastName: demoUser.lastName,
                        role: demoUser.role,
                        company: demoUser.company,
                        department: demoUser.department,
                        departmentHeadId: demoUser.departmentHeadId,
                    };
                }

                throw new Error('รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.employeeId = user.employeeId;
                token.role = user.role;
                token.company = user.company;
                token.department = user.department;
                token.departmentHeadId = user.departmentHeadId;
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id;
                session.user.employeeId = token.employeeId;
                session.user.role = token.role;
                session.user.company = token.company;
                session.user.department = token.department;
                session.user.departmentHeadId = token.departmentHeadId;
            }
            return session;
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 15 * 60, // 15 minutes (Auto Logout)
    },
    trustHost: true,
    secret: process.env.NEXTAUTH_SECRET,
});
