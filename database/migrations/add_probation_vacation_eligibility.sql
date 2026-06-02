-- =============================================
-- Migration: Add probation vacation eligibility fields
-- Date: 2026-06-02
-- Description: เพิ่มข้อมูลทดลองงานและค่าเริ่มต้นสิทธิ์ลาพักร้อนหลังผ่านทดลองงาน
-- =============================================

-- Add probation fields to Users table.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'probationDays')
BEGIN
    ALTER TABLE Users ADD probationDays INT NULL;
    PRINT 'Added probationDays column to Users table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'probationExtensionDays')
BEGIN
    ALTER TABLE Users ADD probationExtensionDays INT NULL;
    PRINT 'Added probationExtensionDays column to Users table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'probationOverrideDate')
BEGIN
    ALTER TABLE Users ADD probationOverrideDate DATE NULL;
    PRINT 'Added probationOverrideDate column to Users table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'probationEndDate')
BEGIN
    ALTER TABLE Users ADD probationEndDate DATE NULL;
    PRINT 'Added probationEndDate column to Users table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'probationNote')
BEGIN
    ALTER TABLE Users ADD probationNote NVARCHAR(500) NULL;
    PRINT 'Added probationNote column to Users table';
END
GO

-- Backfill existing users before enforcing NOT NULL on integer fields.
UPDATE Users
SET probationDays = 90
WHERE probationDays IS NULL;
GO

UPDATE Users
SET probationExtensionDays = 0
WHERE probationExtensionDays IS NULL;
GO

UPDATE Users
SET probationEndDate = COALESCE(
    probationOverrideDate,
    DATEADD(day, probationDays + probationExtensionDays, startDate)
)
WHERE probationEndDate IS NULL;
GO

IF EXISTS (
    SELECT *
    FROM sys.columns
    WHERE object_id = OBJECT_ID('Users')
      AND name = 'probationDays'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE Users ALTER COLUMN probationDays INT NOT NULL;
END
GO

IF EXISTS (
    SELECT *
    FROM sys.columns
    WHERE object_id = OBJECT_ID('Users')
      AND name = 'probationExtensionDays'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE Users ALTER COLUMN probationExtensionDays INT NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT *
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('Users')
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('Users'), 'probationDays', 'ColumnId')
)
BEGIN
    ALTER TABLE Users ADD CONSTRAINT DF_Users_ProbationDays DEFAULT 90 FOR probationDays;
END
GO

IF NOT EXISTS (
    SELECT *
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('Users')
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('Users'), 'probationExtensionDays', 'ColumnId')
)
BEGIN
    ALTER TABLE Users ADD CONSTRAINT DF_Users_ProbationExtensionDays DEFAULT 0 FOR probationExtensionDays;
END
GO

-- Ensure SystemSettings has the expected shape before adding defaults.
IF OBJECT_ID('dbo.SystemSettings', 'U') IS NULL
BEGIN
    THROW 51000, 'Prerequisite missing: dbo.SystemSettings table must exist before running add_probation_vacation_eligibility.sql.', 1;
END
GO

IF COL_LENGTH('dbo.SystemSettings', 'settingKey') IS NULL
   OR COL_LENGTH('dbo.SystemSettings', 'settingValue') IS NULL
BEGIN
    THROW 51001, 'Prerequisite incompatible: dbo.SystemSettings must contain settingKey and settingValue columns.', 1;
END
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.SystemSettings')
      AND c.name IN ('settingKey', 'settingValue')
      AND t.name NOT IN ('nvarchar', 'varchar', 'nchar', 'char')
)
BEGIN
    THROW 51002, 'Prerequisite incompatible: dbo.SystemSettings settingKey and settingValue columns must be character text types.', 1;
END
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.SystemSettings')
      AND c.name = 'description'
      AND t.name NOT IN ('nvarchar', 'varchar', 'nchar', 'char')
)
BEGIN
    THROW 51003, 'Prerequisite incompatible: dbo.SystemSettings description column must be a character text type when present.', 1;
END
GO

IF COL_LENGTH('dbo.SystemSettings', 'description') IS NULL
BEGIN
    ALTER TABLE SystemSettings ADD description NVARCHAR(255) NULL;
    PRINT 'Added description column to SystemSettings table';
END
GO

IF NOT EXISTS (SELECT * FROM SystemSettings WHERE settingKey = 'PROBATION_STANDARD_DAYS')
BEGIN
    INSERT INTO SystemSettings (settingKey, settingValue, description)
    VALUES ('PROBATION_STANDARD_DAYS', '90', N'ระยะทดลองงานมาตรฐาน (วัน)');
END
GO

IF NOT EXISTS (SELECT * FROM SystemSettings WHERE settingKey = 'VACATION_AFTER_PROBATION_YEARS')
BEGIN
    INSERT INTO SystemSettings (settingKey, settingValue, description)
    VALUES ('VACATION_AFTER_PROBATION_YEARS', '1', N'ลาพักร้อนเริ่มใช้สิทธิ์หลังผ่านทดลองงาน (ปี)');
END
GO

PRINT 'Migration completed: add_probation_vacation_eligibility.sql';
GO
