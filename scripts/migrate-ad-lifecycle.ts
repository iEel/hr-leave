import 'dotenv/config';
import { getConnection, closeConnection } from '../src/lib/db';

async function runMigration() {
    console.log('🚀 Running AD Lifecycle Migration...\n');

    try {
        const pool = await getConnection();

        // 1. Add adStatus column
        console.log('1. Adding adStatus column...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'adStatus')
            BEGIN
                ALTER TABLE Users ADD adStatus NVARCHAR(20) DEFAULT 'ACTIVE';
                PRINT 'Added column: adStatus';
            END
        `);
        console.log('   ✅ adStatus column ready');

        // 2. Add deletedAt column
        console.log('2. Adding deletedAt column...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'deletedAt')
            BEGIN
                ALTER TABLE Users ADD deletedAt DATETIME2 NULL;
                PRINT 'Added column: deletedAt';
            END
        `);
        console.log('   ✅ deletedAt column ready');

        // 3. Set default adStatus for existing users
        console.log('3. Updating existing users with adStatus...');
        await pool.request().query(`
            UPDATE Users SET adStatus = 'ACTIVE' WHERE adStatus IS NULL AND isActive = 1;
            UPDATE Users SET adStatus = 'DISABLED' WHERE adStatus IS NULL AND isActive = 0;
        `);
        console.log('   ✅ Existing users updated');

        // 4. Create UsersArchive table
        console.log('4. Creating UsersArchive table...');
        await pool.request().query(`
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
                PRINT 'Created table: UsersArchive';
            END
        `);
        console.log('   ✅ UsersArchive table ready');

        // 5. Create LeaveBalancesArchive table
        console.log('5. Creating LeaveBalancesArchive table...');
        await pool.request().query(`
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
                PRINT 'Created table: LeaveBalancesArchive';
            END
        `);
        console.log('   ✅ LeaveBalancesArchive table ready');

        // 6. Create LeaveRequestsArchive table
        console.log('6. Creating LeaveRequestsArchive table...');
        await pool.request().query(`
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
                PRINT 'Created table: LeaveRequestsArchive';
            END
        `);
        console.log('   ✅ LeaveRequestsArchive table ready');

        // 7. Create indexes
        console.log('7. Creating indexes...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_AdStatus' AND object_id = OBJECT_ID('Users'))
                CREATE INDEX IX_Users_AdStatus ON Users(adStatus);
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_DeletedAt' AND object_id = OBJECT_ID('Users'))
                CREATE INDEX IX_Users_DeletedAt ON Users(deletedAt);
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UsersArchive_EmployeeId' AND object_id = OBJECT_ID('UsersArchive'))
                CREATE INDEX IX_UsersArchive_EmployeeId ON UsersArchive(employeeId);
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_UsersArchive_ArchivedAt' AND object_id = OBJECT_ID('UsersArchive'))
                CREATE INDEX IX_UsersArchive_ArchivedAt ON UsersArchive(archivedAt);
        `);
        console.log('   ✅ Indexes created');

        console.log('\n✅ AD Lifecycle Migration Completed Successfully!\n');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await closeConnection();
    }
}

runMigration().catch(console.error);
