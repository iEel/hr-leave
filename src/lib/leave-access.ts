export interface LeaveDetailViewer {
    userId: number;
    role: string;
    isHRStaff?: boolean;
    delegatingManagerIds?: number[];
}

export interface LeaveDetailOwner {
    userId: number;
    managerId: number | null;
}

export function canViewLeaveDetail(viewer: LeaveDetailViewer, owner: LeaveDetailOwner): boolean {
    if (viewer.userId === owner.userId) return true;
    if (viewer.role === 'HR' || viewer.role === 'ADMIN' || viewer.isHRStaff === true) return true;
    if (owner.managerId && viewer.userId === owner.managerId) return true;
    if (owner.managerId && viewer.delegatingManagerIds?.includes(owner.managerId)) return true;
    return false;
}
