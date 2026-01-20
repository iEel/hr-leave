-- ==============================================
-- SystemSettings Table (ตั้งค่าระบบ)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
    CREATE TABLE SystemSettings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        settingKey NVARCHAR(100) NOT NULL UNIQUE,
        settingValue NVARCHAR(MAX) NOT NULL,
        description NVARCHAR(255) NULL,
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedBy INT NULL,
        CONSTRAINT FK_SystemSettings_UpdatedBy FOREIGN KEY (updatedBy) REFERENCES Users(id)
    );

    -- Insert default leave quotas
    INSERT INTO SystemSettings (settingKey, settingValue, description) VALUES
    ('LEAVE_QUOTA_VACATION', '6', 'โควต้าลาพักร้อน (วัน)'),
    ('LEAVE_QUOTA_SICK', '30', 'โควต้าลาป่วย (วัน)'),
    ('LEAVE_QUOTA_PERSONAL', '3', 'โควต้าลากิจ (วัน)'),
    ('LEAVE_QUOTA_MATERNITY', '98', 'โควต้าลาคลอด (วัน)'),
    ('LEAVE_QUOTA_MILITARY', '60', 'โควต้าเกณฑ์ทหาร (วัน)'),
    ('LEAVE_QUOTA_ORDINATION', '30', 'โควต้าลาบวช (วัน)'),
    ('LEAVE_ADVANCE_DAYS', '3', 'ต้องขอล่วงหน้ากี่วัน'),
    ('LEAVE_SICK_CERT_DAYS', '3', 'ลาป่วยกี่วันต้องมีใบรับรองแพทย์'),
    ('LEAVE_YEAR_START', '01-01', 'วันเริ่มปีงบประมาณ (MM-DD)'),
    ('LEAVE_CARRYOVER_LIMIT', '5', 'จำนวนวันลาพักร้อนที่ยกข้ามปีได้สูงสุด');
END
GO
