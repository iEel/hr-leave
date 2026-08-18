import React from 'react';
import { Paperclip } from 'lucide-react';

import { getLeaveAttachmentPresentation } from '../../lib/leave-attachments';

type LeaveAttachmentLinkProps = {
    leaveType: string;
    fileUrl: string | null;
    hasAttachmentIndicator?: boolean;
};

export function LeaveAttachmentLink({
    leaveType,
    fileUrl,
    hasAttachmentIndicator = false,
}: LeaveAttachmentLinkProps) {
    if (!fileUrl) return null;

    const presentation = getLeaveAttachmentPresentation(
        leaveType,
        hasAttachmentIndicator,
    );

    return (
        <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-blue-300 dark:hover:text-blue-200"
        >
            <Paperclip className="h-4 w-4" />
            {presentation.viewLabel}
        </a>
    );
}
