/**
 * Create Organization Script
 * 
 * Helper script to create a new organization.
 * 
 * Usage:
 *   tsx scripts/create-organization.ts --name "Acme Mining" --subdomain acme
 *   tsx scripts/create-organization.ts --name "Test Org" --subdomain test --api-key test-key-123
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

interface CreateOrgOptions {
  name: string;
  subdomain?: string;
  apiKey?: string;
  isActive?: boolean;
}

async function createOrganization(options: CreateOrgOptions) {
  console.log('Creating organization...\n');

  try {
    // Validate inputs
    if (!options.name) {
      throw new Error('Organization name is required');
    }

    // Generate API key if not provided
    const apiKey = options.apiKey || `api-${randomBytes(16).toString('hex')}`;

    // Check for conflicts
    if (options.subdomain) {
      const existing = await prisma.organization.findUnique({
        where: { subdomain: options.subdomain },
      });
      if (existing) {
        throw new Error(`Subdomain "${options.subdomain}" already exists`);
      }
    }

    const existingApiKey = await prisma.organization.findUnique({
      where: { apiKey },
    });
    if (existingApiKey) {
      throw new Error(`API key already exists`);
    }

    // Create organization
    const org = await prisma.organization.create({
      data: {
        name: options.name,
        subdomain: options.subdomain || null,
        apiKey,
        isActive: options.isActive !== false,
      },
    });

    console.log('✅ Organization created successfully!\n');
    console.log('Organization Details:');
    console.log(`  ID: ${org.id}`);
    console.log(`  Name: ${org.name}`);
    console.log(`  Subdomain: ${org.subdomain || '(none)'}`);
    console.log(`  API Key: ${org.apiKey}`);
    console.log(`  Active: ${org.isActive}`);
    console.log(`  Created: ${org.createdAt.toISOString()}\n`);

    console.log('Usage Examples:');
    console.log(`  # With X-Org-Id header:`);
    console.log(`  curl -H "X-Org-Id: ${org.id}" http://localhost:3000/api/items\n`);
    
    if (org.subdomain) {
      console.log(`  # With subdomain:`);
      console.log(`  curl http://${org.subdomain}.localhost:3000/api/items\n`);
    }
    
    console.log(`  # With API key:`);
    console.log(`  curl -H "X-API-Key: ${org.apiKey}" http://localhost:3000/api/items\n`);

    return org;
  } catch (error: any) {
    console.error('❌ Error creating organization:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs(): CreateOrgOptions {
  const args = process.argv.slice(2);
  const options: CreateOrgOptions = {
    name: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--name' || arg === '-n') {
      options.name = next;
      i++;
    } else if (arg === '--subdomain' || arg === '-s') {
      options.subdomain = next;
      i++;
    } else if (arg === '--api-key' || arg === '-k') {
      options.apiKey = next;
      i++;
    } else if (arg === '--inactive') {
      options.isActive = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx scripts/create-organization.ts [options]

Options:
  --name, -n <name>        Organization name (required)
  --subdomain, -s <domain> Subdomain for routing (optional)
  --api-key, -k <key>      API key (optional, auto-generated if not provided)
  --inactive               Create as inactive organization
  --help, -h               Show this help message

Examples:
  tsx scripts/create-organization.ts --name "Acme Mining" --subdomain acme
  tsx scripts/create-organization.ts --name "Test Org" --subdomain test --api-key test-key-123
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run if executed directly
if (require.main === module) {
  const options = parseArgs();

  if (!options.name) {
    console.error('❌ Error: Organization name is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  createOrganization(options)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

export { createOrganization };

