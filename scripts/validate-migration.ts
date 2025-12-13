/**
 * Migration Validation Script
 * 
 * Validates that migrations were applied correctly and tenant isolation is working.
 * 
 * Usage:
 *   tsx scripts/validate-migration.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

async function validateMigration(): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    errors: [],
    warnings: [],
  };

  console.log('🔍 Validating migration...\n');

  try {
    // 1. Check organizations table exists
    console.log('1. Checking organizations table...');
    try {
      const orgCount = await prisma.organization.count();
      console.log(`   ✅ Organizations table exists (${orgCount} organizations)`);
      
      if (orgCount === 0) {
        result.warnings.push('No organizations found. Create at least one organization.');
      }
    } catch (error: any) {
      result.passed = false;
      result.errors.push('Organizations table does not exist');
      console.log('   ❌ Organizations table missing');
    }

    // 2. Check orgId columns exist
    console.log('\n2. Checking orgId columns...');
    const tablesToCheck = [
      'users',
      'items',
      'locations',
      'inventory_ledger',
      'count_sheets',
      'count_lines',
      'audit_logs',
      'feature_flags',
    ];

    for (const table of tablesToCheck) {
      try {
        const result = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
          SELECT column_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = 'org_id'
        `;

        if (result.length === 0) {
          result.passed = false;
          result.errors.push(`Table ${table} missing org_id column`);
          console.log(`   ❌ ${table}: org_id column missing`);
        } else {
          const isNullable = result[0].is_nullable === 'YES';
          if (isNullable) {
            result.warnings.push(`Table ${table} org_id is nullable (should be NOT NULL after migration)`);
            console.log(`   ⚠️  ${table}: org_id is nullable`);
          } else {
            console.log(`   ✅ ${table}: org_id column exists and is NOT NULL`);
          }
        }
      } catch (error: any) {
        result.passed = false;
        result.errors.push(`Error checking ${table}: ${error.message}`);
        console.log(`   ❌ ${table}: Error - ${error.message}`);
      }
    }

    // 3. Check foreign key constraints
    console.log('\n3. Checking foreign key constraints...');
    const fkResult = await prisma.$queryRaw<Array<{ constraint_name: string; table_name: string }>>`
      SELECT constraint_name, table_name
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%_orgId_fkey'
    `;

    const expectedFks = tablesToCheck.length;
    if (fkResult.length < expectedFks) {
      result.warnings.push(`Expected ${expectedFks} foreign keys, found ${fkResult.length}`);
      console.log(`   ⚠️  Found ${fkResult.length} foreign keys (expected ${expectedFks})`);
    } else {
      console.log(`   ✅ All foreign key constraints exist (${fkResult.length})`);
    }

    // 4. Check data backfill
    console.log('\n4. Checking data backfill...');
    for (const table of tablesToCheck) {
      try {
        const nullCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count
          FROM ${prisma.$queryRawUnsafe(`"${table}"`)}
          WHERE org_id IS NULL
        `;

        const count = Number(nullCount[0]?.count || 0);
        if (count > 0) {
          result.errors.push(`Table ${table} has ${count} records with NULL org_id`);
          result.passed = false;
          console.log(`   ❌ ${table}: ${count} records with NULL org_id`);
        } else {
          const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count
            FROM ${prisma.$queryRawUnsafe(`"${table}"`)}
          `;
          console.log(`   ✅ ${table}: All ${Number(totalCount[0]?.count || 0)} records have org_id`);
        }
      } catch (error: any) {
        result.warnings.push(`Could not check ${table} backfill: ${error.message}`);
        console.log(`   ⚠️  ${table}: Could not verify - ${error.message}`);
      }
    }

    // 5. Check balance table (if migration was run)
    console.log('\n5. Checking balance table...');
    try {
      const balanceCount = await prisma.inventoryBalance.count();
      console.log(`   ✅ Balance table exists (${balanceCount} records)`);
      
      // Check trigger exists
      const triggerResult = await prisma.$queryRaw<Array<{ tgname: string }>>`
        SELECT tgname
        FROM pg_trigger
        WHERE tgname = 'inventory_ledger_balance_trigger'
      `;

      if (triggerResult.length === 0) {
        result.warnings.push('Balance trigger not found. Run trigger.sql migration.');
        console.log('   ⚠️  Balance trigger not found');
      } else {
        console.log('   ✅ Balance trigger exists');
      }
    } catch (error: any) {
      if (error.message.includes('does not exist')) {
        console.log('   ⚠️  Balance table not created yet (run balance migration)');
      } else {
        result.warnings.push(`Balance table check failed: ${error.message}`);
        console.log(`   ⚠️  Balance table: ${error.message}`);
      }
    }

    // 6. Check unique constraints
    console.log('\n6. Checking unique constraints...');
    const uniqueConstraints = [
      { table: 'users', constraint: 'users_orgId_email_key' },
      { table: 'items', constraint: 'items_orgId_itemNumber_key' },
      { table: 'locations', constraint: 'locations_orgId_site_name_key' },
      { table: 'count_sheets', constraint: 'count_sheets_orgId_countNumber_key' },
      { table: 'feature_flags', constraint: 'feature_flags_orgId_key_key' },
    ];

    for (const { table, constraint } of uniqueConstraints) {
      try {
        const result = await prisma.$queryRaw<Array<{ indexname: string }>>`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND indexname = ${constraint}
        `;

        if (result.length === 0) {
          result.warnings.push(`Unique constraint ${constraint} not found`);
          console.log(`   ⚠️  ${table}: Unique constraint missing`);
        } else {
          console.log(`   ✅ ${table}: Unique constraint exists`);
        }
      } catch (error: any) {
        result.warnings.push(`Could not check ${table} constraint: ${error.message}`);
        console.log(`   ⚠️  ${table}: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(50));

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach((error) => console.log(`   - ${error}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      result.warnings.forEach((warning) => console.log(`   - ${warning}`));
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log('\n✅ All checks passed! Migration is valid.');
    } else if (result.errors.length === 0) {
      console.log('\n✅ Migration is valid (with warnings).');
    } else {
      console.log('\n❌ Migration validation failed. Please fix errors above.');
    }

    return result;
  } catch (error: any) {
    console.error('\n❌ Validation error:', error);
    result.passed = false;
    result.errors.push(`Validation failed: ${error.message}`);
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  validateMigration()
    .then((result) => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { validateMigration };

