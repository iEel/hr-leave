import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'application/octet-stream',
    '.jpeg': 'application/octet-stream',
    '.png': 'image/png',
};

// Upload directories (new location first, then legacy fallback)
const DATA_UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'medical');
const LEGACY_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'medical');

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

        // Try new data directory first, then fall back to legacy public directory
        let filePath = path.join(DATA_UPLOAD_DIR, safeFilename);
        if (!existsSync(filePath)) {
            filePath = path.join(LEGACY_UPLOAD_DIR, safeFilename);
        }

        if (!existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Read file
        const fileBuffer = await readFile(filePath);

        // Determine content type
        const ext = path.extname(safeFilename).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

        // Return file with appropriate headers
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${safeFilename}"`,
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (error) {
        console.error('Error serving medical file:', error);
        return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
    }
}
