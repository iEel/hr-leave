import dotenv from 'dotenv';
import path from 'path';

// 1. Load Env FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function resetPassword() {
    try {
        // Import DB after loading env
        const { execute } = await import('../src/lib/db');
        console.log('Checking ADMIN001 password...');

        // Always reset to ensure it works
        console.log('🔄 Resetting password to "admin123"...');
        const newHash = '$2a$10$rQEcmKwKj0UvY.C.Y7R1B.4n5M0VYsZtqvJVYXhPL3mJU4TZsAb2.'; // admin123

        await execute(
            `UPDATE Users SET password = @password WHERE employeeId = 'ADMIN001'`,
            { password: newHash }
        );

        console.log('✅ Password reset successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

resetPassword();
