/**
 * Assign Users to Organization Script
 * 
 * Assigns existing users to an organization.
 * Useful for migrating existing users after organization migration.
 * 
 * Usage:
 *   tsx scripts/assign-users-to-org.ts --org-id org-123 --email-pattern "@acme.com"
 *   tsx scripts/assign-users-to-org.ts --org-id org-123 --user-id user-123
 *   tsx scripts/assign-users-to-org.ts --org-id org-123 --all
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AssignOptions {
  orgId: string;
  userId?: string;
  emailPattern?: string;
  all?: boolean;
  dryRun?: boolean;
}

async function assignUsersToOrg(options: AssignOptions) {
  console.log('Assigning users to organization...\n');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: options.orgId },
    });

    if (!org) {
      throw new Error(`Organization ${options.orgId} not found`);
    }

    console.log(`Organization: ${org.name} (${org.id})\n`);

    // Find users to assign
    let users;
    let criteria: string;

    if (options.userId) {
      users = await prisma.user.findMany({
        where: { id: options.userId },
      });
      criteria = `user ID: ${options.userId}`;
    } else if (options.emailPattern) {
      users = await prisma.user.findMany({
        where: {
          email: {
            contains: options.emailPattern,
          },
        },
      });
      criteria = `email pattern: *${options.emailPattern}*`;
    } else if (options.all) {
      users = await prisma.user.findMany({
        where: {
          OR: [
            { orgId: null },
            { orgId: { not: options.orgId } },
          ],
        },
      });
      criteria = 'all users without org or with different org';
    } else {
      throw new Error('Must specify --user-id, --email-pattern, or --all');
    }

    console.log(`Found ${users.length} user(s) matching: ${criteria}\n`);

    if (users.length === 0) {
      console.log('No users to assign.');
      return;
    }

    // Show users that will be assigned
    console.log('Users to assign:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (${user.id}) - Current org: ${user.orgId || 'none'}`);
    });
    console.log('');

    if (options.dryRun) {
      console.log('✅ Dry run complete. Use without --dry-run to apply changes.');
      return;
    }

    // Confirm
    console.log(`⚠️  This will assign ${users.length} user(s) to organization ${org.name}`);
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Assign users
    let assigned = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        if (user.orgId === options.orgId) {
          console.log(`⏭️  Skipping ${user.email} - already assigned to this org`);
          skipped++;
          continue;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { orgId: options.orgId },
        });

        console.log(`✅ Assigned ${user.email} to ${org.name}`);
        assigned++;
      } catch (error: any) {
        console.error(`❌ Error assigning ${user.email}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Assignment Summary:');
    console.log(`  Assigned: ${assigned}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log('='.repeat(50) + '\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs(): AssignOptions {
  const args = process.argv.slice(2);
  const options: AssignOptions = {
    orgId: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--org-id' || arg === '-o') {
      options.orgId = next;
      i++;
    } else if (arg === '--user-id' || arg === '-u') {
      options.userId = next;
      i++;
    } else if (arg === '--email-pattern' || arg === '-e') {
      options.emailPattern = next;
      i++;
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx scripts/assign-users-to-org.ts [options]

Options:
  --org-id, -o <id>        Organization ID (required)
  --user-id, -u <id>       Assign specific user by ID
  --email-pattern, -e <pattern>  Assign users matching email pattern
  --all, -a                Assign all users without org
  --dry-run, -d            Show what would be done without making changes
  --help, -h               Show this help message

Examples:
  # Assign user by ID
  tsx scripts/assign-users-to-org.ts --org-id org-123 --user-id user-456

  # Assign users by email pattern
  tsx scripts/assign-users-to-org.ts --org-id org-123 --email-pattern "@acme.com"

  # Assign all unassigned users
  tsx scripts/assign-users-to-org.ts --org-id org-123 --all

  # Dry run to see what would happen
  tsx scripts/assign-users-to-org.ts --org-id org-123 --email-pattern "@acme.com" --dry-run
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run if executed directly
if (require.main === module) {
  const options = parseArgs();

  if (!options.orgId) {
    console.error('❌ Error: Organization ID is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  if (!options.userId && !options.emailPattern && !options.all) {
    console.error('❌ Error: Must specify --user-id, --email-pattern, or --all');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  assignUsersToOrg(options)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

export { assignUsersToOrg };

