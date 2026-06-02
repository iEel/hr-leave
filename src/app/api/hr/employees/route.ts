import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logAudit } from '@/lib/audit';
import { calculateProbationEndDate } from '@/lib/vacation-eligibility';

const DEFAULT_PROBATION_DAYS = 90;
const DEFAULT_PROBATION_EXTENSION_DAYS = 0;

function parseProbationDays(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionalDate(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeOptionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
}

function isHRStaffSessionUser(user: unknown): boolean {
    return typeof user === 'object' && user !== null && 'isHRStaff' in user && user.isHRStaff === true;
}

/**
 * GET /api/hr/employees
 * List all employees with pagination and search
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        const isHRStaff = isHRStaffSessionUser(session.user);
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';
        const roleFilter = searchParams.get('role') || ''; // Filter by role (comma-separated: MANAGER,HR,ADMIN)
        const departmentFilter = searchParams.get('department') || ''; // Filter by department name
        const companyFilter = searchParams.get('company') || ''; // Filter by company code
        const offset = (page - 1) * limit;

        const pool = await getPool();

        // Build role filter condition
        const roles = roleFilter ? roleFilter.split(',').map(r => r.trim().toUpperCase()) : [];
        const roleCondition = roles.length > 0
            ? `AND u.role IN (${roles.map((_, i) => `@role${i}`).join(',')})`
            : '';

        // Build department filter condition
        const departmentCondition = departmentFilter ? 'AND u.department = @department' : '';

        // Build company filter condition
        const companyCondition = companyFilter ? 'AND u.company = @company' : '';

        // Count total for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM Users u
            WHERE (u.firstName LIKE @search OR u.lastName LIKE @search OR u.employeeId LIKE @search OR u.department LIKE @search)
            ${roleCondition}
            ${departmentCondition}
            ${companyCondition}
        `;

        const countRequest = pool.request().input('search', `%${search}%`);
        roles.forEach((role, i) => countRequest.input(`role${i}`, role));
        if (departmentFilter) countRequest.input('department', departmentFilter);
        if (companyFilter) countRequest.input('company', companyFilter);
        const countResult = await countRequest.query(countQuery);

        const total = countResult.recordset[0].total;

        // Fetch paginated data
        const dataQuery = `
            SELECT u.id, u.employeeId, u.email, u.firstName, u.lastName, 
                   u.role, u.company, u.department, u.startDate, u.isActive,
                   u.departmentHeadId, u.isHRStaff,
                   u.probationDays, u.probationExtensionDays,
                   CONVERT(varchar, u.probationOverrideDate, 23) as probationOverrideDate,
                   CONVERT(varchar, u.probationEndDate, 23) as probationEndDate,
                   u.probationNote,
                   head.firstName + ' ' + head.lastName as departmentHeadName,
                   CONVERT(varchar, u.createdAt, 23) as createdAt
            FROM Users u
            LEFT JOIN Users head ON u.departmentHeadId = head.id
            WHERE (u.firstName LIKE @search OR u.lastName LIKE @search OR u.employeeId LIKE @search OR u.department LIKE @search)
            ${roleCondition}
            ${departmentCondition}
            ${companyCondition}
            ORDER BY u.employeeId ASC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

        const dataRequest = pool.request()
            .input('search', `%${search}%`)
            .input('offset', offset)
            .input('limit', limit);
        roles.forEach((role, i) => dataRequest.input(`role${i}`, role));
        if (departmentFilter) dataRequest.input('department', departmentFilter);
        if (companyFilter) dataRequest.input('company', companyFilter);
        const result = await dataRequest.query(dataQuery);

        return NextResponse.json({
            success: true,
            data: result.recordset,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching employees:', error);
        return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

/**
 * POST /api/hr/employees
 * Create a new employee
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = isHRStaffSessionUser(session?.user);
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const {
            employeeId, email, password, firstName, lastName,
            role, company, department, gender, startDate, departmentHeadId, isHRStaff: newIsHRStaff,
            probationDays: rawProbationDays,
            probationExtensionDays: rawProbationExtensionDays,
            probationOverrideDate: rawProbationOverrideDate,
            probationNote: rawProbationNote
        } = body;

        // Validation
        if (!employeeId || !email || !password || !firstName || !lastName || !company || !department) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = await getPool();

        // Check for duplicates
        const checkResult = await pool.request()
            .input('employeeId', employeeId)
            .input('email', email)
            .query(`SELECT id FROM Users WHERE employeeId = @employeeId OR email = @email`);

        if (checkResult.recordset.length > 0) {
            return NextResponse.json({ error: 'Employee ID or Email already exists' }, { status: 409 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const probationDays = parseProbationDays(rawProbationDays, DEFAULT_PROBATION_DAYS);
        const probationExtensionDays = parseProbationDays(rawProbationExtensionDays, DEFAULT_PROBATION_EXTENSION_DAYS);
        const probationOverrideDate = normalizeOptionalDate(rawProbationOverrideDate);
        const probationNote = normalizeOptionalText(rawProbationNote);
        const probationEndDate = formatDateOnly(calculateProbationEndDate({
            startDate,
            probationDays,
            probationExtensionDays,
            probationOverrideDate
        }));

        // Insert
        await pool.request()
            .input('employeeId', employeeId)
            .input('email', email)
            .input('password', hashedPassword)
            .input('firstName', firstName)
            .input('lastName', lastName)
            .input('role', role || 'EMPLOYEE')
            .input('company', company)
            .input('department', department)
            .input('gender', gender || 'M')
            .input('startDate', startDate)
            .input('departmentHeadId', departmentHeadId || null)
            .input('isHRStaff', newIsHRStaff ? 1 : 0)
            .input('probationDays', probationDays)
            .input('probationExtensionDays', probationExtensionDays)
            .input('probationOverrideDate', probationOverrideDate)
            .input('probationEndDate', probationEndDate)
            .input('probationNote', probationNote)
            .query(`
                INSERT INTO Users (
                    employeeId, email, password, firstName, lastName, 
                    role, company, department, gender, startDate, isActive, departmentHeadId, isHRStaff,
                    probationDays, probationExtensionDays, probationOverrideDate, probationEndDate, probationNote
                ) VALUES (
                    @employeeId, @email, @password, @firstName, @lastName, 
                    @role, @company, @department, @gender, @startDate, 1, @departmentHeadId, @isHRStaff,
                    @probationDays, @probationExtensionDays, @probationOverrideDate, @probationEndDate, @probationNote
                )
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'CREATE_EMPLOYEE',
            targetTable: 'Users',
            newValue: {
                employeeId, email, firstName, lastName, role, company, department,
                probationDays, probationExtensionDays, probationOverrideDate, probationEndDate, probationNote
            }
        });

        return NextResponse.json({ success: true, message: 'Employee created successfully' });

    } catch (error) {
        console.error('Error creating employee:', error);
        return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}

/**
 * PUT /api/hr/employees
 * Update user details (cannot update password here)
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = isHRStaffSessionUser(session?.user);
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const {
            id, firstName, lastName, role, company, department, isActive, gender, startDate,
            departmentHeadId, isHRStaff: newIsHRStaff,
            probationDays: rawProbationDays,
            probationExtensionDays: rawProbationExtensionDays,
            probationOverrideDate: rawProbationOverrideDate,
            probationNote: rawProbationNote
        } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
        }

        const pool = await getPool();
        const probationDays = parseProbationDays(rawProbationDays, DEFAULT_PROBATION_DAYS);
        const probationExtensionDays = parseProbationDays(rawProbationExtensionDays, DEFAULT_PROBATION_EXTENSION_DAYS);
        const probationOverrideDate = normalizeOptionalDate(rawProbationOverrideDate);
        const probationNote = normalizeOptionalText(rawProbationNote);
        const probationEndDate = formatDateOnly(calculateProbationEndDate({
            startDate,
            probationDays,
            probationExtensionDays,
            probationOverrideDate
        }));

        await pool.request()
            .input('id', id)
            .input('firstName', firstName)
            .input('lastName', lastName)
            .input('role', role)
            .input('company', company)
            .input('department', department)
            .input('isActive', isActive ? 1 : 0)
            .input('gender', gender)
            .input('startDate', startDate)
            .input('departmentHeadId', departmentHeadId || null)
            .input('isHRStaff', newIsHRStaff ? 1 : 0)
            .input('probationDays', probationDays)
            .input('probationExtensionDays', probationExtensionDays)
            .input('probationOverrideDate', probationOverrideDate)
            .input('probationEndDate', probationEndDate)
            .input('probationNote', probationNote)
            .query(`
                UPDATE Users
                SET firstName = @firstName,
                    lastName = @lastName,
                    role = @role,
                    company = @company,
                    department = @department,
                    isActive = @isActive,
                    gender = @gender,
                    startDate = @startDate,
                    departmentHeadId = @departmentHeadId,
                    isHRStaff = @isHRStaff,
                    probationDays = @probationDays,
                    probationExtensionDays = @probationExtensionDays,
                    probationOverrideDate = @probationOverrideDate,
                    probationEndDate = @probationEndDate,
                    probationNote = @probationNote,
                    updatedAt = GETDATE()
                WHERE id = @id
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'UPDATE_EMPLOYEE',
            targetTable: 'Users',
            targetId: id,
            newValue: {
                firstName, lastName, role, company, department, isActive, gender, startDate,
                isHRStaff: newIsHRStaff,
                probationDays, probationExtensionDays, probationOverrideDate, probationEndDate, probationNote
            }
        });

        return NextResponse.json({ success: true, message: 'Employee updated successfully' });

    } catch (error) {
        console.error('Error updating employee:', error);
        return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
    }
}

/**
 * DELETE /api/hr/employees
 * Delete an employee (soft delete by setting isActive = 0, or hard delete)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = isHRStaffSessionUser(session?.user);
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
        }

        // Prevent deleting yourself
        if (id === session.user.id) {
            return NextResponse.json({ error: 'ไม่สามารถลบตัวเองได้' }, { status: 400 });
        }

        const pool = await getPool();

        // Check if user has subordinates
        const subordinateCheck = await pool.request()
            .input('id', id)
            .query(`SELECT COUNT(*) as count FROM Users WHERE departmentHeadId = @id`);

        if (subordinateCheck.recordset[0].count > 0) {
            return NextResponse.json({
                error: `พนักงานนี้มีลูกน้อง ${subordinateCheck.recordset[0].count} คน กรุณาโอนลูกน้องก่อนลบ`
            }, { status: 400 });
        }

        // Get employee info before delete for audit
        const empResult = await pool.request()
            .input('id', id)
            .query(`SELECT employeeId, firstName, lastName FROM Users WHERE id = @id`);
        const empInfo = empResult.recordset[0];

        // Soft Delete: Set isActive = 0 instead of deleting
        await pool.request()
            .input('id', id)
            .query(`UPDATE Users SET isActive = 0, updatedAt = GETDATE() WHERE id = @id`);

        // Delete leave balances (ไม่จำเป็นต้องเก็บยอดคงเหลือ)
        await pool.request()
            .input('id', id)
            .query(`DELETE FROM LeaveBalances WHERE userId = @id`);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'DEACTIVATE_EMPLOYEE',
            targetTable: 'Users',
            targetId: id,
            oldValue: empInfo,
            newValue: { isActive: false }
        });

        return NextResponse.json({ success: true, message: 'ปิดการใช้งานพนักงานสำเร็จ (เก็บประวัติการลาไว้)' });

    } catch (error) {
        console.error('Error deleting employee:', error);
        return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
    }
}
