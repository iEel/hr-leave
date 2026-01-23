-- ==============================================
-- AD User Lifecycle Support Migration
-- Adds adStatus, deletedAt columns and Archive tables
-- ==============================================

-- 1. Add adStatus column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'adStatus')
BEGIN
    ALTER TABLE Users ADD adStatus NVARCHAR(20) DEFAULT 'ACTIVE';
    PRINT 'Added column: adStatus';
END
GO

-- 2. Add deletedAt column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'deletedAt')
BEGIN
    ALTER TABLE Users ADD deletedAt DATETIME2 NULL;
    PRINT 'Added column: deletedAt';
END
GO

-- 3. Set default adStatus for existing users
UPDATE Users SET adStatus = 'ACTIVE' WHERE adStatus IS NULL AND isActive = 1;
UPDATE Users SET adStatus = 'DISABLED' WHERE adStatus IS NULL AND isActive = 0;
PRINT 'Updated existing users with adStatus';
GO

-- 4. Create UsersArchive table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UsersArchive' AND xtype='U')
BEGIN
    CREATE TABLE UsersArchive (
        id INT PRIMARY KEY,
        employeeId NVARCHAR(20) NOT NULL,
        email NVARCHAR(100) NOT NULL,
        password NVARCHAR(255) NOT NULL,
        firstName NVARCHAR(100) NOT NULL,
        lastName NVARCHAR(100) NOT NULL,
        role NVARCHAR(20) NOT NULL,
        company NVARCHAR(20) NOT NULL,
        department NVARCHAR(100) NOT NULL,
        gender CHAR(1) NOT NULL,
        startDate DATE NOT NULL,
        departmentHeadId INT NULL,
        isActive BIT NOT NULL DEFAULT 0,
        isADUser BIT NOT NULL DEFAULT 0,
        adUsername NVARCHAR(100) NULL,
        authProvider VARCHAR(20) DEFAULT 'LOCAL',
        adStatus NVARCHAR(20) DEFAULT 'ARCHIVED',
        deletedAt DATETIME2 NULL,
        archivedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        createdAt DATETIME2 NOT NULL,
        updatedAt DATETIME2 NOT NULL
    );
    
    CREATE INDEX IX_UsersArchive_EmployeeId ON UsersArchive(employeeId);
    CREATE INDEX IX_UsersArchive_ArchivedAt ON UsersArchive(archivedAt);
    PRINT 'Created table: UsersArchive';
END
GO

-- 5. Create LeaveBalancesArchive table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveBalancesArchive' AND xtype='U')
BEGIN
    CREATE TABLE LeaveBalancesArchive (
        id INT PRIMARY KEY,
        userId INT NOT NULL,
        leaveType NVARCHAR(20) NOT NULL,
        year INT NOT NULL,
        entitlement DECIMAL(5,2) NOT NULL DEFAULT 0,
        used DECIMAL(5,2) NOT NULL DEFAULT 0,
        remaining DECIMAL(5,2) NOT NULL DEFAULT 0,
        carryOver DECIMAL(5,2) NOT NULL DEFAULT 0,
        archivedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        createdAt DATETIME2 NOT NULL,
        updatedAt DATETIME2 NOT NULL
    );
    
    CREATE INDEX IX_LeaveBalancesArchive_UserId ON LeaveBalancesArchive(userId);
    CREATE INDEX IX_LeaveBalancesArchive_ArchivedAt ON LeaveBalancesArchive(archivedAt);
    PRINT 'Created table: LeaveBalancesArchive';
END
GO

-- 6. Create LeaveRequestsArchive table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveRequestsArchive' AND xtype='U')
BEGIN
    CREATE TABLE LeaveRequestsArchive (
        id INT PRIMARY KEY,
        userId INT NOT NULL,
        leaveType NVARCHAR(20) NOT NULL,
        startDatetime DATETIME2 NOT NULL,
        endDatetime DATETIME2 NOT NULL,
        isHourly BIT NOT NULL DEFAULT 0,
        startTime NVARCHAR(5) NULL,
        endTime NVARCHAR(5) NULL,
        timeSlot NVARCHAR(20) NOT NULL DEFAULT 'FULL_DAY',
        usageAmount DECIMAL(5,2) NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        rejectionReason NVARCHAR(500) NULL,
        hasMedicalCertificate BIT NOT NULL DEFAULT 0,
        medicalCertificateFile NVARCHAR(255) NULL,
        approverId INT NULL,
        approvedAt DATETIME2 NULL,
        archivedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        createdAt DATETIME2 NOT NULL,
        updatedAt DATETIME2 NOT NULL
    );
    
    CREATE INDEX IX_LeaveRequestsArchive_UserId ON LeaveRequestsArchive(userId);
    CREATE INDEX IX_LeaveRequestsArchive_ArchivedAt ON LeaveRequestsArchive(archivedAt);
    PRINT 'Created table: LeaveRequestsArchive';
END
GO

-- 7. Create index for adStatus
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_AdStatus' AND object_id = OBJECT_ID('Users'))
BEGIN
    CREATE INDEX IX_Users_AdStatus ON Users(adStatus);
    PRINT 'Created index: IX_Users_AdStatus';
END
GO

-- 8. Create index for deletedAt
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_DeletedAt' AND object_id = OBJECT_ID('Users'))
BEGIN
    CREATE INDEX IX_Users_DeletedAt ON Users(deletedAt);
    PRINT 'Created index: IX_Users_DeletedAt';
END
GO

PRINT '✅ AD User Lifecycle Migration Completed Successfully!';
GO
