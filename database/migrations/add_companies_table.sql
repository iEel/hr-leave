-- =============================================
-- Migration: Add Companies Table
-- Date: 2026-01-23
-- Description: สร้างตาราง Companies สำหรับจัดการบริษัทแบบ Dynamic
-- =============================================

-- Create Companies table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Companies' AND xtype='U')
BEGIN
    CREATE TABLE Companies (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(50) NOT NULL UNIQUE,      -- รหัสบริษัท เช่น SONIC, GRANDLINK
        name NVARCHAR(255) NOT NULL,            -- ชื่อเต็ม เช่น บริษัท โซนิค อินเตอร์เฟรท จำกัด
        shortName NVARCHAR(100) NULL,           -- ชื่อย่อ เช่น Sonic
        color NVARCHAR(20) DEFAULT '#3B82F6',   -- สีสำหรับ UI (Hex code)
        isActive BIT DEFAULT 1,
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
    );
    PRINT '✅ Created Companies table';
END
ELSE
BEGIN
    PRINT 'Companies table already exists';
END
GO

-- Seed existing companies if empty
IF NOT EXISTS (SELECT 1 FROM Companies)
BEGIN
    INSERT INTO Companies (code, name, shortName, color) VALUES
    ('SONIC', N'บริษัท โซนิค อินเตอร์เฟรท จำกัด', 'Sonic', '#3B82F6'),
    ('GRANDLINK', N'บริษัท แกรนด์ลิงค์ ลอจิสติคส์ จำกัด', 'Grandlink', '#22C55E'),
    ('SONIC-AUTOLOGIS', N'บริษัท โซนิค ออโต้โลจิส จำกัด', 'Sonic Autologis', '#F97316');
    PRINT '✅ Seeded default companies (SONIC, GRANDLINK, SONIC-AUTOLOGIS)';
END
ELSE
BEGIN
    -- Add SONIC-AUTOLOGIS if not exists
    IF NOT EXISTS (SELECT 1 FROM Companies WHERE code = 'SONIC-AUTOLOGIS')
    BEGIN
        INSERT INTO Companies (code, name, shortName, color) 
        VALUES ('SONIC-AUTOLOGIS', N'บริษัท โซนิค ออโต้โลจิส จำกัด', 'Sonic Autologis', '#F97316');
        PRINT '✅ Added SONIC-AUTOLOGIS company';
    END
    PRINT 'Companies already has data, skipping seed';
END
GO

-- Create index on code for faster lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Companies_Code')
BEGIN
    CREATE INDEX IX_Companies_Code ON Companies(code);
    PRINT '✅ Created index IX_Companies_Code';
END
GO

PRINT '✅ Migration completed: add_companies_table.sql';
