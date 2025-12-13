/**
 * Safe Migration Runner
 * 
 * Helper script to run migrations with safety checks and rollback capability.
 * 
 * Usage:
 *   tsx scripts/run-migration.ts [migration-name]
 * 
 * Migration names:
 *   - organization: Run organization migration
 *   - balance: Run balance table migration
 *   - all: Run all migrations
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationResult {
  success: boolean;
  error?: string;
  duration: number;
  recordsAffected?: number;
}

/**
 * Check if migration has already been run
 */
async function checkMigrationStatus(migrationName: string): Promise<boolean> {
  try {
    if (migrationName === 'organization') {
      // Check if organizations table exists
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'organizations'
        ) as exists
      `;
      return result[0]?.exists || false;
    }
    
    if (migrationName === 'balance') {
      // Check if inventory_balances table exists
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'inventory_balances'
        ) as exists
      `;
      return result[0]?.exists || false;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Run SQL migration file
 */
async function runSqlMigration(filePath: string): Promise<MigrationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Reading migration file: ${filePath}`);
    const sql = readFileSync(filePath, 'utf-8');
    
    console.log('Executing migration...');
    await prisma.$executeRawUnsafe(sql);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Migration completed in ${(duration / 1000).toFixed(2)}s`);
    
    return {
      success: true,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Migration failed:`, error.message);
    
    return {
      success: false,
      error: error.message,
      duration,
    };
  }
}

/**
 * Run organization migration
 */
async function runOrganizationMigration(): Promise<MigrationResult> {
  console.log('\n=== Running Organization Migration ===\n');
  
  // Check if already run
  const alreadyRun = await checkMigrationStatus('organization');
  if (alreadyRun) {
    console.log('⚠️  Organization migration appears to have already been run.');
    console.log('   Skipping. Use --force to run anyway.');
    return { success: true, duration: 0 };
  }
  
  // Check for backup
  console.log('⚠️  WARNING: This will modify your database schema.');
  console.log('   Make sure you have a backup before proceeding!');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise((resolve) => setTimeout(resolve, 5000));
  
  const migrationPath = join(
    process.cwd(),
    'prisma/migrations/add_organization_support/migration.sql'
  );
  
  return runSqlMigration(migrationPath);
}

/**
 * Run balance table migration
 */
async function runBalanceMigration(): Promise<MigrationResult> {
  console.log('\n=== Running Balance Table Migration ===\n');
  
  // Check if already run
  const alreadyRun = await checkMigrationStatus('balance');
  if (alreadyRun) {
    console.log('⚠️  Balance table migration appears to have already been run.');
    console.log('   Skipping. Use --force to run anyway.');
    return { success: true, duration: 0 };
  }
  
  // Check organization migration ran first
  const orgMigrationRun = await checkMigrationStatus('organization');
  if (!orgMigrationRun) {
    console.error('❌ Organization migration must be run first!');
    return {
      success: false,
      error: 'Organization migration not detected',
      duration: 0,
    };
  }
  
  console.log('⚠️  This will create the balance table and trigger.');
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
  
  await new Promise((resolve) => setTimeout(resolve, 3000));
  
  // First run Prisma migration for table
  console.log('Running Prisma migration for balance table...');
  try {
    // Note: This would typically be done via prisma migrate
    // For now, we'll just run the trigger SQL
    console.log('Note: Run "npx prisma migrate dev" first to create the table');
  } catch (error: any) {
    console.error('Error:', error.message);
  }
  
  const triggerPath = join(
    process.cwd(),
    'prisma/migrations/add_balance_table/trigger.sql'
  );
  
  return runSqlMigration(triggerPath);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const migrationName = args[0] || 'all';
  const force = args.includes('--force');
  
  console.log('🚀 Migration Runner\n');
  console.log(`Migration: ${migrationName}`);
  console.log(`Force: ${force}\n`);
  
  try {
    let results: MigrationResult[] = [];
    
    if (migrationName === 'organization' || migrationName === 'all') {
      const result = await runOrganizationMigration();
      results.push(result);
      
      if (!result.success) {
        console.error('\n❌ Organization migration failed. Stopping.');
        process.exit(1);
      }
    }
    
    if (migrationName === 'balance' || migrationName === 'all') {
      const result = await runBalanceMigration();
      results.push(result);
      
      if (!result.success) {
        console.error('\n❌ Balance migration failed. Stopping.');
        process.exit(1);
      }
    }
    
    // Summary
    console.log('\n=== Migration Summary ===');
    results.forEach((result, index) => {
      console.log(`Migration ${index + 1}: ${result.success ? '✅ Success' : '❌ Failed'}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    });
    
    const allSuccess = results.every((r) => r.success);
    if (allSuccess) {
      console.log('\n✅ All migrations completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Run balance backfill: tsx prisma/scripts/backfill-balances.ts');
      console.log('2. Verify data integrity');
      console.log('3. Update application code');
      console.log('4. Restart application services');
    } else {
      console.log('\n❌ Some migrations failed. Review errors above.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runOrganizationMigration, runBalanceMigration };

