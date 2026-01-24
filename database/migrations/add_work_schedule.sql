-- =====================================================
-- Migration: Add Work Schedule & Working Saturdays
-- Date: 2026-01-24
-- =====================================================

-- เพิ่มการตั้งค่าเวลาทำงานใน SystemSettings
IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE settingKey = 'WORK_START_TIME')
BEGIN
    INSERT INTO SystemSettings (settingKey, settingValue) VALUES
        ('WORK_START_TIME', '08:30'),
        ('WORK_END_TIME', '17:00'),
        ('BREAK_START_TIME', '12:00'),
        ('BREAK_END_TIME', '13:00'),
        ('WORK_HOURS_PER_DAY', '7.5'),
        ('SAT_WORK_START_TIME', '09:00'),
        ('SAT_WORK_END_TIME', '12:00'),
        ('SAT_WORK_HOURS', '3');
    PRINT '✅ Work schedule settings added';
END
GO

-- สร้างตาราง WorkingSaturdays
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkingSaturdays' AND xtype='U')
BEGIN
    CREATE TABLE WorkingSaturdays (
        id INT IDENTITY(1,1) PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        startTime NVARCHAR(5) NOT NULL DEFAULT '09:00',
        endTime NVARCHAR(5) NOT NULL DEFAULT '12:00',
        workHours DECIMAL(4,2) NOT NULL DEFAULT 3,
        description NVARCHAR(100) NULL,
        company NVARCHAR(20) NULL,
        createdBy INT NOT NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_WorkingSaturdays_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_WorkingSaturdays_Date ON WorkingSaturdays(date);
    CREATE INDEX IX_WorkingSaturdays_Company ON WorkingSaturdays(company);
    
    PRINT '✅ WorkingSaturdays table created';
END
GO

PRINT '✅ Migration completed: Work Schedule & Working Saturdays';
GO
