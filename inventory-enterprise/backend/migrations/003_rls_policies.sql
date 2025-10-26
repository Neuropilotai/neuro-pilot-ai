-- ============================================================================
-- NeuroPilot Inventory - Row-Level Security Policies
-- Version: 003 (RLS + Session Variables)
-- Run with: psql "$DATABASE_URL" -f migrations/003_rls_policies.sql
-- ============================================================================

-- ============================================================================
-- Enable Row-Level Security
-- ============================================================================

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line ENABLE ROW LEVEL SECURITY;

-- location and item tables are reference data (no RLS needed - all users can read)

-- ============================================================================
-- Session Variables Setup
-- ============================================================================

/*
The Express server sets these variables per-request in withDb() function:
  - SET LOCAL app.role = 'admin|manager|counter|viewer'
  - SET LOCAL app.user_id = '<uuid>'

RLS policies use current_setting('app.role', true) to enforce access control.
*/

-- ============================================================================
-- app_user Table Policies
-- ============================================================================

-- Users can read themselves; admins can read all
DROP POLICY IF EXISTS p_app_user_self_read ON app_user;
CREATE POLICY p_app_user_self_read ON app_user
  FOR SELECT
  USING (
    current_setting('app.role', true) = 'admin'
    OR id::text = current_setting('app.user_id', true)
  );

COMMENT ON POLICY p_app_user_self_read ON app_user IS 'Users can read their own record; admins can read all';

-- ============================================================================
-- inventory_count Table Policies
-- ============================================================================

-- All authenticated users can read counts
DROP POLICY IF EXISTS p_inv_read ON inventory_count;
CREATE POLICY p_inv_read ON inventory_count
  FOR SELECT
  USING (
    current_setting('app.role', true) IN ('viewer','counter','manager','admin')
  );

-- Counter/manager/admin can create counts
DROP POLICY IF EXISTS p_inv_insert ON inventory_count;
CREATE POLICY p_inv_insert ON inventory_count
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('counter','manager','admin')
  );

-- Manager/admin can update counts
DROP POLICY IF EXISTS p_inv_update ON inventory_count;
CREATE POLICY p_inv_update ON inventory_count
  FOR UPDATE
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  );

-- Manager/admin can delete counts
DROP POLICY IF EXISTS p_inv_delete ON inventory_count;
CREATE POLICY p_inv_delete ON inventory_count
  FOR DELETE
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  );

COMMENT ON POLICY p_inv_read ON inventory_count IS 'All users can read inventory counts';
COMMENT ON POLICY p_inv_insert ON inventory_count IS 'Counter+ can create new counts';
COMMENT ON POLICY p_inv_update ON inventory_count IS 'Manager+ can update existing counts';
COMMENT ON POLICY p_inv_delete ON inventory_count IS 'Manager+ can delete counts';

-- ============================================================================
-- movement Table Policies
-- ============================================================================

-- All authenticated users can read movements
DROP POLICY IF EXISTS p_mov_read ON movement;
CREATE POLICY p_mov_read ON movement
  FOR SELECT
  USING (
    current_setting('app.role', true) IN ('viewer','counter','manager','admin')
  );

-- Counter/manager/admin can create movements
DROP POLICY IF EXISTS p_mov_insert ON movement;
CREATE POLICY p_mov_insert ON movement
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('counter','manager','admin')
  );

-- Manager/admin can update movements
DROP POLICY IF EXISTS p_mov_update ON movement;
CREATE POLICY p_mov_update ON movement
  FOR UPDATE
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  );

-- Manager/admin can delete movements (rare)
DROP POLICY IF EXISTS p_mov_delete ON movement;
CREATE POLICY p_mov_delete ON movement
  FOR DELETE
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  );

COMMENT ON POLICY p_mov_read ON movement IS 'All users can read stock movements';
COMMENT ON POLICY p_mov_insert ON movement IS 'Counter+ can record movements';
COMMENT ON POLICY p_mov_update ON movement IS 'Manager+ can update movements';
COMMENT ON POLICY p_mov_delete ON movement IS 'Manager+ can delete movements';

-- ============================================================================
-- purchase_order Table Policies
-- ============================================================================

-- All authenticated users can read purchase orders
DROP POLICY IF EXISTS p_po_read ON purchase_order;
CREATE POLICY p_po_read ON purchase_order
  FOR SELECT
  USING (
    current_setting('app.role', true) IN ('viewer','counter','manager','admin')
  );

-- Manager/admin can create/update/delete purchase orders
DROP POLICY IF EXISTS p_po_write ON purchase_order;
CREATE POLICY p_po_write ON purchase_order
  FOR ALL
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  )
  WITH CHECK (
    current_setting('app.role', true) IN ('manager','admin')
  );

COMMENT ON POLICY p_po_read ON purchase_order IS 'All users can read purchase orders';
COMMENT ON POLICY p_po_write ON purchase_order IS 'Manager+ can create/update/delete purchase orders';

-- ============================================================================
-- purchase_order_line Table Policies
-- ============================================================================

-- All authenticated users can read PO lines
DROP POLICY IF EXISTS p_pol_read ON purchase_order_line;
CREATE POLICY p_pol_read ON purchase_order_line
  FOR SELECT
  USING (
    current_setting('app.role', true) IN ('viewer','counter','manager','admin')
  );

-- Manager/admin can create/update/delete PO lines
DROP POLICY IF EXISTS p_pol_write ON purchase_order_line;
CREATE POLICY p_pol_write ON purchase_order_line
  FOR ALL
  USING (
    current_setting('app.role', true) IN ('manager','admin')
  )
  WITH CHECK (
    current_setting('app.role', true) IN ('manager','admin')
  );

COMMENT ON POLICY p_pol_read ON purchase_order_line IS 'All users can read PO line items';
COMMENT ON POLICY p_pol_write ON purchase_order_line IS 'Manager+ can create/update/delete PO lines';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  policy_count int;
  rls_enabled_count int;
BEGIN
  -- Count RLS policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Count tables with RLS enabled
  SELECT COUNT(*) INTO rls_enabled_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = true;

  RAISE NOTICE '✅ RLS enabled on % tables', rls_enabled_count;
  RAISE NOTICE '✅ Created % RLS policies', policy_count;

  IF policy_count < 12 THEN
    RAISE WARNING '⚠️  Expected at least 12 policies, found %', policy_count;
  END IF;
END $$;

-- ============================================================================
-- Testing RLS Policies
-- ============================================================================

/*
Test RLS policies with different roles:

-- As viewer (read-only):
BEGIN;
SET LOCAL app.role = 'viewer';
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000001';
SELECT * FROM inventory_count;  -- ✅ Should work
INSERT INTO inventory_count (item_id, location_id, qty_on_hand)
  VALUES ('...', '...', 10);  -- ❌ Should fail
ROLLBACK;

-- As counter (can count):
BEGIN;
SET LOCAL app.role = 'counter';
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000002';
SELECT * FROM inventory_count;  -- ✅ Should work
INSERT INTO inventory_count (item_id, location_id, qty_on_hand)
  VALUES ('...', '...', 10);  -- ✅ Should work
UPDATE inventory_count SET qty_on_hand = 20;  -- ❌ Should fail
ROLLBACK;

-- As manager (full access):
BEGIN;
SET LOCAL app.role = 'manager';
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000003';
SELECT * FROM inventory_count;  -- ✅ Should work
INSERT INTO inventory_count (item_id, location_id, qty_on_hand)
  VALUES ('...', '...', 10);  -- ✅ Should work
UPDATE inventory_count SET qty_on_hand = 20;  -- ✅ Should work
DELETE FROM inventory_count WHERE id = '...';  -- ✅ Should work
ROLLBACK;
*/

-- ============================================================================
-- Important Notes
-- ============================================================================

/*
Role Hierarchy:
  - viewer:  READ-ONLY (all tables)
  - counter: READ + CREATE (inventory_count, movement)
  - manager: READ + CREATE + UPDATE + DELETE (all tables except app_user)
  - admin:   FULL ACCESS (all tables)

Session Variables:
  - Set by Express server in withDb() function
  - Must be set with SET LOCAL (transaction-scoped)
  - Never set by client directly (security risk)

Future Enhancements:
  - Multi-tenancy: Add tenant_id to RLS policies
  - Time-based access: Add time windows for count modifications
  - Audit trail: Trigger to log all policy violations
*/
