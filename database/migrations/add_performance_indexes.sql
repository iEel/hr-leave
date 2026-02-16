-- ==============================================
-- Performance Index Migration
-- Date: 16 ก.พ. 2026
-- Purpose: Add composite indexes for frequently queried patterns
-- ==============================================

-- ==============================================
-- 1. LeaveRequests: Overlap Check Query
--    Used by: POST /api/leave/request (overlap detection)
--    Pattern: WHERE userId = ? AND status IN ('PENDING','APPROVED') AND startDatetime/endDatetime range
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LeaveRequests_UserId_Status_Dates')
BEGIN
    CREATE NONCLUSTERED INDEX IX_LeaveRequests_UserId_Status_Dates
    ON LeaveRequests (userId, status)
    INCLUDE (startDatetime, endDatetime);
    PRINT '✅ Created IX_LeaveRequests_UserId_Status_Dates';
END
GO

-- ==============================================
-- 2. LeaveRequests: History/Pending list queries
--    Used by: GET /api/leave/history, GET /api/leave/pending, GET /api/hr/leaves
--    Pattern: WHERE userId = ? ORDER BY createdAt DESC
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LeaveRequests_UserId_CreatedAt')
BEGIN
    CREATE NONCLUSTERED INDEX IX_LeaveRequests_UserId_CreatedAt
    ON LeaveRequests (userId, createdAt DESC);
    PRINT '✅ Created IX_LeaveRequests_UserId_CreatedAt';
END
GO

-- ==============================================
-- 3. LeaveRequests: Approve/Cancel status lookup
--    Used by: POST /api/leave/approve, POST /api/leave/cancel (optimistic lock)
--    Pattern: WHERE id = ? AND status = 'PENDING'
--    Note: PK already covers id, this adds status for the optimistic lock WHERE clause
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LeaveRequests_Id_Status')
BEGIN
    CREATE NONCLUSTERED INDEX IX_LeaveRequests_Id_Status
    ON LeaveRequests (id, status);
    PRINT '✅ Created IX_LeaveRequests_Id_Status';
END
GO

-- ==============================================
-- 4. Notifications: Unread count + list (most frequent query)
--    Used by: GET /api/notifications (called every page load)
--    Pattern: WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Notifications_UserId_IsRead_CreatedAt')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Notifications_UserId_IsRead_CreatedAt
    ON Notifications (userId, isRead, createdAt DESC);
    PRINT '✅ Created IX_Notifications_UserId_IsRead_CreatedAt';
END
GO

-- ==============================================
-- 5. Users: Active employees by company (HR pages, Year-End)
--    Used by: GET /api/hr/overview, POST /api/hr/year-end/execute
--    Pattern: WHERE isActive = 1 AND company = ?
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_IsActive_Company')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Users_IsActive_Company
    ON Users (isActive, company)
    INCLUDE (department, departmentHeadId);
    PRINT '✅ Created IX_Users_IsActive_Company';
END
GO

-- ==============================================
-- 6. DelegateApprovers: Active delegates lookup
--    Used by: lib/delegate.ts (getActiveDelegates, getDelegatingManagers)
--    Pattern: WHERE managerId = ? AND isActive = 1 AND startDate/endDate range
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DelegateApprovers_ManagerId_IsActive_Dates')
BEGIN
    CREATE NONCLUSTERED INDEX IX_DelegateApprovers_ManagerId_IsActive_Dates
    ON DelegateApprovers (managerId, isActive)
    INCLUDE (delegateUserId, startDate, endDate);
    PRINT '✅ Created IX_DelegateApprovers_ManagerId_IsActive_Dates';
END
GO

-- ==============================================
-- 7. AuditLogs: Filtered list by action + date range
--    Used by: GET /api/hr/audit-logs, GET /api/admin/audit-logs
--    Pattern: WHERE action = ? ORDER BY createdAt DESC (with pagination)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLogs_Action_CreatedAt')
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLogs_Action_CreatedAt
    ON AuditLogs (action, createdAt DESC);
    PRINT '✅ Created IX_AuditLogs_Action_CreatedAt';
END
GO

-- ==============================================
-- 8. PublicHolidays: Date range lookup with company filter
--    Used by: POST /api/leave/request (holiday exclusion during calculation)
--    Pattern: WHERE date BETWEEN ? AND ? AND (company = ? OR company IS NULL)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PublicHolidays_Date_Company')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PublicHolidays_Date_Company
    ON PublicHolidays (date, company);
    PRINT '✅ Created IX_PublicHolidays_Date_Company';
END
GO

PRINT '';
PRINT '🎉 Performance indexes migration completed!';
GO
