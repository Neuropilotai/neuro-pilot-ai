#!/usr/bin/env python3
"""
generate_fiscal_dates.py - Fiscal Calendar Date Dimension Generator

Populates fiscal_date_dim table with every date from FY25-FY26
Assigns fiscal_year, period, cut, BD markers, holidays, etc.

Usage:
    python3 scripts/generate_fiscal_dates.py

Generates:
    - 728 rows (Sept 1, 2024 → Aug 29, 2026)
    - Full fiscal context for each date
    - Business day markers (BD-3, BD-1, BD+1, etc.)
"""

import sqlite3
from datetime import date, timedelta
from pathlib import Path

# Database path
DB_PATH = Path(__file__).parent.parent / "data/enterprise_inventory.db"

def get_fiscal_context(d):
    """
    Get fiscal year and period for a given date.

    FY25: Sept 1, 2024 → Aug 30, 2025
    FY26: Aug 31, 2025 → Aug 29, 2026

    Each FY has 12 periods of ~4 weeks (28 days)
    Period 12 has 8 weeks (56 days) for year-end
    """
    # FY25 starts Sept 1, 2024
    fy25_start = date(2024, 9, 1)
    # FY26 starts Aug 31, 2025
    fy26_start = date(2025, 8, 31)
    # FY26 ends Aug 29, 2026
    fy26_end = date(2026, 8, 29)

    if d < fy25_start:
        return None, None  # Before FY25
    elif d < fy26_start:
        fiscal_year = 2025
        days_since_start = (d - fy25_start).days
    elif d <= fy26_end:
        fiscal_year = 2026
        days_since_start = (d - fy26_start).days
    else:
        return None, None  # After FY26

    # Calculate period (1-12)
    # Periods 1-11: 4 weeks each (28 days)
    # Period 12: 8 weeks (56 days)
    if days_since_start < 308:  # 11 periods * 28 days
        period = (days_since_start // 28) + 1
    else:
        period = 12

    return fiscal_year, period


def get_cut_and_week(d, fiscal_year, period, conn):
    """
    Get cut (1-5) and week_in_period for a date.

    Standard: 4 weeks per period = ~5 cuts per period
    Period 12: 8 weeks = double duration
    """
    # Get period start date from fiscal_periods table
    cursor = conn.cursor()
    cursor.execute("""
        SELECT period_start_date FROM fiscal_periods
        WHERE fiscal_year = ? AND period = ?
    """, (fiscal_year, period))

    row = cursor.fetchone()
    if not row:
        return None, None

    period_start = date.fromisoformat(row[0])
    days_in_period = (d - period_start).days

    # Week in period (1-indexed)
    week_in_period = (days_in_period // 7) + 1

    # Cut = week_in_period for simplicity
    # (can be refined based on DOCX files later)
    cut = min(week_in_period, 5)

    return cut, week_in_period


def get_bd_marker(d, fiscal_year, period, conn):
    """
    Calculate BD (Business Day) marker relative to period end.

    BD markers: BD-3, BD-1, BD+1, BD+2, BD+3, BD+4, BD+5
    BD-0 = period end date
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT period_end_date FROM fiscal_periods
        WHERE fiscal_year = ? AND period = ?
    """, (fiscal_year, period))

    row = cursor.fetchone()
    if not row:
        return None

    period_end = date.fromisoformat(row[0])
    days_from_end = (d - period_end).days

    # BD markers
    if days_from_end == 0:
        return 'BD-0'
    elif days_from_end == -3:
        return 'BD-3'
    elif days_from_end == -2:
        return 'BD-2'
    elif days_from_end == -1:
        return 'BD-1'
    elif days_from_end == 1:
        return 'BD+1'
    elif days_from_end == 2:
        return 'BD+2'
    elif days_from_end == 3:
        return 'BD+3'
    elif days_from_end == 4:
        return 'BD+4'
    elif days_from_end == 5:
        return 'BD+5'
    else:
        return None


def is_business_day(d, holidays):
    """Check if date is a business day (not weekend or holiday)."""
    if d.weekday() in [5, 6]:  # Saturday, Sunday
        return False
    if d.isoformat() in holidays:
        return False
    return True


def get_holidays(conn):
    """Load all holidays from fiscal_holidays table."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT date, holiday_name, country FROM fiscal_holidays
    """)

    holidays = {}
    for row in cursor.fetchall():
        date_str = row[0]
        if date_str not in holidays:
            holidays[date_str] = {'us': None, 'ca': None}

        if row[2] == 'US':
            holidays[date_str]['us'] = row[1]
        elif row[2] == 'CA':
            holidays[date_str]['ca'] = row[1]

    return holidays


def get_week_in_year(d):
    """Get ISO week number."""
    return d.isocalendar()[1]


def is_month_end(d):
    """Check if date is last day of month."""
    next_day = d + timedelta(days=1)
    return next_day.month != d.month


def is_period_end(d, fiscal_year, period, conn):
    """Check if date is last day of fiscal period."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT period_end_date FROM fiscal_periods
        WHERE fiscal_year = ? AND period = ?
    """, (fiscal_year, period))

    row = cursor.fetchone()
    if not row:
        return False

    period_end = date.fromisoformat(row[0])
    return d == period_end


def main():
    """Generate and populate fiscal_date_dim table."""
    print("🗓️  NeuroPilot Fiscal Calendar Generator v3.4.0")
    print("=" * 60)

    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Clear existing data
    print("🧹 Clearing existing fiscal_date_dim data...")
    cursor.execute("DELETE FROM fiscal_date_dim")
    conn.commit()

    # Load holidays
    print("📅 Loading holidays...")
    holidays = get_holidays(conn)
    print(f"   ✓ Loaded {len(holidays)} holiday dates")

    # Generate dates
    start_date = date(2024, 9, 1)  # FY25 start
    end_date = date(2026, 8, 29)   # FY26 end
    current_date = start_date

    rows_inserted = 0

    print(f"📊 Generating fiscal dates from {start_date} to {end_date}...")

    while current_date <= end_date:
        # Get fiscal context
        fiscal_year, period = get_fiscal_context(current_date)

        if fiscal_year is None:
            current_date += timedelta(days=1)
            continue

        # Get cut and week
        cut, week_in_period = get_cut_and_week(current_date, fiscal_year, period, conn)
        week_in_year = get_week_in_year(current_date)

        # Get BD marker
        bd_marker = get_bd_marker(current_date, fiscal_year, period, conn)

        # Get day info
        day_of_week = current_date.strftime('%A')
        date_str = current_date.isoformat()

        # Check holidays
        us_holiday = holidays.get(date_str, {}).get('us')
        ca_holiday = holidays.get(date_str, {}).get('ca')

        # Business day check
        is_biz_day = is_business_day(current_date, holidays)

        # Month/period end checks
        month_end = is_month_end(current_date)
        period_end = is_period_end(current_date, fiscal_year, period, conn)

        # Insert row
        cursor.execute("""
            INSERT INTO fiscal_date_dim (
                date, fiscal_year, period, cut, week_in_period, week_in_year,
                bd_marker, is_business_day, is_inventory_window, inventory_window_id,
                transmit_by_time, us_holiday, ca_holiday, day_of_week,
                is_month_end, is_period_end
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            date_str, fiscal_year, period, cut, week_in_period, week_in_year,
            bd_marker, 1 if is_biz_day else 0, 0, None,
            '23:45', us_holiday, ca_holiday, day_of_week,
            1 if month_end else 0, 1 if period_end else 0
        ))

        rows_inserted += 1
        current_date += timedelta(days=1)

    conn.commit()

    # Statistics
    print(f"✅ Generated {rows_inserted} fiscal date records")

    # Verify coverage
    cursor.execute("""
        SELECT
            COUNT(DISTINCT fiscal_year) as fy_count,
            COUNT(DISTINCT period) as period_count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            SUM(is_business_day) as business_days,
            SUM(CASE WHEN us_holiday IS NOT NULL OR ca_holiday IS NOT NULL THEN 1 ELSE 0 END) as holiday_days
        FROM fiscal_date_dim
    """)

    stats = cursor.fetchone()
    print("\n📊 Fiscal Calendar Statistics:")
    print(f"   Fiscal Years: {stats[0]}")
    print(f"   Periods: {stats[1]} unique periods")
    print(f"   Date Range: {stats[2]} → {stats[3]}")
    print(f"   Business Days: {stats[4]}")
    print(f"   Holiday Days: {stats[5]}")

    # Period breakdown
    cursor.execute("""
        SELECT fiscal_year, COUNT(*) as days, SUM(is_business_day) as biz_days
        FROM fiscal_date_dim
        GROUP BY fiscal_year
        ORDER BY fiscal_year
    """)

    print("\n📅 Breakdown by Fiscal Year:")
    for row in cursor.fetchall():
        print(f"   FY{row[0]}: {row[1]} days ({row[2]} business days)")

    conn.close()
    print("\n🎉 Fiscal calendar generation complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
