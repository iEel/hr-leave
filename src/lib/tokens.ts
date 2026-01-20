import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';

export interface ApprovalTokenPayload {
    leaveId: number;
    approverId: number; // The manager who should approve
    action: 'APPROVE' | 'REJECT';
}

export function generateApprovalToken(payload: ApprovalTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyApprovalToken(token: string): ApprovalTokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as ApprovalTokenPayload;
        return decoded;
    } catch (error) {
        console.error('Invalid token:', error);
        return null;
    }
}

export function getMagicLink(token: string, action: 'APPROVE' | 'REJECT'): string {
    // action/approve?token=...
    return `${APP_URL}/action/${action.toLowerCase()}?token=${token}`;
}
