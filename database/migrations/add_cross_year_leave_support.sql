-- ==============================================
-- Migration: Add Cross-Year Leave Support
-- Date: 2026-02-16
-- Description: 
--   1. Add isAutoCreated column to LeaveBalances
--   2. Create LeaveRequestYearSplit table
-- ==============================================

-- 1. Add isAutoCreated column to LeaveBalances
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'LeaveBalances' AND COLUMN_NAME = 'isAutoCreated'
)
BEGIN
    ALTER TABLE LeaveBalances ADD isAutoCreated BIT NOT NULL DEFAULT 0;
    PRINT 'Added column: LeaveBalances.isAutoCreated';
END
ELSE
BEGIN
    PRINT 'Column LeaveBalances.isAutoCreated already exists - skipping';
END
GO

-- 2. Create LeaveRequestYearSplit table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LeaveRequestYearSplit' AND xtype='U')
BEGIN
    CREATE TABLE LeaveRequestYearSplit (
        id INT IDENTITY(1,1) PRIMARY KEY,
        leaveRequestId INT NOT NULL,
        year INT NOT NULL,
        usageAmount DECIMAL(5,2) NOT NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_YearSplit_LeaveRequest FOREIGN KEY (leaveRequestId) REFERENCES LeaveRequests(id),
        CONSTRAINT UQ_YearSplit_RequestYear UNIQUE (leaveRequestId, year)
    );

    CREATE INDEX IX_YearSplit_LeaveRequestId ON LeaveRequestYearSplit(leaveRequestId);
    CREATE INDEX IX_YearSplit_Year ON LeaveRequestYearSplit(year);
    PRINT 'Created table: LeaveRequestYearSplit';
END
ELSE
BEGIN
    PRINT 'Table LeaveRequestYearSplit already exists - skipping';
END
GO

-- 3. Backfill: Create LeaveRequestYearSplit records for existing leave requests
-- This ensures existing data is compatible with the new split-year logic
IF NOT EXISTS (SELECT TOP 1 1 FROM LeaveRequestYearSplit)
BEGIN
    INSERT INTO LeaveRequestYearSplit (leaveRequestId, year, usageAmount)
    SELECT 
        id,
        YEAR(startDatetime),
        usageAmount
    FROM LeaveRequests
    WHERE status IN ('PENDING', 'APPROVED');

    DECLARE @count INT = @@ROWCOUNT;
    PRINT 'Backfilled ' + CAST(@count AS VARCHAR) + ' existing leave requests into LeaveRequestYearSplit';
END
ELSE
BEGIN
    PRINT 'LeaveRequestYearSplit already has data - skipping backfill';
END
GO

PRINT '✅ Migration: Cross-Year Leave Support completed successfully!';
GO
