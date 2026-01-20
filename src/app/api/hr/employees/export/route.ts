import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/employees/export
 * Export all employees as CSV
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const pool = await getPool();

        const result = await pool.request()
            .query(`
                SELECT 
                    u.employeeId,
                    u.email,
                    u.firstName,
                    u.lastName,
                    u.role,
                    u.company,
                    u.department,
                    u.gender,
                    CONVERT(varchar, u.startDate, 23) as startDate,
                    CASE WHEN u.isActive = 1 THEN 'Active' ELSE 'Inactive' END as status,
                    head.employeeId as departmentHeadEmployeeId
                FROM Users u
                LEFT JOIN Users head ON u.departmentHeadId = head.id
                ORDER BY u.employeeId ASC
            `);

        // Create CSV content
        const headers = [
            'รหัสพนักงาน',
            'อีเมล',
            'ชื่อจริง',
            'นามสกุล',
            'Role',
            'บริษัท',
            'แผนก',
            'เพศ',
            'วันที่เริ่มงาน',
            'สถานะ',
            'รหัสหัวหน้า'
        ];

        const rows = result.recordset.map(emp => [
            emp.employeeId || '',
            emp.email || '',
            emp.firstName || '',
            emp.lastName || '',
            emp.role || '',
            emp.company || '',
            emp.department || '',
            emp.gender || '',
            emp.startDate || '',
            emp.status || '',
            emp.departmentHeadEmployeeId || ''
        ]);

        // Add BOM for Excel UTF-8 support
        const BOM = '\uFEFF';
        const csvContent = BOM + [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="employees_${new Date().toISOString().split('T')[0]}.csv"`
            }
        });

    } catch (error) {
        console.error('Error exporting employees:', error);
        return NextResponse.json({ error: 'Failed to export employees' }, { status: 500 });
    }
}
