-- =============================================
-- Migration: Add AuditLogs Performance Indexes
-- Date: 2026-02-16
-- Description: เพิ่ม index สำหรับ AuditLogs table เพื่อ performance
-- =============================================

-- Index สำหรับ sort by createdAt (ใช้บ่อยสุด)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_CreatedAt' AND object_id = OBJECT_ID('AuditLogs'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLogs_CreatedAt 
    ON AuditLogs(createdAt DESC);
    PRINT 'Created index IX_AuditLogs_CreatedAt';
END
GO

-- Index สำหรับ filter by action + sort by createdAt
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Action_CreatedAt' AND object_id = OBJECT_ID('AuditLogs'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLogs_Action_CreatedAt 
    ON AuditLogs(action, createdAt DESC);
    PRINT 'Created index IX_AuditLogs_Action_CreatedAt';
END
GO

-- Index สำหรับ filter by userId + sort by createdAt
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_UserId_CreatedAt' AND object_id = OBJECT_ID('AuditLogs'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLogs_UserId_CreatedAt 
    ON AuditLogs(userId, createdAt DESC);
    PRINT 'Created index IX_AuditLogs_UserId_CreatedAt';
END
GO

-- Index สำหรับ targetTable + targetId (ใช้ใน CASE subquery)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_TargetTable_TargetId' AND object_id = OBJECT_ID('AuditLogs'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLogs_TargetTable_TargetId 
    ON AuditLogs(targetTable, targetId);
    PRINT 'Created index IX_AuditLogs_TargetTable_TargetId';
END
GO

PRINT 'AuditLogs indexes migration completed successfully.';
