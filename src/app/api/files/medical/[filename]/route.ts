import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getPool } from '@/lib/db';
import { getDelegatingManagers } from '@/lib/delegate';
import { canViewMedicalCertificateFile } from '@/lib/medical-file-access';

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
};

// Upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'medical');

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        // Auth check
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { filename } = await params;

        // Sanitize filename — prevent path traversal
        const safeFilename = path.basename(filename);
        if (safeFilename !== filename || filename.includes('..')) {
            return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
        }

        const pool = await getPool();
        const fileOwnerResult = await pool.request()
            .input('apiUrl', `/api/files/medical/${safeFilename}`)
            .input('legacyUrl', `/uploads/medical/${safeFilename}`)
            .input('filename', safeFilename)
            .input('fileSuffix', `%/${safeFilename}`)
            .query(`
                SELECT TOP 1
                    lr.userId,
                    u.departmentHeadId
                FROM LeaveRequests lr
                INNER JOIN Users u ON lr.userId = u.id
                WHERE lr.medicalCertificateFile IN (@apiUrl, @legacyUrl, @filename)
                   OR lr.medicalCertificateFile LIKE @fileSuffix
            `);

        if (fileOwnerResult.recordset.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const fileOwner = fileOwnerResult.recordset[0] as { userId: number; departmentHeadId: number | null };
        const delegatingManagerIds = await getDelegatingManagers(Number(session.user.id));
        const canViewFile = canViewMedicalCertificateFile(
            {
                userId: Number(session.user.id),
                role: session.user.role,
                isHRStaff: session.user.isHRStaff === true,
                delegatingManagerIds,
            },
            {
                userId: fileOwner.userId,
                managerId: fileOwner.departmentHeadId,
            }
        );

        if (!canViewFile) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        // Look up file in upload directory
        const filePath = path.join(UPLOAD_DIR, safeFilename);
        if (!existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Read file
        const fileBuffer = await readFile(filePath);

        // Determine content type
        const ext = path.extname(safeFilename).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

        // Return file using native Response for proper inline display
        // (NextResponse can add headers that trigger download behavior)
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Length', String(fileBuffer.length));
        headers.set('Cache-Control', 'private, max-age=3600');

        return new Response(new Uint8Array(fileBuffer), {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error('Error serving medical file:', error);
        return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
    }
}
