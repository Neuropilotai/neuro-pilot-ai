/**
 * List Organizations Script
 * 
 * Lists all organizations in the database.
 * 
 * Usage:
 *   tsx scripts/list-organizations.ts
 *   tsx scripts/list-organizations.ts --active-only
 *   tsx scripts/list-organizations.ts --format json
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ListOptions {
  activeOnly?: boolean;
  format?: 'table' | 'json';
}

async function listOrganizations(options: ListOptions = {}) {
  try {
    const where = options.activeOnly ? { isActive: true } : {};

    const organizations = await prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            items: true,
            locations: true,
            ledgerEntries: true,
          },
        },
      },
    });

    if (options.format === 'json') {
      console.log(JSON.stringify(organizations, null, 2));
      return;
    }

    // Table format
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Organizations (${organizations.length} total)`);
    console.log('='.repeat(80) + '\n');

    if (organizations.length === 0) {
      console.log('No organizations found.');
      if (options.activeOnly) {
        console.log('(Use without --active-only to see all organizations)');
      }
      return;
    }

    organizations.forEach((org, index) => {
      console.log(`${index + 1}. ${org.name}`);
      console.log(`   ID: ${org.id}`);
      console.log(`   Subdomain: ${org.subdomain || '(none)'}`);
      console.log(`   API Key: ${org.apiKey ? `${org.apiKey.substring(0, 20)}...` : '(none)'}`);
      console.log(`   Status: ${org.isActive ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   Created: ${org.createdAt.toISOString()}`);
      console.log(`   Stats: ${org._count.users} users, ${org._count.items} items, ${org._count.locations} locations, ${org._count.ledgerEntries} ledger entries`);
      console.log('');
    });

    // Summary
    const activeCount = organizations.filter((o) => o.isActive).length;
    const inactiveCount = organizations.length - activeCount;
    const totalUsers = organizations.reduce((sum, o) => sum + o._count.users, 0);
    const totalItems = organizations.reduce((sum, o) => sum + o._count.items, 0);

    console.log('='.repeat(80));
    console.log('Summary:');
    console.log(`  Total: ${organizations.length}`);
    console.log(`  Active: ${activeCount}`);
    console.log(`  Inactive: ${inactiveCount}`);
    console.log(`  Total Users: ${totalUsers}`);
    console.log(`  Total Items: ${totalItems}`);
    console.log('='.repeat(80) + '\n');
  } catch (error: any) {
    console.error('❌ Error listing organizations:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs(): ListOptions {
  const args = process.argv.slice(2);
  const options: ListOptions = {};

  for (const arg of args) {
    if (arg === '--active-only' || arg === '-a') {
      options.activeOnly = true;
    } else if (arg === '--format' || arg === '-f') {
      const formatIndex = args.indexOf(arg);
      options.format = (args[formatIndex + 1] as 'table' | 'json') || 'table';
    } else if (arg === '--json' || arg === '-j') {
      options.format = 'json';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx scripts/list-organizations.ts [options]

Options:
  --active-only, -a        Show only active organizations
  --format, -f <format>   Output format: table or json
  --json, -j               Output as JSON
  --help, -h               Show this help message

Examples:
  tsx scripts/list-organizations.ts
  tsx scripts/list-organizations.ts --active-only
  tsx scripts/list-organizations.ts --format json
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run if executed directly
if (require.main === module) {
  const options = parseArgs();

  listOrganizations(options)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

export { listOrganizations };

