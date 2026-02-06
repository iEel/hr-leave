import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth', '/action', '/api/email', '/api/cron'];

// Role-based route access control
const roleBasedRoutes: Record<string, string[]> = {
    '/hr': ['HR', 'ADMIN'],
    '/approvals': ['MANAGER', 'HR', 'ADMIN'],
    '/department': ['MANAGER', 'HR', 'ADMIN'],
    '/admin': ['ADMIN'],
};

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (publicRoutes.some((route) => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Get JWT token
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET
    });

    // Check if user is authenticated
    if (!token) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Check role-based access
    for (const [route, allowedRoles] of Object.entries(roleBasedRoutes)) {
        if (pathname.startsWith(route)) {
            const userRole = token.role as string;
            const isHRStaff = (token as any).isHRStaff === true;

            // Allow if role is authorized OR (is HR route AND user is HR staff)
            const isAuthorized = allowedRoles.includes(userRole) ||
                (route === '/hr' && isHRStaff);

            if (!userRole || !isAuthorized) {
                // Redirect to dashboard if not authorized
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - icons folder (PWA icons)
         * - manifest.json (PWA manifest)
         * - sw.js (Service Worker)
         * - uploads folder (uploaded files)
         * - api/auth routes
         */
        '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|uploads|api/auth).*)',
    ],
};
