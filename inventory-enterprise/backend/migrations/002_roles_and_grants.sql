-- ============================================================================
-- NeuroPilot Inventory - Database Roles and Grants
-- Version: 002 (Least-Privilege Access)
-- Run with: psql "$DATABASE_URL" -f migrations/002_roles_and_grants.sql
-- ============================================================================

-- ============================================================================
-- Create Database Roles
-- ============================================================================

DO $$
BEGIN
  -- Migration user (DDL operations)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator_user') THEN
    CREATE ROLE migrator_user LOGIN PASSWORD 'REPLACE_ME_STRONG_MIGRATOR_PASSWORD';
    RAISE NOTICE '✅ Created role: migrator_user';
  ELSE
    RAISE NOTICE 'ℹ️  Role already exists: migrator_user';
  END IF;

  -- Application data access role (DML operations)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user_role') THEN
    CREATE ROLE app_user_role NOINHERIT;
    RAISE NOTICE '✅ Created role: app_user_role';
  ELSE
    RAISE NOTICE 'ℹ️  Role already exists: app_user_role';
  END IF;

  -- Application login user (used by Express server)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user_login') THEN
    CREATE ROLE app_user_login LOGIN PASSWORD 'REPLACE_ME_STRONG_APP_PASSWORD';
    RAISE NOTICE '✅ Created role: app_user_login';
  ELSE
    RAISE NOTICE 'ℹ️  Role already exists: app_user_login';
  END IF;
END $$;

-- ============================================================================
-- Grant Inheritance
-- ============================================================================

-- app_user_login inherits app_user_role permissions
GRANT app_user_role TO app_user_login;

-- ============================================================================
-- Application Role Grants (DML only)
-- ============================================================================

-- Schema access
GRANT USAGE ON SCHEMA public TO app_user_role;

-- Table access (DML operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user_role;

-- Future tables (for migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user_role;

-- Sequence access (for serial columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user_role;

-- ============================================================================
-- Migrator Role Grants (DDL + DML)
-- ============================================================================

-- Schema management
GRANT USAGE ON SCHEMA public TO migrator_user;
GRANT CREATE, USAGE ON SCHEMA public TO migrator_user;

-- Full table access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrator_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO migrator_user;

-- Full sequence access
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrator_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO migrator_user;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  role_count int;
BEGIN
  SELECT COUNT(*) INTO role_count
  FROM pg_roles
  WHERE rolname IN ('migrator_user', 'app_user_role', 'app_user_login');

  IF role_count = 3 THEN
    RAISE NOTICE '✅ All 3 roles created/verified successfully';
  ELSE
    RAISE EXCEPTION '❌ Expected 3 roles, found %', role_count;
  END IF;
END $$;

-- ============================================================================
-- Important Notes
-- ============================================================================

/*
DATABASE_URL Configuration:

1. For Express server (app_user_login):
   postgresql://app_user_login:STRONG_PASSWORD@host:5432/dbname?sslmode=require

2. For migrations (migrator_user):
   postgresql://migrator_user:STRONG_PASSWORD@host:5432/dbname?sslmode=require

3. Replace passwords:
   ALTER ROLE migrator_user PASSWORD 'your_actual_strong_password';
   ALTER ROLE app_user_login PASSWORD 'your_actual_strong_password';

4. Store passwords securely:
   - Railway environment variables
   - Never commit to git
   - Use secrets management (Railway Secrets, Doppler, etc.)
*/
