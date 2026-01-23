import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { User } from '@/types';
import { checkRateLimit, getClientIP } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
    try {
        // Rate limiting check
        const clientIP = getClientIP(request);
        const rateLimitResult = await checkRateLimit('login', clientIP);

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                {
                    message: `คุณพยายาม Login มากเกินไป กรุณารอ ${rateLimitResult.resetIn} วินาที`,
                    retryAfter: rateLimitResult.resetIn
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': rateLimitResult.resetIn.toString(),
                        'X-RateLimit-Remaining': '0',
                    }
                }
            );
        }

        const { employeeId, password } = await request.json();

        if (!employeeId || !password) {
            return NextResponse.json(
                { message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' },
                { status: 400 }
            );
        }



        // Query user from database using parameterized query
        const users = await query<User>(
            `SELECT * FROM Users WHERE employeeId = @employeeId AND isActive = 1`,
            { employeeId }
        );

        if (users.length === 0) {
            return NextResponse.json(
                { message: 'ไม่พบรหัสพนักงานนี้ในระบบ' },
                { status: 401 }
            );
        }

        const user = users[0];

        // Verify password using bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return NextResponse.json(
                { message: 'รหัสผ่านไม่ถูกต้อง' },
                { status: 401 }
            );
        }

        // Return user object (password excluded)
        return NextResponse.json({
            id: user.id.toString(),
            employeeId: user.employeeId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            company: user.company,
            department: user.department,
            departmentHeadId: user.departmentHeadId,
            isHRStaff: (user as any).isHRStaff || false,
        });
    } catch (error) {
        console.error('Auth verify error:', error);
        return NextResponse.json(
            { message: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' },
            { status: 500 }
        );
    }
}
