-- Migration: Add Organization Support and Multi-Tenant Isolation
-- This migration adds organization support to enable multi-tenant data isolation
-- Strategy: Zero-downtime migration with nullable columns first, then backfill

-- Step 1: Create organizations table
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "apiKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create indexes on organizations
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_subdomain_key" ON "organizations"("subdomain");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_apiKey_key" ON "organizations"("apiKey");
CREATE INDEX IF NOT EXISTS "organizations_subdomain_idx" ON "organizations"("subdomain");
CREATE INDEX IF NOT EXISTS "organizations_apiKey_idx" ON "organizations"("apiKey");

-- Step 3: Create default organization for existing data
-- This will be used to backfill all existing records
-- Use a fixed ID to ensure consistency if migration is run multiple times
INSERT INTO "organizations" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (
  COALESCE(
    (SELECT id FROM "organizations" WHERE "name" = 'Default Organization' LIMIT 1),
    'default-org-' || substr(md5(random()::text || clock_timestamp()::text), 1, 32)
  ),
  'Default Organization',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Store the default org ID for use in backfill
DO $$
DECLARE
    default_org_id TEXT;
BEGIN
    SELECT id INTO default_org_id FROM "organizations" WHERE "name" = 'Default Organization' LIMIT 1;
    
    -- Step 4: Add nullable orgId columns to all tenant-scoped tables
    -- Users table
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "users_orgId_idx" ON "users"("orgId");
    
    -- Items table
    ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "items_orgId_idx" ON "items"("orgId");
    
    -- Locations table
    ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "locations_orgId_idx" ON "locations"("orgId");
    
    -- Inventory ledger table
    ALTER TABLE "inventory_ledger" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "inventory_ledger_orgId_idx" ON "inventory_ledger"("orgId");
    
    -- Count sheets table
    ALTER TABLE "count_sheets" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "count_sheets_orgId_idx" ON "count_sheets"("orgId");
    
    -- Count lines table
    ALTER TABLE "count_lines" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "count_lines_orgId_idx" ON "count_lines"("orgId");
    
    -- Audit logs table
    ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "audit_logs_orgId_idx" ON "audit_logs"("orgId");
    
    -- Feature flags table
    ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
    CREATE INDEX IF NOT EXISTS "feature_flags_orgId_idx" ON "feature_flags"("orgId");
    
    -- Step 5: Backfill orgId with default org for all existing records
    UPDATE "users" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "items" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "locations" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "inventory_ledger" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "count_sheets" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "count_lines" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "audit_logs" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    UPDATE "feature_flags" SET "orgId" = default_org_id WHERE "orgId" IS NULL;
    
    -- Step 6: Make orgId NOT NULL (after backfill)
    ALTER TABLE "users" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "items" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "locations" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "inventory_ledger" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "count_sheets" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "count_lines" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "audit_logs" ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "feature_flags" ALTER COLUMN "orgId" SET NOT NULL;
    
    -- Step 7: Add foreign key constraints
    ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "items" ADD CONSTRAINT "items_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "locations" ADD CONSTRAINT "locations_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "count_sheets" ADD CONSTRAINT "count_sheets_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_orgId_fkey" 
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
    
    -- Step 8: Update unique constraints to include orgId
    -- Drop old unique constraints
    DROP INDEX IF EXISTS "users_email_key";
    DROP INDEX IF EXISTS "items_itemNumber_key";
    DROP INDEX IF EXISTS "locations_site_name_key";
    DROP INDEX IF EXISTS "count_sheets_countNumber_key";
    DROP INDEX IF EXISTS "feature_flags_key_key";
    
    -- Create new composite unique constraints
    CREATE UNIQUE INDEX "users_orgId_email_key" ON "users"("orgId", "email");
    CREATE UNIQUE INDEX "items_orgId_itemNumber_key" ON "items"("orgId", "itemNumber");
    CREATE UNIQUE INDEX "locations_orgId_site_name_key" ON "locations"("orgId", "site", "name");
    CREATE UNIQUE INDEX "count_sheets_orgId_countNumber_key" ON "count_sheets"("orgId", "countNumber");
    CREATE UNIQUE INDEX "feature_flags_orgId_key_key" ON "feature_flags"("orgId", "key");
END $$;

