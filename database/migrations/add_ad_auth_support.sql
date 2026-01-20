-- ==============================================
-- AD Authentication Migration Script
-- Run this to add AD support columns
-- ==============================================

-- Add AD columns to Users table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'isADUser')
BEGIN
    ALTER TABLE Users ADD isADUser BIT DEFAULT 0;
    PRINT 'Added column: isADUser';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'adUsername')
BEGIN
    ALTER TABLE Users ADD adUsername NVARCHAR(100);
    PRINT 'Added column: adUsername';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'authProvider')
BEGIN
    ALTER TABLE Users ADD authProvider VARCHAR(20) DEFAULT 'LOCAL';
    PRINT 'Added column: authProvider';
END
GO

-- Create SystemSettings table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
    CREATE TABLE SystemSettings (
        [key] VARCHAR(100) PRIMARY KEY,
        [value] NVARCHAR(MAX),
        updatedAt DATETIME DEFAULT GETDATE()
    );
    
    -- Insert default values
    INSERT INTO SystemSettings ([key], [value]) VALUES 
    ('AUTH_MODE', 'LOCAL'),
    ('LDAP_URL', ''),
    ('LDAP_DOMAIN', ''),
    ('LDAP_BASE_DN', ''),
    ('LDAP_BIND_DN', ''),
    ('AZURE_AD_ENABLED', 'false'),
    ('AZURE_AD_TENANT_ID', ''),
    ('AZURE_AD_CLIENT_ID', '');
    
    PRINT 'Created table: SystemSettings with default values';
END
GO

-- Update existing users to have authProvider = 'LOCAL'
UPDATE Users SET authProvider = 'LOCAL' WHERE authProvider IS NULL;
UPDATE Users SET isADUser = 0 WHERE isADUser IS NULL;
GO

PRINT 'Migration completed successfully!';
