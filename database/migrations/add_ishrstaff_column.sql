-- =============================================
-- Migration: Add isHRStaff Column
-- Date: 2026-01-23
-- Description: เพิ่ม flag isHRStaff เพื่อแยกสิทธิ์ HR ออกจาก Role hierarchy
-- =============================================

-- Add isHRStaff column to Users table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'isHRStaff')
BEGIN
    ALTER TABLE Users ADD isHRStaff BIT DEFAULT 0;
    PRINT '✅ Added isHRStaff column to Users table';
END
ELSE
BEGIN
    PRINT 'isHRStaff column already exists';
END
GO

-- Set existing HR role users to isHRStaff = 1
UPDATE Users SET isHRStaff = 1 WHERE role = 'HR';
PRINT '✅ Set isHRStaff = 1 for existing HR role users';
GO

-- Update index if needed
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_isHRStaff')
BEGIN
    CREATE INDEX IX_Users_isHRStaff ON Users(isHRStaff);
    PRINT '✅ Created index IX_Users_isHRStaff';
END
GO

PRINT '✅ Migration completed: add_ishrstaff_column.sql';
