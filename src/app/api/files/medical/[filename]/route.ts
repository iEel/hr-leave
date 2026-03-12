import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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
