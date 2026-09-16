-- Additive, idempotent migration. Times in these tables are UTC.
IF OBJECT_ID('dbo.EmailOutbox', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailOutbox (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        dedupeKey NVARCHAR(250) NOT NULL UNIQUE,
        -- Historical IDs survive existing employee/leave archival.
        leaveId INT NOT NULL,
        kind VARCHAR(10) NOT NULL CHECK (kind IN ('REQUEST', 'RESULT')),
        expectedLeaveStatus VARCHAR(20) NOT NULL,
        recipient NVARCHAR(320) NOT NULL,
        approverId INT NULL,
        subject NVARCHAR(500) NOT NULL,
        html NVARCHAR(MAX) NULL,
        messageId NVARCHAR(250) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING','SENDING','SMTP_ACCEPTED','FAILED','UNCERTAIN','SKIPPED')),
        attemptCount INT NOT NULL DEFAULT 0,
        nextAttemptAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        claimToken UNIQUEIDENTIFIER NULL,
        claimedAt DATETIME2 NULL,
        lastError NVARCHAR(1000) NULL,
        smtpResponse NVARCHAR(1000) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        acceptedAt DATETIME2 NULL
    );
    CREATE INDEX IX_EmailOutbox_Due ON dbo.EmailOutbox(status, nextAttemptAt, id);
    CREATE INDEX IX_EmailOutbox_Leave ON dbo.EmailOutbox(leaveId, id);
END;
IF OBJECT_ID('dbo.EmailDeliveryAttempts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailDeliveryAttempts (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        outboxId INT NOT NULL REFERENCES dbo.EmailOutbox(id),
        attemptNumber INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        error NVARCHAR(1000) NULL,
        smtpResponse NVARCHAR(1000) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EmailDeliveryAttempts UNIQUE(outboxId, attemptNumber)
    );
END;
