-- Migration 014: Fiscal Calendar Schema
-- Implements FY25 and FY26 fiscal year calendar structure
-- Created: 2025-10-11

-- ==============================================
-- 1. FISCAL YEARS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS fiscal_years (
  fiscal_year_id TEXT PRIMARY KEY,           -- 'FY25', 'FY26', etc.
  fiscal_year_number INTEGER NOT NULL,       -- 25, 26, etc.
  start_date TEXT NOT NULL,                  -- '2024-09-01'
  end_date TEXT NOT NULL,                    -- '2025-08-31'
  status TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE, CLOSED, FUTURE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==============================================
-- 2. FISCAL PERIODS (MONTHS)
-- ==============================================
CREATE TABLE IF NOT EXISTS fiscal_periods (
  period_id TEXT PRIMARY KEY,                -- 'FY25-P01', 'FY25-P02', etc.
  fiscal_year_id TEXT NOT NULL,              -- 'FY25'
  period_number INTEGER NOT NULL,            -- 1-12
  period_name TEXT NOT NULL,                 -- 'September', 'October', etc.
  calendar_month INTEGER NOT NULL,           -- 9, 10, 11, etc. (1-12)
  calendar_year INTEGER NOT NULL,            -- 2024, 2025, etc.
  start_date TEXT NOT NULL,                  -- '2024-09-01'
  end_date TEXT NOT NULL,                    -- '2024-09-30'
  status TEXT NOT NULL DEFAULT 'OPEN',       -- OPEN, CLOSED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(fiscal_year_id)
);

-- ==============================================
-- 3. FISCAL WEEKS
-- ==============================================
CREATE TABLE IF NOT EXISTS fiscal_weeks (
  week_id TEXT PRIMARY KEY,                  -- 'FY25-W01', 'FY25-W02', etc.
  fiscal_year_id TEXT NOT NULL,
  period_id TEXT,                            -- Can span multiple periods
  week_number INTEGER NOT NULL,              -- 1-52
  period_number INTEGER,                     -- P1, P2, P3 reference
  cut_number INTEGER,                        -- C1, C2, C3, etc.
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(fiscal_year_id),
  FOREIGN KEY (period_id) REFERENCES fiscal_periods(period_id)
);

-- ==============================================
-- 4. MONTH-END CLOSE SCHEDULE
-- ==============================================
CREATE TABLE IF NOT EXISTS fiscal_month_close_schedule (
  close_schedule_id TEXT PRIMARY KEY,        -- 'FY25-P01-CLOSE'
  period_id TEXT NOT NULL,                   -- 'FY25-P01'
  fiscal_year_id TEXT NOT NULL,
  period_end_date TEXT NOT NULL,             -- Last day of fiscal period

  -- Month-End Close Days
  bd1_date TEXT NOT NULL,                    -- BD+1: Final transmission due
  bd1_deadline TEXT NOT NULL DEFAULT '23:45', -- 11:45 PM ET

  bd2_date TEXT NOT NULL,                    -- BD+2: Adjustments due
  bd2_deadline TEXT NOT NULL DEFAULT '17:00', -- 5:00 PM ET

  bd3_date TEXT NOT NULL,                    -- BD+3: Financial close review
  bd3_deadline TEXT NOT NULL DEFAULT '20:00', -- 8:00 PM ET

  bd4_date TEXT NOT NULL,                    -- BD+4: Analyze results
  bd4_deadline TEXT NOT NULL DEFAULT '14:00', -- 2:00 PM ET

  bd5_date TEXT NOT NULL,                    -- BD+5: Final statements available

  status TEXT NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED, IN_PROGRESS, COMPLETED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (period_id) REFERENCES fiscal_periods(period_id),
  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(fiscal_year_id)
);

-- ==============================================
-- 5. INVENTORY COUNT SCHEDULE
-- ==============================================
CREATE TABLE IF NOT EXISTS inventory_count_schedule (
  count_schedule_id TEXT PRIMARY KEY,        -- 'FY25-P01-COUNT'
  period_id TEXT NOT NULL,                   -- 'FY25-P01'
  fiscal_year_id TEXT NOT NULL,
  count_type TEXT NOT NULL,                  -- 'MONTHLY_WINDOW', 'FULL_PHYSICAL'
  count_window_start TEXT NOT NULL,          -- First day of count window
  count_window_end TEXT NOT NULL,            -- Last day of count window
  transmission_due_date TEXT NOT NULL,       -- BD+1 date
  transmission_deadline TEXT NOT NULL DEFAULT '23:45', -- 11:45 PM ET
  is_required BOOLEAN NOT NULL DEFAULT 1,
  notes TEXT,                                -- Special instructions
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (period_id) REFERENCES fiscal_periods(period_id),
  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(fiscal_year_id)
);

-- ==============================================
-- 6. INDEXES FOR PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_fy ON fiscal_periods(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_fiscal_weeks_fy ON fiscal_weeks(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_weeks_period ON fiscal_weeks(period_id);
CREATE INDEX IF NOT EXISTS idx_close_schedule_period ON fiscal_month_close_schedule(period_id);
CREATE INDEX IF NOT EXISTS idx_count_schedule_period ON inventory_count_schedule(period_id);
CREATE INDEX IF NOT EXISTS idx_count_schedule_dates ON inventory_count_schedule(count_window_start, count_window_end);

-- ==============================================
-- 7. ADD FISCAL PERIOD REFERENCES TO EXISTING TABLES
-- ==============================================

-- Add fiscal period tracking to documents (invoices)
ALTER TABLE documents ADD COLUMN fiscal_year_id TEXT;
ALTER TABLE documents ADD COLUMN fiscal_period_id TEXT;

-- Add fiscal period tracking to inventory counts
ALTER TABLE inventory_counts ADD COLUMN fiscal_year_id TEXT;
ALTER TABLE inventory_counts ADD COLUMN fiscal_period_id TEXT;
ALTER TABLE inventory_counts ADD COLUMN count_schedule_id TEXT;

-- Add fiscal period tracking to operations logs
ALTER TABLE operations_log ADD COLUMN fiscal_year_id TEXT;
ALTER TABLE operations_log ADD COLUMN fiscal_period_id TEXT;

-- Create indexes for fiscal period lookups
CREATE INDEX IF NOT EXISTS idx_documents_fiscal ON documents(fiscal_year_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_counts_fiscal ON inventory_counts(fiscal_year_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_ops_log_fiscal ON operations_log(fiscal_year_id, fiscal_period_id);

-- ==============================================
-- 8. FISCAL CALENDAR VIEWS
-- ==============================================

-- Current Fiscal Period View
CREATE VIEW IF NOT EXISTS v_current_fiscal_period AS
SELECT
  fp.*,
  fy.fiscal_year_number,
  fy.status as fiscal_year_status
FROM fiscal_periods fp
JOIN fiscal_years fy ON fp.fiscal_year_id = fy.fiscal_year_id
WHERE date('now') BETWEEN date(fp.start_date) AND date(fp.end_date)
  AND fy.status = 'ACTIVE';

-- Upcoming Count Schedule View
CREATE VIEW IF NOT EXISTS v_upcoming_count_schedule AS
SELECT
  ics.*,
  fp.period_name,
  fp.calendar_month,
  fp.calendar_year,
  fy.fiscal_year_number,
  CASE
    WHEN date('now') BETWEEN date(ics.count_window_start) AND date(ics.count_window_end)
    THEN 'IN_WINDOW'
    WHEN date('now') < date(ics.count_window_start)
    THEN 'UPCOMING'
    ELSE 'PAST'
  END as window_status
FROM inventory_count_schedule ics
JOIN fiscal_periods fp ON ics.period_id = fp.period_id
JOIN fiscal_years fy ON ics.fiscal_year_id = fy.fiscal_year_id
WHERE fy.status = 'ACTIVE'
ORDER BY ics.count_window_start ASC;

-- Month-End Close Status View
CREATE VIEW IF NOT EXISTS v_month_end_close_status AS
SELECT
  fmcs.*,
  fp.period_name,
  fp.period_number,
  fy.fiscal_year_number,
  CASE
    WHEN date('now') < date(fp.end_date) THEN 'PERIOD_OPEN'
    WHEN date('now') = date(fmcs.bd1_date) THEN 'BD1_IN_PROGRESS'
    WHEN date('now') = date(fmcs.bd2_date) THEN 'BD2_IN_PROGRESS'
    WHEN date('now') = date(fmcs.bd3_date) THEN 'BD3_IN_PROGRESS'
    WHEN date('now') = date(fmcs.bd4_date) THEN 'BD4_IN_PROGRESS'
    WHEN date('now') = date(fmcs.bd5_date) THEN 'BD5_FINAL'
    WHEN date('now') > date(fmcs.bd5_date) THEN 'CLOSED'
    ELSE 'PENDING'
  END as close_status
FROM fiscal_month_close_schedule fmcs
JOIN fiscal_periods fp ON fmcs.period_id = fp.period_id
JOIN fiscal_years fy ON fmcs.fiscal_year_id = fy.fiscal_year_id
WHERE fy.status = 'ACTIVE'
ORDER BY fp.period_number ASC;

-- ==============================================
-- MIGRATION COMPLETE
-- ==============================================
