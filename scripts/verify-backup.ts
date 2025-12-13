/**
 * Backup Verification Script
 * 
 * Verifies that backups exist and are accessible.
 * Can be run manually or as part of monitoring.
 * 
 * Usage:
 *   tsx scripts/verify-backup.ts
 */

import { monitorBackups } from '../apps/api/src/jobs/backup-monitor';

async function main() {
  console.log('Verifying backups...\n');
  
  try {
    const status = await monitorBackups();
    
    console.log('\n=== Backup Status ===');
    console.log(`Last backup: ${status.lastBackupTime?.toISOString() || 'Unknown'}`);
    console.log(`Backup age: ${status.lastBackupAge.toFixed(1)} hours`);
    console.log(`Backup count: ${status.backupCount}`);
    console.log(`Status: ${status.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    if (status.alerts.length > 0) {
      console.log('\nAlerts:');
      status.alerts.forEach((alert) => console.log(`  - ${alert}`));
    }
    
    process.exit(status.isHealthy ? 0 : 1);
  } catch (error: any) {
    console.error('Error verifying backups:', error);
    process.exit(1);
  }
}

main();

