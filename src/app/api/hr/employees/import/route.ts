import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';

interface ImportRow {
    employeeId: string;
    email: string;
    firstName: string;
    lastName: string;
    password?: string;
    role?: string;
    company?: string;
    department?: string;
    gender?: string;
    startDate?: string;
    departmentHeadEmployeeId?: string;
}

/**
 * POST /api/hr/employees/import
 * Import employees from CSV data
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { data } = body as { data: ImportRow[] };

        if (!data || !Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        const pool = await getPool();

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const row of data) {
            try {
                // Validate required fields
                if (!row.employeeId || !row.email || !row.firstName || !row.lastName) {
                    errors.push(`Row ${row.employeeId || 'unknown'}: Missing required fields`);
                    errorCount++;
                    continue;
                }

                // Check if already exists
                const checkResult = await pool.request()
                    .input('employeeId', row.employeeId)
                    .input('email', row.email)
                    .query(`SELECT id FROM Users WHERE employeeId = @employeeId OR email = @email`);

                if (checkResult.recordset.length > 0) {
                    errors.push(`${row.employeeId}: Employee ID or Email already exists`);
                    errorCount++;
                    continue;
                }

                // Find department head by employeeId if provided
                let departmentHeadId = null;
                if (row.departmentHeadEmployeeId) {
                    const headResult = await pool.request()
                        .input('headEmployeeId', row.departmentHeadEmployeeId)
                        .query(`SELECT id FROM Users WHERE employeeId = @headEmployeeId`);

                    if (headResult.recordset.length > 0) {
                        departmentHeadId = headResult.recordset[0].id;
                    }
                }

                // Generate default password if not provided
                const password = row.password || row.employeeId; // Default: same as employeeId
                const hashedPassword = await bcrypt.hash(password, 10);

                // Insert new employee
                await pool.request()
                    .input('employeeId', row.employeeId)
                    .input('email', row.email)
                    .input('password', hashedPassword)
                    .input('firstName', row.firstName)
                    .input('lastName', row.lastName)
                    .input('role', row.role || 'EMPLOYEE')
                    .input('company', row.company || 'SONIC')
                    .input('department', row.department || '')
                    .input('gender', row.gender || 'M')
                    .input('startDate', row.startDate || new Date().toISOString().split('T')[0])
                    .input('departmentHeadId', departmentHeadId)
                    .query(`
                        INSERT INTO Users (
                            employeeId, email, password, firstName, lastName,
                            role, company, department, gender, startDate, isActive, departmentHeadId
                        ) VALUES (
                            @employeeId, @email, @password, @firstName, @lastName,
                            @role, @company, @department, @gender, @startDate, 1, @departmentHeadId
                        )
                    `);

                successCount++;

            } catch (rowError) {
                console.error('Error importing row:', rowError);
                errors.push(`${row.employeeId}: Import failed`);
                errorCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Imported ${successCount} employees successfully`,
            stats: {
                total: data.length,
                success: successCount,
                errors: errorCount
            },
            errorDetails: errors.slice(0, 10) // Return first 10 errors
        });

    } catch (error) {
        console.error('Error importing employees:', error);
        return NextResponse.json({ error: 'Failed to import employees' }, { status: 500 });
    }
}
