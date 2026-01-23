import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logAudit } from '@/lib/audit';

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
        if (role !== 'HR' && role !== 'ADMIN') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';
        const roleFilter = searchParams.get('role') || ''; // Filter by role (comma-separated: MANAGER,HR,ADMIN)
        const offset = (page - 1) * limit;

        const pool = await getPool();

        // Build role filter condition
        const roles = roleFilter ? roleFilter.split(',').map(r => r.trim().toUpperCase()) : [];
        const roleCondition = roles.length > 0
            ? `AND u.role IN (${roles.map((_, i) => `@role${i}`).join(',')})`
            : '';

        // Count total for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM Users u
            WHERE (u.firstName LIKE @search OR u.lastName LIKE @search OR u.employeeId LIKE @search)
            ${roleCondition}
        `;

        const countRequest = pool.request().input('search', `%${search}%`);
        roles.forEach((role, i) => countRequest.input(`role${i}`, role));
        const countResult = await countRequest.query(countQuery);

        const total = countResult.recordset[0].total;

        // Fetch paginated data
        const dataQuery = `
            SELECT u.id, u.employeeId, u.email, u.firstName, u.lastName, 
                   u.role, u.company, u.department, u.startDate, u.isActive,
                   u.departmentHeadId,
                   head.firstName + ' ' + head.lastName as departmentHeadName,
                   CONVERT(varchar, u.createdAt, 23) as createdAt
            FROM Users u
            LEFT JOIN Users head ON u.departmentHeadId = head.id
            WHERE (u.firstName LIKE @search OR u.lastName LIKE @search OR u.employeeId LIKE @search)
            ${roleCondition}
            ORDER BY u.employeeId ASC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

        const dataRequest = pool.request()
            .input('search', `%${search}%`)
            .input('offset', offset)
            .input('limit', limit);
        roles.forEach((role, i) => dataRequest.input(`role${i}`, role));
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
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const {
            employeeId, email, password, firstName, lastName,
            role, company, department, gender, startDate, departmentHeadId
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
            .query(`
                INSERT INTO Users (
                    employeeId, email, password, firstName, lastName, 
                    role, company, department, gender, startDate, isActive, departmentHeadId
                ) VALUES (
                    @employeeId, @email, @password, @firstName, @lastName, 
                    @role, @company, @department, @gender, @startDate, 1, @departmentHeadId
                )
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'CREATE_EMPLOYEE',
            targetTable: 'Users',
            newValue: { employeeId, email, firstName, lastName, role, company, department }
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
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { id, firstName, lastName, role, company, department, isActive, gender, startDate, departmentHeadId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
        }

        const pool = await getPool();

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
                    updatedAt = GETDATE()
                WHERE id = @id
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'UPDATE_EMPLOYEE',
            targetTable: 'Users',
            targetId: id,
            newValue: { firstName, lastName, role, company, department, isActive, gender, startDate }
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
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
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
