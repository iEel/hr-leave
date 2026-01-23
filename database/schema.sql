-- ==============================================
-- HR Leave Management System - Database Schema
-- Database: MS SQL Server 2025
-- Timezone: Asia/Bangkok
-- ==============================================

-- Create Database (run manually if needed)
-- CREATE DATABASE HRLeave;
-- GO
-- USE HRLeave;
-- GO

-- ==============================================
-- Users Table (พนักงาน)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
BEGIN
    CREATE TABLE Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employeeId NVARCHAR(20) NOT NULL UNIQUE,
        email NVARCHAR(100) NOT NULL UNIQUE,
        password NVARCHAR(255) NOT NULL,
        firstName NVARCHAR(100) NOT NULL,
        lastName NVARCHAR(100) NOT NULL,
        role NVARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE', -- EMPLOYEE, MANAGER, HR, ADMIN
        company NVARCHAR(20) NOT NULL, -- SONIC, GRANDLINK
        department NVARCHAR(100) NOT NULL,
        gender CHAR(1) NOT NULL, -- M, F
        startDate DATE NOT NULL,
        departmentHeadId INT NULL,
        isActive BIT NOT NULL DEFAULT 1,
        isADUser BIT NOT NULL DEFAULT 0,
        adUsername NVARCHAR(100) NULL,
        authProvider VARCHAR(20) DEFAULT 'LOCAL', -- LOCAL, AD, AZURE
        adStatus NVARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, DISABLED, AD_DELETED, ARCHIVED
        deletedAt DATETIME2 NULL, -- Timestamp when deleted from AD
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Users_DepartmentHead FOREIGN KEY (departmentHeadId) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_Users_EmployeeId ON Users(employeeId);
    CREATE INDEX IX_Users_Company ON Users(company);
    CREATE INDEX IX_Users_Department ON Users(department);
    CREATE INDEX IX_Users_DepartmentHeadId ON Users(departmentHeadId);
END
GO

-- ==============================================
-- LeaveRequests Table (ใบคำร้องขอลา)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveRequests' AND xtype='U')
BEGIN
    CREATE TABLE LeaveRequests (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        leaveType NVARCHAR(20) NOT NULL, -- VACATION, SICK, PERSONAL, MATERNITY, etc.
        startDatetime DATETIME2 NOT NULL,
        endDatetime DATETIME2 NOT NULL,
        isHourly BIT NOT NULL DEFAULT 0, -- 0=Day/HalfDay, 1=Hourly
        startTime NVARCHAR(5) NULL, -- HH:mm (e.g. '09:30')
        endTime NVARCHAR(5) NULL,   -- HH:mm (e.g. '11:30')
        timeSlot NVARCHAR(20) NOT NULL DEFAULT 'FULL_DAY', -- FULL_DAY, HALF_MORNING, HALF_AFTERNOON
        usageAmount DECIMAL(5,2) NOT NULL, -- จำนวนวันสุทธิ
        reason NVARCHAR(500) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, CANCELLED
        rejectionReason NVARCHAR(500) NULL,
        hasMedicalCertificate BIT NOT NULL DEFAULT 0,
        medicalCertificateFile NVARCHAR(255) NULL,
        approverId INT NULL,
        approvedAt DATETIME2 NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_LeaveRequests_User FOREIGN KEY (userId) REFERENCES Users(id),
        CONSTRAINT FK_LeaveRequests_Approver FOREIGN KEY (approverId) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_LeaveRequests_UserId ON LeaveRequests(userId);
    CREATE INDEX IX_LeaveRequests_Status ON LeaveRequests(status);
    CREATE INDEX IX_LeaveRequests_LeaveType ON LeaveRequests(leaveType);
    CREATE INDEX IX_LeaveRequests_StartDatetime ON LeaveRequests(startDatetime);
END
GO

-- ==============================================
-- LeaveBalances Table (ยอดวันลาคงเหลือ)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveBalances' AND xtype='U')
BEGIN
    CREATE TABLE LeaveBalances (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        leaveType NVARCHAR(20) NOT NULL,
        year INT NOT NULL,
        entitlement DECIMAL(5,2) NOT NULL DEFAULT 0, -- สิทธิ์ที่ได้รับ
        used DECIMAL(5,2) NOT NULL DEFAULT 0, -- ใช้ไปแล้ว
        remaining DECIMAL(5,2) NOT NULL DEFAULT 0, -- คงเหลือ
        carryOver DECIMAL(5,2) NOT NULL DEFAULT 0, -- ยกยอดจากปีก่อน
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_LeaveBalances_User FOREIGN KEY (userId) REFERENCES Users(id),
        CONSTRAINT UQ_LeaveBalances_UserYearType UNIQUE (userId, leaveType, year)
    );
    
    CREATE INDEX IX_LeaveBalances_UserId ON LeaveBalances(userId);
    CREATE INDEX IX_LeaveBalances_Year ON LeaveBalances(year);
END
GO

-- ==============================================
-- PublicHolidays Table (วันหยุดประเพณี/พิเศษ)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PublicHolidays' AND xtype='U')
BEGIN
    CREATE TABLE PublicHolidays (
        id INT IDENTITY(1,1) PRIMARY KEY,
        date DATE NOT NULL,
        name NVARCHAR(100) NOT NULL,
        type NVARCHAR(20) NOT NULL, -- PUBLIC, SPECIAL
        company NVARCHAR(20) NULL, -- NULL = ทุกบริษัท, SONIC, GRANDLINK
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_PublicHolidays_Date ON PublicHolidays(date);
    CREATE INDEX IX_PublicHolidays_Company ON PublicHolidays(company);
END
GO

-- ==============================================
-- Notifications Table (การแจ้งเตือน)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')
BEGIN
    CREATE TABLE Notifications (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        title NVARCHAR(100) NOT NULL,
        message NVARCHAR(500) NOT NULL,
        link NVARCHAR(255) NULL,
        isRead BIT NOT NULL DEFAULT 0,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Notifications_User FOREIGN KEY (userId) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_Notifications_UserId ON Notifications(userId);
    CREATE INDEX IX_Notifications_IsRead ON Notifications(isRead);
END
GO

-- ==============================================
-- AuditLogs Table (บันทึกกิจกรรม)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditLogs' AND xtype='U')
BEGIN
    CREATE TABLE AuditLogs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        action NVARCHAR(100) NOT NULL,
        targetTable NVARCHAR(50) NOT NULL,
        targetId INT NULL,
        oldValue NVARCHAR(MAX) NULL,
        newValue NVARCHAR(MAX) NULL,
        ipAddress NVARCHAR(50) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AuditLogs_User FOREIGN KEY (userId) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_AuditLogs_UserId ON AuditLogs(userId);
    CREATE INDEX IX_AuditLogs_Action ON AuditLogs(action);
    CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs(createdAt);
END
GO

-- ==============================================
-- LeaveQuotaSettings Table (ตั้งค่าโควตาวันลา)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveQuotaSettings' AND xtype='U')
BEGIN
    CREATE TABLE LeaveQuotaSettings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        leaveType NVARCHAR(20) NOT NULL UNIQUE,
        defaultDays INT NOT NULL,
        minTenureYears INT NOT NULL DEFAULT 0,
        requiresMedicalCert BIT NOT NULL DEFAULT 0,
        medicalCertDaysThreshold INT NOT NULL DEFAULT 0,
        isPaid BIT NOT NULL DEFAULT 1,
        maxPaidDays INT NULL,
        allowCarryOver BIT NOT NULL DEFAULT 0,
        maxCarryOverDays INT NOT NULL DEFAULT 0,
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- ==============================================
-- DelegateApprovers Table (ผู้รักษาการแทน)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DelegateApprovers' AND xtype='U')
BEGIN
    CREATE TABLE DelegateApprovers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        managerId INT NOT NULL,
        delegateUserId INT NOT NULL,
        startDate DATE NOT NULL,
        endDate DATE NOT NULL,
        isActive BIT NOT NULL DEFAULT 1,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_DelegateApprovers_Manager FOREIGN KEY (managerId) REFERENCES Users(id),
        CONSTRAINT FK_DelegateApprovers_Delegate FOREIGN KEY (delegateUserId) REFERENCES Users(id)
    );
    
    CREATE INDEX IX_DelegateApprovers_ManagerId ON DelegateApprovers(managerId);
    CREATE INDEX IX_DelegateApprovers_IsActive ON DelegateApprovers(isActive);
END
GO

-- ==============================================
-- Insert Default Leave Quota Settings
-- ==============================================
IF NOT EXISTS (SELECT * FROM LeaveQuotaSettings)
BEGIN
    INSERT INTO LeaveQuotaSettings (leaveType, defaultDays, minTenureYears, requiresMedicalCert, medicalCertDaysThreshold, isPaid, maxPaidDays, allowCarryOver, maxCarryOverDays)
    VALUES 
        ('VACATION', 6, 1, 0, 0, 1, 6, 0, 0),
        ('SICK', 30, 0, 1, 3, 1, 30, 0, 0),
        ('PERSONAL', 10, 0, 0, 0, 1, 10, 0, 0),
        ('MATERNITY', 120, 0, 1, 1, 1, 60, 0, 0),
        ('MILITARY', 60, 0, 0, 0, 1, 60, 0, 0),
        ('ORDINATION', 30, 2, 0, 0, 1, 30, 0, 0),
        ('STERILIZATION', 30, 0, 1, 1, 1, 30, 0, 0),
        ('TRAINING', 30, 0, 0, 0, 1, 30, 0, 0),
        ('OTHER', 0, 0, 0, 0, 0, 0, 0, 0);
END
GO

-- ==============================================
-- Insert Sample Admin User (Password: admin123)
-- BCrypt hash for 'admin123'
-- ==============================================
IF NOT EXISTS (SELECT * FROM Users WHERE employeeId = 'ADMIN001')
BEGIN
    INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, gender, startDate)
    VALUES (
        'ADMIN001',
        'admin@sonic.co.th',
        '$2a$10$rQEcmKwKj0UvY.C.Y7R1B.4n5M0VYsZtqvJVYXhPL3mJU4TZsAb2.', -- admin123
        'System',
        'Administrator',
        'ADMIN',
        'SONIC',
        'IT',
        'M',
        '2020-01-01'
    );
END
GO

-- ==============================================
-- SystemSettings Table (ตั้งค่าระบบ)
-- ==============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
    CREATE TABLE SystemSettings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        settingKey NVARCHAR(50) NOT NULL UNIQUE,
        settingValue NVARCHAR(MAX) NULL,
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_SystemSettings_Key ON SystemSettings(settingKey);
END
GO

PRINT '✅ HR Leave Database Schema Created Successfully!';
GO
