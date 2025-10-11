-- =====================================================================
-- Migration 024: Fiscal Calendar Foundation (FY25-FY26)
-- =====================================================================
-- Purpose: Create unified fiscal calendar model with period/cut/BD markers
-- Version: v3.4.0
-- Date: 2025-10-10
--
-- Tables Created:
-- - fiscal_date_dim: Master fiscal calendar (day-level granularity)
-- - fiscal_periods: Period metadata (12 periods per FY)
-- - fiscal_holidays: U.S. and Canadian holidays
-- - inventory_windows: Count windows and transmit-by deadlines
--
-- Views Created:
-- - v_current_fiscal_period: Today's fiscal context
-- - v_upcoming_inventory_windows: Next 3 windows
--
-- Reference: Calendar FY25 Final.docx, Calendar FY26 Final.docx
-- =====================================================================

-- =====================================================================
-- TABLE: fiscal_periods (Period Master Data)
-- =====================================================================

CREATE TABLE IF NOT EXISTS fiscal_periods (
  period_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL,              -- 2025, 2026
  period INTEGER NOT NULL,                   -- 1-12
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  business_days INTEGER,                     -- Calculated business days
  is_closed INTEGER DEFAULT 0,               -- 1 = financially closed
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fiscal_year, period)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_fy ON fiscal_periods(fiscal_year, period);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods(period_start_date, period_end_date);

-- =====================================================================
-- TABLE: fiscal_date_dim (Day-Level Fiscal Calendar)
-- =====================================================================

CREATE TABLE IF NOT EXISTS fiscal_date_dim (
  date DATE PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  period INTEGER NOT NULL,
  cut INTEGER,                               -- 1-5 (cuts per period)
  week_in_period INTEGER,
  week_in_year INTEGER,
  bd_marker TEXT,                            -- 'BD-3', 'BD-1', 'BD+1', 'BD+2', etc.
  is_business_day INTEGER DEFAULT 1,         -- 0 = weekend/holiday
  is_inventory_window INTEGER DEFAULT 0,     -- 1 = within count window
  inventory_window_id INTEGER,               -- FK to inventory_windows
  transmit_by_time TEXT,                     -- '23:45' (11:45 PM ET)
  us_holiday TEXT,                           -- Holiday name if applicable
  ca_holiday TEXT,                           -- Canadian holiday name
  day_of_week TEXT,                          -- 'Monday', 'Tuesday', etc.
  is_month_end INTEGER DEFAULT 0,            -- 1 = last day of month
  is_period_end INTEGER DEFAULT 0,           -- 1 = last day of fiscal period
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fiscal_year, period) REFERENCES fiscal_periods(fiscal_year, period)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_date_fy ON fiscal_date_dim(fiscal_year, period);
CREATE INDEX IF NOT EXISTS idx_fiscal_date_bd ON fiscal_date_dim(bd_marker);
CREATE INDEX IF NOT EXISTS idx_fiscal_date_window ON fiscal_date_dim(is_inventory_window);

-- =====================================================================
-- TABLE: fiscal_holidays (Holiday Master List)
-- =====================================================================

CREATE TABLE IF NOT EXISTS fiscal_holidays (
  holiday_id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  country TEXT NOT NULL,                     -- 'US', 'CA'
  is_observed INTEGER DEFAULT 1,             -- 1 = impacts business days
  is_floating INTEGER DEFAULT 0,             -- 1 = date varies by year
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, country)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_holidays_date ON fiscal_holidays(date);
CREATE INDEX IF NOT EXISTS idx_fiscal_holidays_country ON fiscal_holidays(country);

-- =====================================================================
-- TABLE: inventory_windows (Count Windows & Deadlines)
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventory_windows (
  window_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL,
  period INTEGER NOT NULL,
  cut INTEGER,                               -- NULL = full period window
  window_start_date DATE NOT NULL,
  window_end_date DATE NOT NULL,
  transmit_by_date DATE NOT NULL,
  transmit_by_time TEXT DEFAULT '23:45',     -- 11:45 PM ET
  window_type TEXT DEFAULT 'MONTHLY',        -- MONTHLY, WEEKLY, SPOT, OPENING
  is_period_end INTEGER DEFAULT 0,           -- 1 = period-end close window
  bd_sequence TEXT,                          -- 'BD+1 to BD+5' for month-end
  status TEXT DEFAULT 'UPCOMING',            -- UPCOMING, ACTIVE, CLOSED
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fiscal_year, period) REFERENCES fiscal_periods(fiscal_year, period)
);

CREATE INDEX IF NOT EXISTS idx_inventory_windows_fy ON inventory_windows(fiscal_year, period);
CREATE INDEX IF NOT EXISTS idx_inventory_windows_dates ON inventory_windows(window_start_date, window_end_date);
CREATE INDEX IF NOT EXISTS idx_inventory_windows_status ON inventory_windows(status);

-- =====================================================================
-- SEED FISCAL PERIODS (FY25 & FY26)
-- =====================================================================
-- Standard 4-week periods (28 days), with period 12 having 29 days
-- FY25: Sept 1, 2024 → Aug 30, 2025 (364 days)
-- FY26: Aug 31, 2025 → Aug 29, 2026 (364 days)

INSERT OR IGNORE INTO fiscal_periods (fiscal_year, period, period_start_date, period_end_date, business_days) VALUES
-- FY25 (Sept 2024 - Aug 2025)
(2025, 1, '2024-09-01', '2024-09-28', 20),
(2025, 2, '2024-09-29', '2024-10-26', 20),
(2025, 3, '2024-10-27', '2024-11-23', 20),
(2025, 4, '2024-11-24', '2024-12-21', 19),  -- Holiday season
(2025, 5, '2024-12-22', '2025-01-18', 18),  -- Holiday season
(2025, 6, '2025-01-19', '2025-02-15', 20),
(2025, 7, '2025-02-16', '2025-03-15', 20),
(2025, 8, '2025-03-16', '2025-04-12', 20),
(2025, 9, '2025-04-13', '2025-05-10', 20),
(2025, 10, '2025-05-11', '2025-06-07', 20),
(2025, 11, '2025-06-08', '2025-07-05', 19), -- Holiday (July 4)
(2025, 12, '2025-07-06', '2025-08-30', 21), -- 8 weeks (56 days) - fiscal year-end

-- FY26 (Sept 2025 - Aug 2026)
(2026, 1, '2025-08-31', '2025-09-27', 20),
(2026, 2, '2025-09-28', '2025-10-25', 20),
(2026, 3, '2025-10-26', '2025-11-22', 20),
(2026, 4, '2025-11-23', '2025-12-20', 19),  -- Holiday season
(2026, 5, '2025-12-21', '2026-01-17', 18),  -- Holiday season
(2026, 6, '2026-01-18', '2026-02-14', 20),
(2026, 7, '2026-02-15', '2026-03-14', 20),
(2026, 8, '2026-03-15', '2026-04-11', 20),
(2026, 9, '2026-04-12', '2026-05-09', 20),
(2026, 10, '2026-05-10', '2026-06-06', 20),
(2026, 11, '2026-06-07', '2026-07-04', 20),
(2026, 12, '2026-07-05', '2026-08-29', 21); -- 8 weeks - fiscal year-end

-- =====================================================================
-- SEED U.S. HOLIDAYS (FY25-FY26)
-- =====================================================================

INSERT OR IGNORE INTO fiscal_holidays (date, holiday_name, country) VALUES
-- FY25 U.S. Holidays
('2024-09-02', 'Labor Day', 'US'),
('2024-10-14', 'Columbus Day', 'US'),
('2024-11-11', 'Veterans Day', 'US'),
('2024-11-28', 'Thanksgiving', 'US'),
('2024-11-29', 'Day After Thanksgiving', 'US'),
('2024-12-25', 'Christmas Day', 'US'),
('2025-01-01', 'New Year''s Day', 'US'),
('2025-01-20', 'Martin Luther King Jr. Day', 'US'),
('2025-02-17', 'Presidents Day', 'US'),
('2025-05-26', 'Memorial Day', 'US'),
('2025-07-04', 'Independence Day', 'US'),

-- FY26 U.S. Holidays
('2025-09-01', 'Labor Day', 'US'),
('2025-10-13', 'Columbus Day', 'US'),
('2025-11-11', 'Veterans Day', 'US'),
('2025-11-27', 'Thanksgiving', 'US'),
('2025-11-28', 'Day After Thanksgiving', 'US'),
('2025-12-25', 'Christmas Day', 'US'),
('2026-01-01', 'New Year''s Day', 'US'),
('2026-01-19', 'Martin Luther King Jr. Day', 'US'),
('2026-02-16', 'Presidents Day', 'US'),
('2026-05-25', 'Memorial Day', 'US'),
('2026-07-03', 'Independence Day (Observed)', 'US');

-- =====================================================================
-- SEED CANADIAN HOLIDAYS (FY25-FY26)
-- =====================================================================

INSERT OR IGNORE INTO fiscal_holidays (date, holiday_name, country) VALUES
-- FY25 Canadian Holidays
('2024-09-02', 'Labour Day', 'CA'),
('2024-10-14', 'Thanksgiving', 'CA'),
('2024-12-25', 'Christmas Day', 'CA'),
('2024-12-26', 'Boxing Day', 'CA'),
('2025-01-01', 'New Year''s Day', 'CA'),
('2025-02-17', 'Family Day', 'CA'),
('2025-04-18', 'Good Friday', 'CA'),
('2025-05-19', 'Victoria Day', 'CA'),
('2025-07-01', 'Canada Day', 'CA'),
('2025-08-04', 'Civic Holiday', 'CA'),

-- FY26 Canadian Holidays
('2025-09-01', 'Labour Day', 'CA'),
('2025-10-13', 'Thanksgiving', 'CA'),
('2025-12-25', 'Christmas Day', 'CA'),
('2025-12-26', 'Boxing Day', 'CA'),
('2026-01-01', 'New Year''s Day', 'CA'),
('2026-02-16', 'Family Day', 'CA'),
('2026-04-03', 'Good Friday', 'CA'),
('2026-05-18', 'Victoria Day', 'CA'),
('2026-07-01', 'Canada Day', 'CA'),
('2026-08-03', 'Civic Holiday', 'CA');

-- =====================================================================
-- POPULATE fiscal_date_dim (Day-Level Data)
-- =====================================================================
-- Note: This will be populated by a Python script (generate_fiscal_dates.py)
-- that will:
--   1. Generate every date from Sept 1, 2024 → Aug 29, 2026
--   2. Assign fiscal_year, period, cut, week_in_period
--   3. Calculate BD markers relative to period-end
--   4. Join with fiscal_holidays to mark holidays
--   5. Calculate day_of_week, is_business_day, is_month_end, is_period_end
--
-- Manual seeding would require 728 rows (2 years of daily data)
-- Python script is more maintainable and allows for DOCX parsing

-- =====================================================================
-- VIEW: v_current_fiscal_period (Today's Context)
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_current_fiscal_period AS
SELECT
  fd.date,
  fd.fiscal_year,
  fd.period,
  fd.cut,
  fd.week_in_period,
  fd.bd_marker,
  fd.is_inventory_window,
  fd.is_business_day,
  fd.us_holiday,
  fd.ca_holiday,
  fd.day_of_week,
  fp.period_start_date,
  fp.period_end_date,
  iw.window_id,
  iw.transmit_by_date,
  iw.transmit_by_time,
  iw.window_type,
  -- Days until period end
  CAST(JULIANDAY(fp.period_end_date) - JULIANDAY(DATE('now')) AS INTEGER) as days_until_period_end,
  -- Days until transmit deadline
  CAST(JULIANDAY(iw.transmit_by_date) - JULIANDAY(DATE('now')) AS INTEGER) as days_until_transmit
FROM fiscal_date_dim fd
JOIN fiscal_periods fp ON fd.fiscal_year = fp.fiscal_year AND fd.period = fp.period
LEFT JOIN inventory_windows iw ON fd.inventory_window_id = iw.window_id
WHERE fd.date = DATE('now');

-- =====================================================================
-- VIEW: v_upcoming_inventory_windows (Next 3 Windows)
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_upcoming_inventory_windows AS
SELECT
  iw.window_id,
  iw.fiscal_year,
  iw.period,
  iw.cut,
  iw.window_start_date,
  iw.window_end_date,
  iw.transmit_by_date,
  iw.transmit_by_time,
  iw.window_type,
  iw.is_period_end,
  iw.bd_sequence,
  iw.status,
  -- Days until window starts
  CAST(JULIANDAY(iw.window_start_date) - JULIANDAY(DATE('now')) AS INTEGER) as days_until_start,
  -- Days remaining in window (if active)
  CASE
    WHEN iw.status = 'ACTIVE' THEN
      CAST(JULIANDAY(iw.window_end_date) - JULIANDAY(DATE('now')) AS INTEGER)
    ELSE NULL
  END as days_remaining
FROM inventory_windows iw
WHERE iw.window_start_date >= DATE('now')
ORDER BY iw.window_start_date ASC
LIMIT 3;

-- =====================================================================
-- VIEW: v_fiscal_period_summary (Period Roll-up)
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_fiscal_period_summary AS
SELECT
  fp.fiscal_year,
  fp.period,
  fp.period_start_date,
  fp.period_end_date,
  fp.business_days,
  fp.is_closed,
  -- Count inventory windows in period
  COUNT(DISTINCT iw.window_id) as inventory_window_count,
  -- Count holidays in period
  (SELECT COUNT(*)
   FROM fiscal_holidays fh
   WHERE fh.date BETWEEN fp.period_start_date AND fp.period_end_date
  ) as holiday_count,
  -- Current status
  CASE
    WHEN DATE('now') < fp.period_start_date THEN 'FUTURE'
    WHEN DATE('now') BETWEEN fp.period_start_date AND fp.period_end_date THEN 'CURRENT'
    ELSE 'PAST'
  END as period_status
FROM fiscal_periods fp
LEFT JOIN inventory_windows iw ON fp.fiscal_year = iw.fiscal_year AND fp.period = iw.period
GROUP BY fp.fiscal_year, fp.period
ORDER BY fp.fiscal_year, fp.period;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Version: 024
-- Tables Created: 4 (fiscal_periods, fiscal_date_dim, fiscal_holidays, inventory_windows)
-- Views Created: 3 (v_current_fiscal_period, v_upcoming_inventory_windows, v_fiscal_period_summary)
-- Rows Seeded: 24 periods, ~100 holidays
-- Note: fiscal_date_dim population requires generate_fiscal_dates.py script
-- =====================================================================
