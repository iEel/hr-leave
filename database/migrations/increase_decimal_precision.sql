-- Migration: Increase DECIMAL precision for hourly leave support
-- Problem: DECIMAL(5,2) truncates 1/7.5=0.13333 to 0.13, causing display errors
-- Solution: Increase to DECIMAL(8,4) for better precision while supporting large values

-- LeaveRequests
ALTER TABLE LeaveRequests ALTER COLUMN usageAmount DECIMAL(8,4) NOT NULL;

-- LeaveRequestYearSplit
ALTER TABLE LeaveRequestYearSplit ALTER COLUMN usageAmount DECIMAL(8,4) NOT NULL;

-- LeaveBalances
ALTER TABLE LeaveBalances ALTER COLUMN entitlement DECIMAL(8,4) NOT NULL;
ALTER TABLE LeaveBalances ALTER COLUMN used DECIMAL(8,4) NOT NULL;
ALTER TABLE LeaveBalances ALTER COLUMN remaining DECIMAL(8,4) NOT NULL;
ALTER TABLE LeaveBalances ALTER COLUMN carryOver DECIMAL(8,4) NOT NULL;

PRINT 'Migration complete: DECIMAL precision increased to (8,4)';
