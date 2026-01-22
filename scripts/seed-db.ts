import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { sql, getConnection, closeConnection } from '../src/lib/db';

// 1. Load Env FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function seedDatabase() {
    try {
        console.log('🌱 Seeding Database...');
        console.log(`Target Database: ${process.env.DB_NAME}`);

        // Read schema file
        const schemaPath = path.resolve(process.cwd(), 'database/schema.sql');
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

        // Split by GO statements
        const batches = schemaContent
            .split(/^GO\s*$/m) // Split by GO on a separate line
            .map(batch => batch.trim())
            .filter(batch => batch.length > 0);

        const pool = await getConnection();

        for (const batch of batches) {
            // Skip database creation commands as we are connected to the DB
            if (batch.toLowerCase().includes('create database') || batch.toLowerCase().includes('use hrleave')) {
                console.log('Skipping standard DB creation/selection commands...');
                continue;
            }

            try {
                await pool.request().query(batch);
                console.log('✅ Executed batch successfully.');
            } catch (err) {
                // If error is about object already exists, we might want to ignore or log it
                // But since we are likely on a clean DB, let's log it.
                // However, the schema has IF NOT EXISTS checks, so it should be fine.
                console.warn('⚠️  Warning executing batch:', (err as Error).message.split('\n')[0]);
            }
        }

        console.log('🎉 Database seeding completed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();
