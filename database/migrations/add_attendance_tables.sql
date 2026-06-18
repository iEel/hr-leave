-- =============================================
-- Migration: Add Attendance Tables
-- Description: Adds HIP attendance devices, logs, and sync run tracking.
-- =============================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceDevices' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceDevices (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        branchName NVARCHAR(100) NULL,
        protocol NVARCHAR(30) NOT NULL DEFAULT 'HIP_CMIF68S',
        ipAddress VARCHAR(45) NOT NULL,
        port INT NOT NULL DEFAULT 5005,
        passCode NVARCHAR(100) NULL,
        isActive BIT NOT NULL DEFAULT 1,
        syncEnabled BIT NOT NULL DEFAULT 0,
        syncFrequencyMinutes INT NOT NULL DEFAULT 60,
        timeoutMs INT NOT NULL DEFAULT 10000,
        retryCount INT NOT NULL DEFAULT 2,
        lastSyncAt DATETIME2 NULL,
        lastSuccessfulSyncAt DATETIME2 NULL,
        nextSyncAt DATETIME2 NULL,
        lastSyncStatus NVARCHAR(20) NULL,
        lastError NVARCHAR(MAX) NULL,
        lastNewCount INT NULL,
        lastInsertedCount INT NULL,
        syncLockUntil DATETIME2 NULL,
        syncLockOwner NVARCHAR(100) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Created table: AttendanceDevices';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AttendanceDevices_DueSync' AND object_id = OBJECT_ID('AttendanceDevices'))
BEGIN
    CREATE INDEX IX_AttendanceDevices_DueSync
        ON AttendanceDevices(syncEnabled, isActive, nextSyncAt)
        INCLUDE (ipAddress, port, protocol);

    PRINT 'Created index: IX_AttendanceDevices_DueSync';
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceLogs' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceLogs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        deviceId INT NOT NULL,
        userKey INT NOT NULL,
        employeeId NVARCHAR(20) NULL,
        recordTime DATETIME2 NOT NULL,
        rawRecordTime DATETIME2 NOT NULL,
        yearCode INT NOT NULL,
        verifyCode INT NOT NULL,
        verifyType NVARCHAR(20) NOT NULL,
        recordHex VARCHAR(40) NOT NULL,
        sourceCommand NVARCHAR(20) NOT NULL DEFAULT 'A1',
        syncedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AttendanceLogs_Device
            FOREIGN KEY (deviceId) REFERENCES AttendanceDevices(id)
    );

    PRINT 'Created table: AttendanceLogs';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_AttendanceLogs_Dedupe' AND object_id = OBJECT_ID('AttendanceLogs'))
BEGIN
    CREATE UNIQUE INDEX UX_AttendanceLogs_Dedupe
        ON AttendanceLogs(deviceId, userKey, recordTime, verifyType, recordHex);

    PRINT 'Created index: UX_AttendanceLogs_Dedupe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AttendanceLogs_EmployeeDate' AND object_id = OBJECT_ID('AttendanceLogs'))
BEGIN
    CREATE INDEX IX_AttendanceLogs_EmployeeDate
        ON AttendanceLogs(employeeId, recordTime)
        INCLUDE (userKey, verifyType, deviceId);

    PRINT 'Created index: IX_AttendanceLogs_EmployeeDate';
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceSyncRuns' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceSyncRuns (
        id INT IDENTITY(1,1) PRIMARY KEY,
        deviceId INT NOT NULL,
        mode NVARCHAR(20) NOT NULL DEFAULT 'INCREMENTAL',
        status NVARCHAR(20) NOT NULL DEFAULT 'RUNNING',
        triggerType NVARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        triggeredByUserId INT NULL,
        startedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        finishedAt DATETIME2 NULL,
        newCount INT NOT NULL DEFAULT 0,
        receivedCount INT NOT NULL DEFAULT 0,
        insertedCount INT NOT NULL DEFAULT 0,
        duplicateCount INT NOT NULL DEFAULT 0,
        confirmedCount INT NOT NULL DEFAULT 0,
        errorMessage NVARCHAR(MAX) NULL,
        CONSTRAINT FK_AttendanceSyncRuns_Device
            FOREIGN KEY (deviceId) REFERENCES AttendanceDevices(id),
        CONSTRAINT FK_AttendanceSyncRuns_TriggeredByUser
            FOREIGN KEY (triggeredByUserId) REFERENCES Users(id)
    );

    PRINT 'Created table: AttendanceSyncRuns';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AttendanceSyncRuns_DeviceStartedAt' AND object_id = OBJECT_ID('AttendanceSyncRuns'))
BEGIN
    CREATE INDEX IX_AttendanceSyncRuns_DeviceStartedAt
        ON AttendanceSyncRuns(deviceId, startedAt DESC);

    PRINT 'Created index: IX_AttendanceSyncRuns_DeviceStartedAt';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM AttendanceDevices
    WHERE protocol = 'HIP_CMIF68S'
      AND ipAddress = '192.168.108.201'
      AND port = 5005
)
BEGIN
    INSERT INTO AttendanceDevices (
        name,
        protocol,
        ipAddress,
        port,
        passCode,
        syncEnabled,
        syncFrequencyMinutes,
        timeoutMs,
        retryCount,
        nextSyncAt
    )
    VALUES (
        N'HIP CMiF68S',
        'HIP_CMIF68S',
        '192.168.108.201',
        5005,
        '0',
        0,
        60,
        10000,
        2,
        GETDATE()
    );

    PRINT 'Seeded default HIP attendance device';
END
GO

PRINT 'Migration completed: add_attendance_tables.sql';
GO
