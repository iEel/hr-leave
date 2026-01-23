import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import bcrypt from 'bcryptjs';
import { UserRole, Company } from '@/types';
import { verifyLdapCredentials } from '@/lib/ldap';
import { findOrCreateUser } from '@/lib/auth/jit-user';
import { getAuthSettings } from '@/lib/auth/settings';

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
        isADUser?: boolean;
        authProvider?: string;
        isHRStaff?: boolean;
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
        isADUser?: boolean;
        authProvider?: string;
        isHRStaff?: boolean;
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

// Get auth mode from env (DB-based settings can be added later)
const AUTH_MODE = process.env.AUTH_MODE || 'LOCAL';

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        // Microsoft Entra ID (Azure AD) Provider
        ...(AUTH_MODE === 'AZURE' || AUTH_MODE === 'HYBRID' ? [
            MicrosoftEntraID({
                clientId: process.env.AZURE_AD_CLIENT_ID!,
                clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
                issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
                async profile(profile) {
                    // JIT Provisioning for Azure AD users
                    const user = await findOrCreateUser({
                        username: profile.preferred_username?.split('@')[0] || profile.email?.split('@')[0] || 'unknown',
                        email: profile.email || profile.preferred_username || '',
                        firstName: profile.given_name || profile.name?.split(' ')[0] || '',
                        lastName: profile.family_name || profile.name?.split(' ').slice(1).join(' ') || '',
                        authProvider: 'AZURE'
                    });

                    return {
                        id: user.id.toString(),
                        employeeId: user.employeeId,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: user.role as UserRole,
                        company: user.company as Company,
                        department: user.department,
                        departmentHeadId: user.departmentHeadId,
                        isADUser: true,
                        authProvider: 'AZURE',
                        isHRStaff: (user as any).isHRStaff || false
                    };
                }
            })
        ] : []),

        // Credentials Provider (Local + LDAP)
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

                // Fetch dynamic settings
                const settings = await getAuthSettings();
                const authMode = settings.authMode;

                // 1. Try LDAP authentication first (if enabled)
                if (authMode === 'LDAP' || authMode === 'HYBRID') {
                    try {
                        const ldapUser = await verifyLdapCredentials(employeeId, password);
                        if (ldapUser) {
                            // JIT Provisioning for LDAP users
                            const user = await findOrCreateUser({
                                username: ldapUser.sAMAccountName,
                                email: ldapUser.mail || `${ldapUser.sAMAccountName}@${settings.ldapDomain || process.env.LDAP_DOMAIN}`,
                                firstName: ldapUser.givenName || '',
                                lastName: ldapUser.sn || '',
                                employeeId: ldapUser.employeeID,
                                authProvider: 'LDAP'
                            });

                            return {
                                id: user.id.toString(),
                                employeeId: user.employeeId,
                                email: user.email,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                role: user.role as UserRole,
                                company: user.company as Company,
                                department: user.department,
                                departmentHeadId: user.departmentHeadId,
                                isADUser: true,
                                authProvider: 'LDAP',
                                isHRStaff: (user as any).isHRStaff || false
                            };
                        }
                    } catch (ldapError) {
                        console.log('[AUTH] LDAP auth failed, falling back to local...', ldapError);
                    }
                }

                // 2. Try Local DB authentication
                try {
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

                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.message) {
                        throw new Error(errorData.message);
                    }
                } catch (error) {
                    console.log('[AUTH] DB auth failed, trying demo mode...', error);
                }

                // 3. Fallback to demo users
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
                token.isADUser = user.isADUser;
                token.authProvider = user.authProvider;
                token.isHRStaff = user.isHRStaff;
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
                session.user.isADUser = token.isADUser;
                session.user.authProvider = token.authProvider;
                session.user.isHRStaff = token.isHRStaff;
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
