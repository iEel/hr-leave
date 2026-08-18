export type LeaveAttachmentPresentation = {
    isVisible: boolean;
    isRequired: boolean;
    needsConfirmation: boolean;
    sectionTitle: string;
    uploadLabel: string;
    viewLabel: string;
};

const HIDDEN_ATTACHMENT: LeaveAttachmentPresentation = {
    isVisible: false,
    isRequired: false,
    needsConfirmation: false,
    sectionTitle: 'เอกสารประกอบการลา',
    uploadLabel: 'แนบเอกสารประกอบการลา',
    viewLabel: 'ดูเอกสารแนบ',
};

export function getLeaveAttachmentPresentation(
    leaveType: string,
    isRequired: boolean,
): LeaveAttachmentPresentation {
    if (leaveType === 'PERSONAL') {
        return {
            isVisible: true,
            isRequired: false,
            needsConfirmation: false,
            sectionTitle: 'เอกสารประกอบการลา',
            uploadLabel: 'แนบเอกสารประกอบการลา (ไม่บังคับ)',
            viewLabel: 'ดูเอกสารประกอบการลา',
        };
    }

    if (leaveType === 'SICK' || isRequired) {
        return {
            isVisible: true,
            isRequired,
            needsConfirmation: true,
            sectionTitle: 'ใบรับรองแพทย์',
            uploadLabel: 'อัปโหลดใบรับรองแพทย์ (ถ้ามี)',
            viewLabel: 'ดูใบรับรองแพทย์',
        };
    }

    return HIDDEN_ATTACHMENT;
}

export function hasStoredLeaveAttachment(
    hasDocumentIndicator: boolean,
    attachmentUrl: string | null | undefined,
): boolean {
    return hasDocumentIndicator || Boolean(attachmentUrl);
}
