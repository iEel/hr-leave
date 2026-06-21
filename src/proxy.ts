import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth', '/action', '/api/email', '/api/cron'];
const MEDICAL_UPLOAD_PREFIX = '/uploads/medical/';

// Role-based route access control
// Note: /approvals is accessible by all authenticated users
// because delegates (any role) also need access. The API handles authorization.
const roleBasedRoutes: Record<string, string[]> = {
    '/hr': ['HR', 'ADMIN'],
    '/department': ['MANAGER', 'HR', 'ADMIN'],
    '/admin': ['ADMIN'],
};

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith(MEDICAL_UPLOAD_PREFIX)) {
        const filename = pathname.slice(MEDICAL_UPLOAD_PREFIX.length);
        if (!filename || filename.includes('/')) {
            return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
        }

        const protectedUrl = request.nextUrl.clone();
        protectedUrl.pathname = `/api/files/medical/${filename}`;
        return NextResponse.rewrite(protectedUrl);
    }

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
            const isHRStaff = token.isHRStaff === true;

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
         * - uploads folder (uploaded files except protected medical certificates)
         * - api/auth routes
         */
        '/uploads/medical/:path*',
        '/((?!_next/static|_next/image|favicon.ico|icon.svg|icons|manifest.json|sw.js|uploads|api/auth|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)',
    ],
};
