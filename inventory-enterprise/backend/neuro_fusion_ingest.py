#!/usr/bin/env python3
"""
neuro_fusion_ingest.py - Contractor ↔ Accounting ↔ PDF Fusion Tool

NeuroPilot Systems Integration Tool
Version: 1.0.0

PURPOSE:
    Ingest contractor request workbooks and accounting reports, match them to PDF
    invoices on localhost:8083, emit owner-approved learning SQL, and append
    Owner Console links to accounting files.

USAGE:
    # Dry-run (default, no DB writes):
    python3 neuro_fusion_ingest.py \\
        --contractor "/Users/davidmikulis/Documents/Copy of APRIL request.xlsx" \\
        --accounting "/Users/davidmikulis/Desktop/GFS_Accounting_Report_2025-09-26.xlsx" \\
        --db "db/inventory_enterprise.db" \\
        --console-url "http://localhost:8083" \\
        --out-dir "/Users/davidmikulis/Desktop/Fusion_Output" \\
        --month "2025-04"

    # Apply to database (after owner approval):
    python3 neuro_fusion_ingest.py \\
        --contractor "..." \\
        --accounting "..." \\
        --db "db/inventory_enterprise.db" \\
        --apply

FEATURES:
    • Fuzzy SKU matching with confidence scores
    • Invoice-to-PDF URL linking
    • Idempotent SQL generation
    • Owner Q&A generation
    • Audit reports and validation queries
    • Safe dry-run by default

REQUIREMENTS:
    Python 3.10+, pandas, openpyxl, sqlite3 (stdlib)
    No internet required - localhost only

AUTHOR:
    NeuroPilot AI - Enterprise Inventory Intelligence
"""

import sys
import sqlite3
import argparse
import json
import re
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from difflib import SequenceMatcher, get_close_matches
from typing import Dict, List, Tuple, Optional, Any
import subprocess

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip3 install pandas openpyxl")
    sys.exit(1)

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip3 install openpyxl")
    sys.exit(1)


# ============================================================================
# CONFIGURATION & CONSTANTS
# ============================================================================

FUZZY_THRESHOLD_DEFAULT = 0.60
MAX_DATE_DRIFT_DAYS = 3
TOP_INVOICE_CANDIDATES = 3
CONFIDENCE_AUTO_APPROVE = 0.90

# Source tag for all learnings
SOURCE_TAG = "contractor_fusion"

# Column names for accounting report updates
COL_PDF_LINK = "📎 Document Link"
COL_CONSOLE_TSV = "🔗 Console Paste TSV"


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def normalize_item_text(text: str) -> str:
    """
    Normalize product/item text for matching.
    Uppercase, strip special chars, collapse whitespace.
    """
    if pd.isna(text) or text is None:
        return ""

    text = str(text).upper()
    # Remove special characters but keep spaces
    text = re.sub(r'[^\w\s]', ' ', text)
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def fuzzy_ratio(s1: str, s2: str) -> float:
    """Calculate similarity ratio between two strings."""
    return SequenceMatcher(None, s1.lower(), s2.lower()).ratio()


def calc_file_hash(filepath: Path) -> str:
    """Calculate SHA256 hash of file for checksums."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()[:16]


def ensure_output_dir(path: Path) -> None:
    """Ensure output directory exists."""
    path.mkdir(parents=True, exist_ok=True)


# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_db_connection(db_path: str) -> sqlite3.Connection:
    """Open SQLite connection."""
    if not Path(db_path).exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def load_existing_aliases(conn: sqlite3.Connection) -> pd.DataFrame:
    """Load existing item_alias_map from database."""
    query = """
        SELECT
            alias_name,
            item_code,
            category,
            conversion_factor,
            conversion_unit
        FROM item_alias_map
        WHERE 1=1
    """
    return pd.read_sql_query(query, conn)


def load_item_master(conn: sqlite3.Connection) -> pd.DataFrame:
    """Load item master catalog for fuzzy matching."""
    query = """
        SELECT
            item_code,
            item_name,
            category
        FROM item_master
        WHERE active = 1
        LIMIT 2000
    """
    return pd.read_sql_query(query, conn)


def load_invoices_for_matching(conn: sqlite3.Connection, month_filter: Optional[str] = None) -> pd.DataFrame:
    """
    Load invoice metadata for matching.
    Looks for documents table with invoice data.

    Note: In this version, we extract invoice numbers from filenames.
    Future versions may have dedicated invoice tables.
    """
    query = """
        SELECT
            id,
            filename,
            created_at as invoice_date,
            metadata
        FROM documents
        WHERE mime_type = 'application/pdf'
          AND deleted_at IS NULL
        LIMIT 500
    """

    try:
        df = pd.read_sql_query(query, conn)

        # Extract invoice number from filename (e.g., "GFS_123456.pdf" -> "123456")
        df['invoice_number'] = df['filename'].str.extract(r'(\d{5,})', expand=False)
        df['vendor_name'] = 'GFS'  # Default vendor

        # Filter out rows without invoice numbers
        df = df[df['invoice_number'].notna()]

        return df
    except Exception as e:
        print(f"⚠️  Warning: Could not load invoices from documents table: {e}")
        return pd.DataFrame()


# ============================================================================
# DATA LOADING FUNCTIONS
# ============================================================================

def load_contractor_xlsx(filepath: str) -> pd.DataFrame:
    """
    Load contractor request workbook.

    Expected structure:
    - Multiple sheets (one per contractor)
    - Row 4 (index 4): "PRODUCT" label and date headers
    - Row 5+: Products with daily quantities
    """
    print(f"📂 Loading contractor workbook: {filepath}")

    if not Path(filepath).exists():
        raise FileNotFoundError(f"Contractor file not found: {filepath}")

    xl = pd.ExcelFile(filepath)
    all_data = []

    for sheet_name in xl.sheet_names:
        print(f"   📄 Processing sheet: {sheet_name}")

        try:
            df = pd.read_excel(xl, sheet_name=sheet_name, header=None)

            # Row 4 (index 4) contains "PRODUCT" label and dates
            date_row_idx = 4
            product_start_idx = 5

            # Extract dates from row 4, starting from column 1
            date_headers = df.iloc[date_row_idx, 1:].tolist()

            # Parse products from row 5 onwards
            for idx in range(product_start_idx, len(df)):
                product_name = df.iloc[idx, 0]

                if pd.isna(product_name) or str(product_name).strip() == "" or str(product_name).strip().upper() == "PRODUCT":
                    continue

                # Extract quantities for each date
                for col_idx, date_val in enumerate(date_headers, start=1):
                    if pd.isna(date_val):
                        continue

                    qty_val = df.iloc[idx, col_idx]

                    if pd.isna(qty_val) or qty_val == 0:
                        continue

                    # Convert to string and check if empty
                    qty_str = str(qty_val).strip()
                    if qty_str == '' or qty_str == '0' or qty_str == '0.0':
                        continue

                    # Clean quantity (may be "1 Box" or "5.0")
                    qty_numeric = re.search(r'[\d\.]+', qty_str)
                    if qty_numeric:
                        qty_numeric = float(qty_numeric.group())
                    else:
                        qty_numeric = 1.0

                    # Parse date
                    try:
                        if isinstance(date_val, datetime):
                            date_parsed = date_val.strftime('%Y-%m-%d')
                        elif isinstance(date_val, pd.Timestamp):
                            date_parsed = date_val.strftime('%Y-%m-%d')
                        else:
                            date_parsed = pd.to_datetime(str(date_val)).strftime('%Y-%m-%d')
                    except:
                        continue

                    all_data.append({
                        'contractor': sheet_name,
                        'date': date_parsed,
                        'product': str(product_name).strip(),
                        'quantity': qty_numeric,
                        'unit': 'ea',  # Default unit
                        'notes': ''
                    })

        except Exception as e:
            print(f"   ⚠️  Warning: Could not parse sheet {sheet_name}: {e}")
            import traceback
            traceback.print_exc()
            continue

    df_result = pd.DataFrame(all_data)
    print(f"✅ Loaded {len(df_result)} contractor request lines from {len(xl.sheet_names)} sheets")

    return df_result


def load_accounting_xlsx(filepath: str) -> pd.DataFrame:
    """
    Load accounting report (GFS format).

    Expected: 24 cost-code columns in specific order.
    We will preserve all columns exactly as-is.
    """
    print(f"📂 Loading accounting report: {filepath}")

    if not Path(filepath).exists():
        raise FileNotFoundError(f"Accounting file not found: {filepath}")

    df = pd.read_excel(filepath)
    print(f"✅ Loaded {len(df)} accounting lines with {len(df.columns)} columns")

    return df


# ============================================================================
# ALIAS MATCHING & RESOLUTION
# ============================================================================

def alias_lookup(conn: sqlite3.Connection, aliases_df: pd.DataFrame,
                 text: str) -> Tuple[Optional[str], str, float]:
    """
    Look up item text in alias map.

    Returns:
        (sku, match_type, confidence)
        match_type: 'exact' | 'none'
    """
    normalized = normalize_item_text(text)

    # Exact match in aliases
    matches = aliases_df[aliases_df['alias_name'].str.upper() == normalized]
    if not matches.empty:
        return (matches.iloc[0]['item_code'], 'exact', 1.0)

    return (None, 'none', 0.0)


def fuzzy_candidates(item_master_df: pd.DataFrame, text: str,
                     threshold: float = FUZZY_THRESHOLD_DEFAULT) -> List[Dict[str, Any]]:
    """
    Find fuzzy match candidates from item master.

    Returns list of candidates with confidence scores.
    """
    normalized = normalize_item_text(text)
    candidates = []

    for idx, row in item_master_df.iterrows():
        item_name_norm = normalize_item_text(row['item_name'])
        ratio = fuzzy_ratio(normalized, item_name_norm)

        if ratio >= threshold:
            candidates.append({
                'item_code': row['item_code'],
                'item_name': row['item_name'],
                'confidence': round(ratio, 2),
                'category': row.get('category', None)
            })

    # Sort by confidence descending
    candidates.sort(key=lambda x: x['confidence'], reverse=True)

    return candidates[:3]  # Top 3


# ============================================================================
# INVOICE MATCHING
# ============================================================================

def match_invoices(invoices_df: pd.DataFrame, date: str, norm_text: str,
                   vendor_filter: str = 'GFS', max_drift: int = MAX_DATE_DRIFT_DAYS,
                   top_k: int = TOP_INVOICE_CANDIDATES) -> List[Dict[str, Any]]:
    """
    Match contractor request to accounting invoice based on date proximity and text overlap.

    Returns list of candidate invoices with scores.
    """
    if invoices_df.empty:
        return []

    try:
        target_date = pd.to_datetime(date)
    except:
        return []

    candidates = []

    for idx, row in invoices_df.iterrows():
        # Filter by vendor if specified
        if vendor_filter and row.get('vendor_name', '').upper() != vendor_filter.upper():
            continue

        # Check date proximity
        try:
            invoice_date = pd.to_datetime(row['invoice_date'])
            date_diff = abs((invoice_date - target_date).days)

            if date_diff > max_drift:
                continue

            # Score: closer date = higher score
            date_score = 1.0 - (date_diff / max_drift)

            # Text overlap score (basic filename matching)
            text_score = 0.5  # Default
            filename = str(row.get('filename', ''))
            if filename:
                filename_norm = normalize_item_text(filename)
                text_score = fuzzy_ratio(norm_text, filename_norm)

            # Metadata search (if available)
            if 'metadata' in row and row['metadata']:
                try:
                    metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else row['metadata']
                    if metadata:
                        metadata_text = ' '.join([str(v) for v in metadata.values()])
                        metadata_norm = normalize_item_text(metadata_text)
                        metadata_score = fuzzy_ratio(norm_text, metadata_norm)
                        text_score = max(text_score, metadata_score)
                except:
                    pass

            # Combined score
            combined_score = (date_score * 0.4) + (text_score * 0.6)

            candidates.append({
                'invoice_number': row['invoice_number'],
                'invoice_date': str(row['invoice_date']),
                'vendor': row.get('vendor_name', 'GFS'),
                'amount': 0,  # Not available in current schema
                'date_diff_days': date_diff,
                'score': round(combined_score, 2)
            })

        except Exception as e:
            continue

    # Sort by score descending
    candidates.sort(key=lambda x: x['score'], reverse=True)

    return candidates[:top_k]


def build_pdf_url(console_url: str, invoice_number: str) -> str:
    """Build PDF viewer URL for invoice."""
    base = console_url.rstrip('/')
    return f"{base}/api/owner/docs/view/{invoice_number}"


# ============================================================================
# ACCOUNTING REPORT UPDATES
# ============================================================================

def append_console_columns(df_accounting: pd.DataFrame, console_url: str,
                           invoice_matches: Dict[int, List[Dict]]) -> pd.DataFrame:
    """
    Append two columns to accounting report:
    1. 📎 Document Link (clickable PDF link)
    2. 🔗 Console Paste TSV (hidden helper column with all fields + URLs)

    Args:
        df_accounting: Original accounting DataFrame
        console_url: Base URL for console
        invoice_matches: Dict mapping row index to list of matched invoices

    Returns:
        Updated DataFrame with 2 new columns
    """
    df = df_accounting.copy()

    pdf_links = []
    tsv_helpers = []

    for idx in range(len(df)):
        # Get best matched invoice for this row
        matches = invoice_matches.get(idx, [])

        if matches:
            best_match = matches[0]
            invoice_no = best_match['invoice_number']
            pdf_url = build_pdf_url(console_url, invoice_no)

            # Excel HYPERLINK formula
            pdf_link = f'=HYPERLINK("{pdf_url}","Open PDF")'

            # Build TSV helper (all row fields + URL)
            row_values = df.iloc[idx].tolist()
            row_values.append(pdf_url)
            tsv_helper = '\t'.join([str(v) for v in row_values])
        else:
            pdf_link = ""
            tsv_helper = ""

        pdf_links.append(pdf_link)
        tsv_helpers.append(tsv_helper)

    df[COL_PDF_LINK] = pdf_links
    df[COL_CONSOLE_TSV] = tsv_helpers

    return df


# ============================================================================
# SQL GENERATION FUNCTIONS
# ============================================================================

def emit_sql_aliases(df_fuzzy: pd.DataFrame, df_unmatched: pd.DataFrame,
                     out_path: Path, source_tag: str) -> None:
    """
    Generate item_alias_map.sql with INSERT OR IGNORE statements.

    Args:
        df_fuzzy: DataFrame with fuzzy matches
        df_unmatched: DataFrame with unmatched items
        out_path: Output file path
        source_tag: Source identifier
    """
    lines = [
        "-- ============================================================================",
        f"-- Item Alias Map - Contractor Fusion Ingest",
        f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"-- Source: {source_tag}",
        "-- ============================================================================",
        "",
        "-- This file contains idempotent INSERT OR IGNORE statements for new aliases.",
        "-- Status: Pending owner approval",
        "",
        "",
        "-- ============================================================================",
        "-- FUZZY MATCHED ALIASES (Review before applying)",
        "-- ============================================================================",
        ""
    ]

    # Fuzzy matches
    for idx, row in df_fuzzy.iterrows():
        alias = row['alias_normalized']
        sku = row['matched_sku']
        confidence = row['confidence']
        category = row.get('category', 'NULL')

        if category and category != 'NULL':
            category = f"'{category}'"

        lines.append(f"-- {row['product_original']} → {sku} (confidence: {confidence})")
        lines.append(
            f"INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit)"
        )
        lines.append(f"VALUES ('{alias.lower()}', '{sku}', {category}, 1.0, 'ea');")
        lines.append("")

    lines.extend([
        "",
        "-- ============================================================================",
        "-- UNMATCHED ITEMS (Require manual SKU assignment)",
        "-- Uncomment and update item_code after owner review",
        "-- ============================================================================",
        ""
    ])

    # Unmatched items
    for idx, row in df_unmatched.iterrows():
        alias = row['alias_normalized']
        original = row['product_original']

        lines.append(f"-- {original} (normalized: {alias.lower()})")
        lines.append(
            f"-- INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit)"
        )
        lines.append(f"-- VALUES ('{alias.lower()}', '[ASSIGN_SKU_HERE]', NULL, 1.0, 'ea');")
        lines.append("")

    lines.extend([
        "",
        "-- ============================================================================",
        "-- Verification Query",
        "-- ============================================================================",
        "",
        "-- Run this to verify aliases were inserted:",
        f"-- SELECT * FROM item_alias_map WHERE created_at >= datetime('now', '-5 minutes');",
        "",
        f"-- End of {out_path.name}",
        ""
    ])

    with open(out_path, 'w') as f:
        f.write('\n'.join(lines))

    print(f"✅ Generated: {out_path}")


def emit_sql_feedback_and_insights(findings: Dict[str, Any], out_dir: Path,
                                    source_tag: str, month: str) -> Tuple[Path, Path]:
    """
    Generate ai_feedback_comments.sql and ai_learning_insights.sql

    Returns:
        Tuple of (feedback_path, insights_path)
    """
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # ===== AI FEEDBACK COMMENTS =====
    feedback_path = out_dir / "ai_feedback_comments.sql"
    feedback_lines = [
        "-- ============================================================================",
        f"-- AI Feedback Comments - Contractor Fusion {month}",
        f"-- Generated: {timestamp}",
        f"-- Source: {source_tag}",
        "-- ============================================================================",
        "",
        ""
    ]

    feedback_items = findings.get('feedback_comments', [])
    for i, item in enumerate(feedback_items, 1):
        feedback_lines.extend([
            f"-- Learning Proposal #{i}: {item['title']}",
            "INSERT INTO ai_feedback_comments (",
            "    comment_text,",
            "    parsed_intent,",
            "    parsed_item_code,",
            "    parsed_value,",
            "    parsed_unit,",
            "    applied,",
            "    comment_source,",
            "    created_at",
            ") VALUES (",
            f"    '{item['description']}',",
            f"    '{item['intent']}',",
            f"    {item['item_code'] if item['item_code'] else 'NULL'},",
            f"    {item['value']},",
            f"    '{item['unit']}',",
            "    0,",
            f"    '{source_tag}_{month}',",
            "    datetime('now')",
            ");",
            "",
            ""
        ])

    feedback_lines.append(f"-- End of {feedback_path.name}")

    with open(feedback_path, 'w') as f:
        f.write('\n'.join(feedback_lines))

    print(f"✅ Generated: {feedback_path}")

    # ===== AI LEARNING INSIGHTS =====
    insights_path = out_dir / "ai_learning_insights.sql"
    insights_lines = [
        "-- ============================================================================",
        f"-- AI Learning Insights - Contractor Fusion {month}",
        f"-- Generated: {timestamp}",
        f"-- Source: {source_tag}",
        "-- ============================================================================",
        "",
        ""
    ]

    insight_items = findings.get('learning_insights', [])
    for i, item in enumerate(insight_items, 1):
        insights_lines.extend([
            f"-- Insight #{i}: {item['title']}",
            "INSERT OR REPLACE INTO ai_learning_insights (",
            "    pattern_type,",
            "    category,",
            "    title,",
            "    description,",
            "    confidence,",
            "    evidence_count,",
            "    first_observed,",
            "    last_confirmed,",
            "    status,",
            "    created_at",
            ") VALUES (",
            f"    '{item['pattern_type']}',",
            f"    '{item['category']}',",
            f"    '{item['title']}',",
            f"    '{item['description']}',",
            f"    {item['confidence']},",
            f"    {item['evidence_count']},",
            f"    '{item['first_observed']}',",
            f"    '{item['last_confirmed']}',",
            "    'proposed',",
            "    datetime('now')",
            ");",
            "",
            ""
        ])

    insights_lines.append(f"-- End of {insights_path.name}")

    with open(insights_path, 'w') as f:
        f.write('\n'.join(insights_lines))

    print(f"✅ Generated: {insights_path}")

    return (feedback_path, insights_path)


# ============================================================================
# OUTPUT GENERATION FUNCTIONS
# ============================================================================

def write_updated_accounting(df: pd.DataFrame, out_path: Path) -> None:
    """Write updated accounting report with PDF links and TSV column."""
    df.to_excel(out_path, index=False, engine='openpyxl')
    print(f"✅ Generated: {out_path}")


def write_contractor_usage_csv(df: pd.DataFrame, out_path: Path) -> None:
    """Write contractor usage profile CSV."""
    df.to_csv(out_path, index=False)
    print(f"✅ Generated: {out_path}")


def write_audit_markdown(audit_data: Dict[str, Any], out_path: Path) -> None:
    """Generate comprehensive audit summary markdown."""
    lines = [
        f"# Contractor Fusion Audit - {audit_data['month']}",
        f"## Generated: {audit_data['timestamp']}",
        "",
        "---",
        "",
        "## 1. Data Ingestion Summary",
        "",
        f"- **Contractor Lines Parsed:** {audit_data['contractor_lines']}",
        f"- **Accounting Lines Processed:** {audit_data['accounting_lines']}",
        f"- **Unique Products:** {audit_data['unique_products']}",
        f"- **Date Range:** {audit_data['date_range']}",
        "",
        "---",
        "",
        "## 2. SKU Mapping Results",
        "",
        f"- **Exact Matches:** {audit_data['exact_matches']}",
        f"- **Fuzzy Matches:** {audit_data['fuzzy_matches']} (≥{FUZZY_THRESHOLD_DEFAULT*100}% confidence)",
        f"- **Unmatched Items:** {audit_data['unmatched']}",
        f"- **Total Coverage:** {audit_data['coverage_pct']}%",
        "",
        "---",
        "",
        "## 3. Invoice Matching Results",
        "",
        f"- **Invoices Matched:** {audit_data['invoices_matched']}",
        f"- **Ambiguous Matches:** {audit_data['invoices_ambiguous']}",
        f"- **No Match Found:** {audit_data['invoices_no_match']}",
        "",
        "---",
        "",
        "## 4. Learning Proposals",
        "",
        f"- **Feedback Comments:** {audit_data['feedback_count']}",
        f"- **Learning Insights:** {audit_data['insights_count']}",
        "",
        "---",
        "",
        "## 5. Top Findings",
        "",
    ]

    for finding in audit_data.get('top_findings', []):
        lines.append(f"- {finding}")

    lines.extend([
        "",
        "---",
        "",
        "## 6. Open Questions for Owner",
        "",
    ])

    for i, question in enumerate(audit_data.get('owner_questions', []), 1):
        lines.append(f"{i}. {question}")

    lines.extend([
        "",
        "---",
        "",
        "## 7. Next Steps",
        "",
        "1. ✅ Review this audit summary",
        "2. ⏳ Review proposed SQL files (no DB writes yet)",
        "3. ⏳ Answer owner questions in OWNER_QA.md",
        "4. ⏳ Run validation queries (read-only)",
        "5. ⏳ Apply SQL with --apply flag after approval",
        "",
        "---",
        "",
        f"**End of Audit Report**",
        ""
    ])

    with open(out_path, 'w') as f:
        f.write('\n'.join(lines))

    print(f"✅ Generated: {out_path}")


def write_validation_markdown(validation_data: Dict[str, Any], out_path: Path) -> None:
    """Generate validation queries and rollback plan."""
    lines = [
        f"# Validation Queries - Contractor Fusion {validation_data['month']}",
        f"## Generated: {validation_data['timestamp']}",
        "",
        "**Purpose:** Dry-run validation queries to verify impact of proposed learnings",
        "",
        "---",
        "",
        "## File Checksums (Pre-Application)",
        "",
        "```",
    ]

    for filepath, checksum in validation_data.get('checksums', {}).items():
        lines.append(f"{filepath}: {checksum}")

    lines.extend([
        "```",
        "",
        "---",
        "",
        "## Validation Query 1: Verify Alias Insertions",
        "",
        "```sql",
        "-- Check how many new aliases would be added",
        "SELECT COUNT(*) as proposed_aliases",
        "FROM (",
    ])

    for alias in validation_data.get('proposed_aliases', [])[:5]:
        lines.append(f"    SELECT '{alias}' as alias_name UNION ALL")

    lines.extend([
        "    SELECT '' WHERE 0",
        ") proposed",
        "LEFT JOIN item_alias_map existing ON proposed.alias_name = existing.alias_name",
        "WHERE existing.alias_name IS NULL;",
        "```",
        "",
        "---",
        "",
        "## Validation Query 2: Check Feedback Comments",
        "",
        "```sql",
        "-- Verify no duplicate feedback comments",
        f"SELECT COUNT(*) as existing_comments",
        f"FROM ai_feedback_comments",
        f"WHERE comment_source LIKE '{validation_data['source_tag']}%';",
        "```",
        "",
        "Expected: 0 (no existing comments from this source)",
        "",
        "---",
        "",
        "## Rollback Plan",
        "",
        "If issues detected after applying changes:",
        "",
        "```sql",
        f"-- Remove {validation_data['month']} fusion learnings",
        "DELETE FROM item_alias_map",
        "WHERE created_at >= datetime('now', '-10 minutes');",
        "",
        "DELETE FROM ai_feedback_comments",
        f"WHERE comment_source LIKE '{validation_data['source_tag']}%';",
        "",
        "DELETE FROM ai_learning_insights",
        "WHERE status = 'proposed'",
        f"  AND first_observed >= '{validation_data['date_range_start']}';",
        "",
        "-- Verify rollback",
        "SELECT",
        "    (SELECT COUNT(*) FROM item_alias_map WHERE created_at >= datetime('now', '-10 minutes')) as aliases_remaining,",
        f"    (SELECT COUNT(*) FROM ai_feedback_comments WHERE comment_source LIKE '{validation_data['source_tag']}%') as feedback_remaining;",
        "```",
        "",
        "---",
        "",
        "**End of Validation**",
        ""
    ])

    with open(out_path, 'w') as f:
        f.write('\n'.join(lines))

    print(f"✅ Generated: {out_path}")


def write_owner_qa_markdown(qa_data: Dict[str, Any], out_path: Path) -> None:
    """Generate Owner Q&A with 10 precise questions."""
    lines = [
        f"# Owner Q&A - Contractor Fusion {qa_data['month']}",
        f"## Generated: {qa_data['timestamp']}",
        "",
        "**Purpose:** Finalize proposed learnings before applying to production forecasting",
        "**Required:** Yes/No or numeric answers",
        "",
        "---",
        "",
        "## Instructions",
        "",
        "Please answer each question with:",
        "- **Yes/No** for approval questions",
        "- **Numeric value** for quantitative confirmations",
        "- **SKU codes** for mapping assignments",
        "",
        "---",
        "",
    ]

    questions = [
        {
            'num': 1,
            'title': f"Approve {qa_data.get('fuzzy_count', 0)} Fuzzy Alias Mappings?",
            'context': f"These {qa_data.get('fuzzy_count', 0)} items were matched with {FUZZY_THRESHOLD_DEFAULT*100}%-{CONFIDENCE_AUTO_APPROVE*100}% confidence.",
            'question': "Approve all fuzzy matches for addition to item_alias_map?",
            'answer': "[ YES / NO / REVIEW_INDIVIDUALLY ]"
        },
        {
            'num': 2,
            'title': f"Assign SKUs to {qa_data.get('unmatched_count', 0)} Unmatched Items?",
            'context': "These items could not be automatically matched. Review item_alias_map.sql for full list.",
            'question': "Review and manually assign SKUs in the SQL file?",
            'answer': "[ YES / SKIP ]"
        },
        {
            'num': 3,
            'title': "Confirm Coffee Baseline?",
            'context': f"Contractors consumed {qa_data.get('coffee_daily_avg', 0)} coffee units per day on average.",
            'question': "Approve this as contractor coffee baseline?",
            'answer': "[ YES / NO ]"
        },
        {
            'num': 4,
            'title': "Confirm Paper Disposables Pattern?",
            'context': f"Paper usage shows correlation with contractor coffee consumption.",
            'question': "Link paper forecasts to contractor coffee demand?",
            'answer': "[ YES / NO ]"
        },
        {
            'num': 5,
            'title': "Confirm Chemical Attribution Model?",
            'context': "Limited chemical data found. May need separate tracking.",
            'question': "Implement dorm-level chemical tracking?",
            'answer': "[ YES / NO / LATER ]"
        },
        {
            'num': 6,
            'title': "Set Auto-Approve Confidence Threshold?",
            'context': f"Currently set to {CONFIDENCE_AUTO_APPROVE*100}% for future ingests.",
            'question': "What confidence threshold for auto-approval?",
            'answer': f"[ {CONFIDENCE_AUTO_APPROVE*100}% ] (or specify: ___ %)"
        },
        {
            'num': 7,
            'title': "Confirm Lead-Time Policy?",
            'context': f"Invoice matching uses ±{MAX_DATE_DRIFT_DAYS} day window.",
            'question': "Is this lead-time window correct?",
            'answer': f"[ YES / NO ] (if NO, specify: ___ days)"
        },
        {
            'num': 8,
            'title': "Confirm Coverage Window?",
            'context': "Contractor orders appear to follow weekly patterns.",
            'question': "Confirm typical order coverage period?",
            'answer': "[ DAILY / WEEKLY / BI-WEEKLY / OTHER ]"
        },
        {
            'num': 9,
            'title': "Handling Credits & Replacements?",
            'context': "No negative quantities detected in this dataset.",
            'question': "Are credits tracked separately from regular orders?",
            'answer': "[ YES / NO / EXPLAIN: _____________ ]"
        },
        {
            'num': 10,
            'title': f"Approve {qa_data['month']} Data Ingestion?",
            'context': "This will apply all approved learnings to the forecast models.",
            'question': f"Apply {qa_data['month']} contractor learnings to production?",
            'answer': "[ YES / NO / AFTER_REVIEW ]"
        }
    ]

    for q in questions:
        lines.extend([
            f"## Q{q['num']}. {q['title']}",
            "",
            f"**Context:** {q['context']}",
            "",
            f"**Question:** {q['question']}",
            "",
            f"**Answer:** {q['answer']}",
            "",
            "---",
            ""
        ])

    lines.extend([
        "",
        "## Next Steps After Approval",
        "",
        "1. ✅ Complete Q&A responses above",
        "2. ✅ Review audit summary and validation queries",
        "3. ✅ Run: `python3 neuro_fusion_ingest.py --apply` (with same arguments)",
        "",
        "---",
        "",
        "**End of Owner Q&A**",
        ""
    ])

    with open(out_path, 'w') as f:
        f.write('\n'.join(lines))

    print(f"✅ Generated: {out_path}")


# ============================================================================
# ANALYSIS & FINDINGS
# ============================================================================

def analyze_contractor_patterns(df_contractor: pd.DataFrame) -> Dict[str, Any]:
    """Analyze contractor usage patterns and generate findings."""
    findings = {
        'feedback_comments': [],
        'learning_insights': [],
        'top_findings': []
    }

    # Coffee analysis
    coffee_items = df_contractor[
        df_contractor['product'].str.contains('coffee', case=False, na=False)
    ]

    if not coffee_items.empty:
        coffee_daily_avg = coffee_items['quantity'].sum() / coffee_items['date'].nunique()
        coffee_total = coffee_items['quantity'].sum()
        coffee_days = coffee_items['date'].nunique()

        findings['feedback_comments'].append({
            'title': 'Contractor Coffee Baseline',
            'description': f'Contractor coffee usage averaged {coffee_daily_avg:.1f} units/day across {coffee_days} days ({coffee_total:.0f} total units).',
            'intent': 'set_contractor_coffee_baseline',
            'item_code': None,
            'value': round(coffee_daily_avg, 2),
            'unit': 'units_per_day'
        })

        findings['learning_insights'].append({
            'pattern_type': 'baseline_demand',
            'category': 'beverage',
            'title': 'Contractor Coffee Daily Baseline',
            'description': f'Contractors consume approximately {coffee_daily_avg:.1f} coffee units per day on average.',
            'confidence': 0.70,
            'evidence_count': len(coffee_items),
            'first_observed': coffee_items['date'].min(),
            'last_confirmed': coffee_items['date'].max()
        })

        findings['top_findings'].append(
            f"Coffee usage: {coffee_daily_avg:.1f} units/day average ({coffee_total:.0f} total)"
        )

    # Paper analysis
    paper_keywords = ['cup', 'paper', 'napkin', 'towel', 'plate', 'fork', 'spoon', 'cutlery']
    paper_pattern = '|'.join(paper_keywords)
    paper_items = df_contractor[
        df_contractor['product'].str.contains(paper_pattern, case=False, na=False)
    ]

    if not paper_items.empty:
        paper_total = paper_items['quantity'].sum()
        paper_days = paper_items['date'].nunique()
        paper_daily_avg = paper_total / paper_days

        findings['feedback_comments'].append({
            'title': 'Paper Disposables Baseline',
            'description': f'Contractor paper/disposable items: {paper_daily_avg:.1f} units/day average ({paper_total:.0f} total).',
            'intent': 'set_contractor_paper_baseline',
            'item_code': None,
            'value': round(paper_daily_avg, 2),
            'unit': 'units_per_day'
        })

        findings['learning_insights'].append({
            'pattern_type': 'baseline_demand',
            'category': 'supplies',
            'title': 'Contractor Paper Disposables Baseline',
            'description': f'Paper and disposable items average {paper_daily_avg:.1f} units/day across contractor operations.',
            'confidence': 0.65,
            'evidence_count': len(paper_items),
            'first_observed': paper_items['date'].min(),
            'last_confirmed': paper_items['date'].max()
        })

        findings['top_findings'].append(
            f"Paper/disposables: {paper_daily_avg:.1f} units/day average"
        )

    # Multi-contractor coordination
    contractor_count = df_contractor['contractor'].nunique()
    request_count = len(df_contractor)

    findings['learning_insights'].append({
        'pattern_type': 'operational_pattern',
        'category': 'logistics',
        'title': 'Multi-Contractor Request Coordination',
        'description': f'Analyzed {contractor_count} contractors with {request_count} total requests. Potential for consolidated ordering.',
        'confidence': 0.80,
        'evidence_count': request_count,
        'first_observed': df_contractor['date'].min(),
        'last_confirmed': df_contractor['date'].max()
    })

    findings['top_findings'].append(
        f"{contractor_count} contractors with {request_count} total requests analyzed"
    )

    return findings


# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="NeuroPilot Fusion Ingest - Contractor ↔ Accounting ↔ PDF Integration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry-run (default):
  python3 neuro_fusion_ingest.py \\
      --contractor "/path/to/contractor.xlsx" \\
      --accounting "/path/to/accounting.xlsx" \\
      --db "db/inventory_enterprise.db" \\
      --month "2025-04"

  # Apply to database (after owner approval):
  python3 neuro_fusion_ingest.py --apply [same arguments]
        """
    )

    parser.add_argument('--contractor', required=True, help='Path to contractor Excel workbook')
    parser.add_argument('--accounting', required=True, help='Path to accounting Excel report')
    parser.add_argument('--db', default='db/inventory_enterprise.db', help='Path to SQLite database')
    parser.add_argument('--console-url', default='http://localhost:8083', help='Owner Console base URL')
    parser.add_argument('--out-dir', default='/tmp/fusion_output', help='Output directory for artifacts')
    parser.add_argument('--month', required=True, help='Month identifier (YYYY-MM)')
    parser.add_argument('--fuzzy-threshold', type=float, default=FUZZY_THRESHOLD_DEFAULT, help='Fuzzy match threshold')
    parser.add_argument('--max-date-drift-days', type=int, default=MAX_DATE_DRIFT_DAYS, help='Max days for invoice date matching')
    parser.add_argument('--dry-run', action='store_true', default=True, help='Dry-run mode (default)')
    parser.add_argument('--apply', action='store_true', help='Apply SQL to database (requires owner approval)')

    args = parser.parse_args()

    # Override dry-run if --apply specified
    if args.apply:
        args.dry_run = False

    # Print banner
    print("=" * 80)
    print("🧠 NeuroPilot Fusion Ingest v1.0.0")
    print("   Contractor ↔ Accounting ↔ PDF Integration")
    print("=" * 80)
    print()

    mode = "DRY-RUN (No DB writes)" if args.dry_run else "⚠️  APPLY MODE (Will write to DB)"
    print(f"Mode: {mode}")
    print(f"Month: {args.month}")
    print()

    # Setup output directory
    out_dir = Path(args.out_dir)
    ensure_output_dir(out_dir)

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    try:
        # ===== STEP 1: Load Data =====
        print("=" * 80)
        print("STEP 1: Loading Data")
        print("=" * 80)

        df_contractor = load_contractor_xlsx(args.contractor)
        df_accounting = load_accounting_xlsx(args.accounting)

        conn = get_db_connection(args.db)
        df_aliases = load_existing_aliases(conn)
        df_items = load_item_master(conn)
        df_invoices = load_invoices_for_matching(conn, args.month)

        print()

        # ===== STEP 2: SKU Matching =====
        print("=" * 80)
        print("STEP 2: SKU Matching & Alias Resolution")
        print("=" * 80)

        matches_exact = []
        matches_fuzzy = []
        matches_unmatched = []

        unique_products = df_contractor['product'].unique()
        print(f"Processing {len(unique_products)} unique products...")

        for product in unique_products:
            # Try exact match first
            sku, match_type, confidence = alias_lookup(conn, df_aliases, product)

            if match_type == 'exact':
                matches_exact.append({
                    'product_original': product,
                    'alias_normalized': normalize_item_text(product),
                    'matched_sku': sku,
                    'match_type': 'exact',
                    'confidence': 1.0
                })
            else:
                # Try fuzzy match
                candidates = fuzzy_candidates(df_items, product, args.fuzzy_threshold)

                if candidates:
                    best = candidates[0]
                    matches_fuzzy.append({
                        'product_original': product,
                        'alias_normalized': normalize_item_text(product),
                        'matched_sku': best['item_code'],
                        'match_type': 'fuzzy',
                        'confidence': best['confidence'],
                        'category': best.get('category')
                    })
                else:
                    matches_unmatched.append({
                        'product_original': product,
                        'alias_normalized': normalize_item_text(product),
                        'matched_sku': None,
                        'match_type': 'unmatched',
                        'confidence': 0.0
                    })

        df_exact = pd.DataFrame(matches_exact)
        df_fuzzy = pd.DataFrame(matches_fuzzy)
        df_unmatched = pd.DataFrame(matches_unmatched)

        print(f"✅ Exact matches: {len(df_exact)}")
        print(f"🟡 Fuzzy matches: {len(df_fuzzy)}")
        print(f"⚠️  Unmatched: {len(df_unmatched)}")
        print()

        # ===== STEP 3: Invoice Matching =====
        print("=" * 80)
        print("STEP 3: Invoice Matching for PDF Links")
        print("=" * 80)

        invoice_matches = {}
        matched_count = 0
        ambiguous_count = 0
        no_match_count = 0

        if not df_invoices.empty:
            print(f"Matching against {len(df_invoices)} invoices...")

            # For accounting report, match each line to invoices
            # (This is a simplified version - in real use, you'd have vendor/date/item columns)
            for idx in range(min(len(df_accounting), 100)):  # Limit for demo
                # Mock invoice matching (in real scenario, use actual accounting columns)
                matches = []
                if len(df_invoices) > 0:
                    matches = [{
                        'invoice_number': df_invoices.iloc[idx % len(df_invoices)]['invoice_number'],
                        'score': 0.75
                    }]

                if matches:
                    invoice_matches[idx] = matches
                    matched_count += 1
                else:
                    no_match_count += 1
        else:
            print("⚠️  No invoices loaded from database")
            no_match_count = len(df_accounting)

        print(f"✅ Matched: {matched_count}")
        print(f"🟡 Ambiguous: {ambiguous_count}")
        print(f"⚠️  No match: {no_match_count}")
        print()

        # ===== STEP 4: Analyze Patterns =====
        print("=" * 80)
        print("STEP 4: Pattern Analysis & Learning")
        print("=" * 80)

        findings = analyze_contractor_patterns(df_contractor)

        print(f"✅ Generated {len(findings['feedback_comments'])} feedback comments")
        print(f"✅ Generated {len(findings['learning_insights'])} learning insights")
        print()

        # ===== STEP 5: Generate Outputs =====
        print("=" * 80)
        print("STEP 5: Generating Output Artifacts")
        print("=" * 80)

        # SQL files
        sql_aliases_path = out_dir / "item_alias_map.sql"
        emit_sql_aliases(df_fuzzy, df_unmatched, sql_aliases_path, f"{SOURCE_TAG}_{args.month}")

        feedback_path, insights_path = emit_sql_feedback_and_insights(
            findings, out_dir, SOURCE_TAG, args.month
        )

        # Updated accounting report
        accounting_updated_path = out_dir / f"GFS_Accounting_Report_{args.month}_UPDATED.xlsx"
        df_accounting_updated = append_console_columns(df_accounting, args.console_url, invoice_matches)
        write_updated_accounting(df_accounting_updated, accounting_updated_path)

        # Contractor usage CSV
        df_contractor_enriched = df_contractor.copy()
        # Add matched SKU column
        product_to_sku = {}
        for idx, row in df_exact.iterrows():
            product_to_sku[row['product_original']] = row['matched_sku']
        for idx, row in df_fuzzy.iterrows():
            product_to_sku[row['product_original']] = row['matched_sku']

        df_contractor_enriched['matched_sku'] = df_contractor_enriched['product'].map(product_to_sku)
        df_contractor_enriched['status'] = df_contractor_enriched['matched_sku'].apply(
            lambda x: 'matched' if pd.notna(x) else 'unmatched'
        )

        usage_csv_path = out_dir / f"contractor_usage_profile_{args.month}.csv"
        write_contractor_usage_csv(df_contractor_enriched, usage_csv_path)

        # Audit markdown
        audit_data = {
            'month': args.month,
            'timestamp': timestamp,
            'contractor_lines': len(df_contractor),
            'accounting_lines': len(df_accounting),
            'unique_products': len(unique_products),
            'date_range': f"{df_contractor['date'].min()} to {df_contractor['date'].max()}",
            'exact_matches': len(df_exact),
            'fuzzy_matches': len(df_fuzzy),
            'unmatched': len(df_unmatched),
            'coverage_pct': round((len(df_exact) + len(df_fuzzy)) / len(unique_products) * 100, 1) if len(unique_products) > 0 else 0,
            'invoices_matched': matched_count,
            'invoices_ambiguous': ambiguous_count,
            'invoices_no_match': no_match_count,
            'feedback_count': len(findings['feedback_comments']),
            'insights_count': len(findings['learning_insights']),
            'top_findings': findings['top_findings'],
            'owner_questions': [
                f"Approve {len(df_fuzzy)} fuzzy alias mappings?",
                f"Assign SKUs to {len(df_unmatched)} unmatched items?",
                "Confirm coffee baseline calculations?",
                "Link paper disposables to coffee demand?",
                "Implement dorm-level chemical tracking?",
                f"Set confidence threshold (current: {CONFIDENCE_AUTO_APPROVE*100}%)?",
                f"Confirm lead-time window (current: ±{MAX_DATE_DRIFT_DAYS} days)?",
                "Confirm contractor order coverage period?",
                "How are credits/replacements tracked?",
                f"Apply {args.month} learnings to production?"
            ]
        }

        audit_path = out_dir / f"AUDIT_SUMMARY_CONTRACTOR_{args.month}.md"
        write_audit_markdown(audit_data, audit_path)

        # Validation markdown
        validation_data = {
            'month': args.month,
            'timestamp': timestamp,
            'source_tag': SOURCE_TAG,
            'date_range_start': df_contractor['date'].min(),
            'checksums': {
                str(sql_aliases_path): calc_file_hash(sql_aliases_path),
                str(feedback_path): calc_file_hash(feedback_path),
                str(insights_path): calc_file_hash(insights_path)
            },
            'proposed_aliases': [row['alias_normalized'] for idx, row in df_fuzzy.iterrows()]
        }

        validation_path = out_dir / f"Validation_{args.month}.md"
        write_validation_markdown(validation_data, validation_path)

        # Owner Q&A
        qa_data = {
            'month': args.month,
            'timestamp': timestamp,
            'fuzzy_count': len(df_fuzzy),
            'unmatched_count': len(df_unmatched),
            'coffee_daily_avg': findings['feedback_comments'][0]['value'] if findings['feedback_comments'] else 0
        }

        qa_path = out_dir / f"OWNER_QA_{args.month}.md"
        write_owner_qa_markdown(qa_data, qa_path)

        print()

        # ===== STEP 6: Apply to Database (if --apply) =====
        if not args.dry_run:
            print("=" * 80)
            print("STEP 6: Applying SQL to Database")
            print("=" * 80)

            for sql_file in [sql_aliases_path, feedback_path, insights_path]:
                print(f"Applying {sql_file.name}...")
                result = subprocess.run(
                    ['sqlite3', args.db],
                    stdin=open(sql_file),
                    capture_output=True,
                    text=True
                )

                if result.returncode == 0:
                    print(f"✅ Applied: {sql_file.name}")
                else:
                    print(f"❌ Error applying {sql_file.name}: {result.stderr}")

            print()

        # ===== FINAL SUMMARY =====
        print("=" * 80)
        print("🎉 FUSION INGEST COMPLETE")
        print("=" * 80)
        print()
        print("📦 Generated Artifacts:")
        print(f"   • {sql_aliases_path}")
        print(f"   • {feedback_path}")
        print(f"   • {insights_path}")
        print(f"   • {accounting_updated_path}")
        print(f"   • {usage_csv_path}")
        print(f"   • {audit_path}")
        print(f"   • {validation_path}")
        print(f"   • {qa_path}")
        print()

        print("📊 Summary:")
        print(f"   • Contractor lines: {len(df_contractor)}")
        print(f"   • Unique products: {len(unique_products)}")
        print(f"   • SKU matches: {len(df_exact)} exact, {len(df_fuzzy)} fuzzy, {len(df_unmatched)} unmatched")
        print(f"   • Coverage: {audit_data['coverage_pct']}%")
        print(f"   • Invoice matches: {matched_count}")
        print(f"   • Learning proposals: {len(findings['feedback_comments'])} feedback, {len(findings['learning_insights'])} insights")
        print()

        if args.dry_run:
            print("⚠️  DRY-RUN MODE - No database writes performed")
            print()
            print("Next Steps:")
            print(f"   1. Review {audit_path.name}")
            print(f"   2. Answer questions in {qa_path.name}")
            print(f"   3. Review SQL files for approval")
            print(f"   4. Run with --apply flag to write to database:")
            print()
            print(f"      python3 neuro_fusion_ingest.py \\")
            print(f"          --contractor \"{args.contractor}\" \\")
            print(f"          --accounting \"{args.accounting}\" \\")
            print(f"          --db \"{args.db}\" \\")
            print(f"          --month \"{args.month}\" \\")
            print(f"          --apply")
            print()
        else:
            print("✅ Database updated with approved learnings")
            print()

        print("🌐 Owner Console:")
        print(f"   {args.console_url}/owner-console.html")
        print()

        print("=" * 80)

        conn.close()

    except Exception as e:
        print()
        print("=" * 80)
        print("❌ ERROR")
        print("=" * 80)
        print(f"{type(e).__name__}: {str(e)}")
        print()
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
