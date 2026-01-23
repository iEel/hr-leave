/**
 * Scheduled AD Sync Script
 * 
 * This script can be run by Windows Task Scheduler or Cron
 * to automatically sync AD users on a schedule.
 * 
 * Usage:
 *   npx tsx scripts/scheduled-ad-sync.ts [azure|ldap]
 * 
 * Setup Windows Task Scheduler:
 *   1. Open Task Scheduler
 *   2. Create Basic Task
 *   3. Set trigger (e.g., Daily at 6:00 AM)
 *   4. Action: Start a Program
 *      Program: npx
 *      Arguments: tsx scripts/scheduled-ad-sync.ts azure
 *      Start in: D:\Antigravity\hr-leave
 */

import 'dotenv/config';

const API_URL = process.env.NEXTAUTH_URL || 'http://localhost:3002';
const CRON_SECRET = process.env.CRON_SECRET || 'default-cron-secret-change-me';

async function runSync() {
    const source = process.argv[2] || 'azure';

    console.log('================================================');
    console.log(`🔄 Scheduled AD Sync - ${new Date().toISOString()}`);
    console.log(`   Source: ${source}`);
    console.log(`   API URL: ${API_URL}`);
    console.log('================================================\n');

    try {
        const response = await fetch(`${API_URL}/api/cron/ad-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': CRON_SECRET
            },
            body: JSON.stringify({ source })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Sync completed successfully!\n');
            console.log('Summary:');
            console.log(`   Total found in AD: ${result.summary.totalFound}`);
            console.log(`   Added: ${result.summary.added}`);
            console.log(`   Updated: ${result.summary.updated}`);
            console.log(`   Marked deleted: ${result.summary.markedDeleted}`);
        } else {
            console.error('❌ Sync failed:', result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error calling sync API:', error);
        process.exit(1);
    }

    console.log('\n================================================');
    console.log('   Sync completed at', new Date().toISOString());
    console.log('================================================');
}

runSync();
