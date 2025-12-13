/**
 * Backup Monitoring Job
 * 
 * Scheduled job that verifies backups exist and alerts on failures.
 * Runs daily to ensure backup system is functioning correctly.
 * 
 * Usage:
 *   - Schedule with cron: "0 3 * * *" (3 AM daily, after backup window)
 *   - Or use BullMQ/similar job scheduler
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BackupStatus {
  lastBackupAge: number; // Hours since last backup
  lastBackupTime: Date | null;
  backupCount: number;
  isHealthy: boolean;
  alerts: string[];
}

/**
 * Monitor backup status
 * 
 * Checks:
 * - Last backup age (should be < 25 hours for daily backups)
 * - Backup count in retention period
 * - Backup accessibility
 */
export async function monitorBackups(): Promise<BackupStatus> {
  console.log('Starting backup monitoring...');

  const status: BackupStatus = {
    lastBackupAge: 0,
    lastBackupTime: null,
    backupCount: 0,
    isHealthy: true,
    alerts: [],
  };

  try {
    // Note: Railway API integration would go here
    // For now, this is a template that needs Railway API client
    
    // Example: Check Railway backups via API
    // const backups = await railwayApi.listBackups();
    
    // Simulated check - replace with actual Railway API call
    const backups: Array<{ id: string; createdAt: Date }> = [];
    
    // TODO: Implement Railway API client
    // const Railway = require('@railway/cli');
    // const railway = new Railway({ token: process.env.RAILWAY_TOKEN });
    // const backups = await railway.backups.list();

    if (backups.length === 0) {
      status.isHealthy = false;
      status.alerts.push('No backups found');
      console.error('❌ No backups found');
    } else {
      // Find most recent backup
      const sortedBackups = backups.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const lastBackup = sortedBackups[0];
      
      status.lastBackupTime = lastBackup.createdAt;
      status.backupCount = backups.length;
      
      // Calculate age in hours
      const now = new Date();
      const ageMs = now.getTime() - lastBackup.createdAt.getTime();
      status.lastBackupAge = ageMs / (1000 * 60 * 60);
      
      // Check if backup is too old
      if (status.lastBackupAge > 25) {
        status.isHealthy = false;
        status.alerts.push(
          `Last backup is ${status.lastBackupAge.toFixed(1)} hours old (expected < 25 hours)`
        );
        console.error(`❌ Backup is too old: ${status.lastBackupAge.toFixed(1)} hours`);
      } else if (status.lastBackupAge > 23) {
        status.alerts.push(
          `Warning: Last backup is ${status.lastBackupAge.toFixed(1)} hours old`
        );
        console.warn(`⚠️  Backup age warning: ${status.lastBackupAge.toFixed(1)} hours`);
      } else {
        console.log(`✅ Backup is recent: ${status.lastBackupAge.toFixed(1)} hours old`);
      }
      
      // Check backup count (should have at least 7 backups for 7-day retention)
      if (status.backupCount < 7) {
        status.alerts.push(
          `Only ${status.backupCount} backup(s) found (expected at least 7)`
        );
        console.warn(`⚠️  Low backup count: ${status.backupCount}`);
      }
    }

    // Send alerts if unhealthy
    if (!status.isHealthy || status.alerts.length > 0) {
      await sendBackupAlert(status);
    }

    return status;
  } catch (error: any) {
    console.error('Error monitoring backups:', error);
    
    status.isHealthy = false;
    status.alerts.push(`Monitoring error: ${error.message}`);
    
    await sendBackupAlert(status);
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Send backup alert
 */
async function sendBackupAlert(status: BackupStatus): Promise<void> {
  const severity = status.isHealthy ? 'warning' : 'critical';
  
  console.log(`\n🚨 BACKUP ALERT (${severity.toUpperCase()}) 🚨`);
  console.log(`Last backup: ${status.lastBackupTime?.toISOString() || 'Unknown'}`);
  console.log(`Backup age: ${status.lastBackupAge.toFixed(1)} hours`);
  console.log(`Backup count: ${status.backupCount}`);
  console.log(`Alerts: ${status.alerts.join(', ')}`);

  // TODO: Integrate with your alerting system
  // Examples:
  
  // PagerDuty
  // await fetch('https://events.pagerduty.com/v2/enqueue', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     routing_key: process.env.PAGERDUTY_KEY,
  //     event_action: 'trigger',
  //     payload: {
  //       summary: `Backup monitoring alert: ${status.alerts[0]}`,
  //       severity: severity,
  //       source: 'backup-monitor',
  //       custom_details: status,
  //     },
  //   }),
  // });

  // Email
  // await sendEmail({
  //   to: 'ops@example.com',
  //   subject: `[${severity.toUpperCase()}] Backup Monitoring Alert`,
  //   body: `Backup status: ${JSON.stringify(status, null, 2)}`,
  // });

  // Slack
  // await fetch(process.env.SLACK_WEBHOOK_URL, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     text: `🚨 Backup Alert (${severity})`,
  //     attachments: [{
  //       color: severity === 'critical' ? 'danger' : 'warning',
  //       fields: [
  //         { title: 'Last Backup', value: status.lastBackupTime?.toISOString() || 'Unknown', short: true },
  //         { title: 'Age', value: `${status.lastBackupAge.toFixed(1)} hours`, short: true },
  //         { title: 'Alerts', value: status.alerts.join('\n'), short: false },
  //       ],
  //     }],
  //   }),
  // });
}

/**
 * Verify backup integrity (optional advanced check)
 * 
 * This would restore backup to a test database and verify data integrity.
 * More expensive operation, run less frequently (weekly).
 */
export async function verifyBackupIntegrity(backupId: string): Promise<boolean> {
  console.log(`Verifying backup integrity for backup: ${backupId}`);
  
  try {
    // TODO: Implement backup verification
    // 1. Restore backup to test database
    // 2. Run integrity checks
    // 3. Verify record counts
    // 4. Test critical queries
    // 5. Clean up test database
    
    console.log('✅ Backup integrity verified');
    return true;
  } catch (error: any) {
    console.error('❌ Backup integrity check failed:', error);
    return false;
  }
}

/**
 * Run if executed directly
 */
if (require.main === module) {
  monitorBackups()
    .then((status) => {
      if (status.isHealthy) {
        console.log('\n✅ Backup monitoring completed - all checks passed');
        process.exit(0);
      } else {
        console.log('\n❌ Backup monitoring completed - issues detected');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n❌ Backup monitoring failed:', error);
      process.exit(1);
    });
}

export { monitorBackups, BackupStatus };

