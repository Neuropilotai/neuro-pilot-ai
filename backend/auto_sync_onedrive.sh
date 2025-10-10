#!/bin/bash

# Auto-Sync OneDrive GFS PDFs to GFS Orders Folder
# This script watches OneDrive for new PDFs and syncs them to gfs_orders folder

# Try to find OneDrive directory (check multiple possible locations)
ONEDRIVE_PATHS=(
    "$HOME/Library/CloudStorage/OneDrive-Personal/GFS Order PDF"
    "$HOME/OneDrive/GFS Order PDF"
    "$HOME/OneDrive - Personal/GFS Order PDF"
)

ONEDRIVE_DIR=""
for path in "${ONEDRIVE_PATHS[@]}"; do
    if [ -d "$path" ]; then
        ONEDRIVE_DIR="$path"
        break
    fi
done

GFS_ORDERS_DIR="/Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders"
BACKEND_DIR="/Users/davidmikulis/neuro-pilot-ai/backend"
SYNC_LOG="$BACKEND_DIR/gfs_pdf_sync.log"

echo ""
echo "🔄 GFS Orders PDF Auto-Sync Started"
echo "===================================="
echo ""
if [ -n "$ONEDRIVE_DIR" ]; then
    echo "📁 Monitoring: $ONEDRIVE_DIR"
else
    echo "⚠️  OneDrive directory not found! Checked:"
    for path in "${ONEDRIVE_PATHS[@]}"; do
        echo "   - $path"
    done
    echo ""
    echo "Please update ONEDRIVE_PATHS in this script with the correct path."
fi
echo "📂 Syncing to: $GFS_ORDERS_DIR"
echo "📋 Log file: $SYNC_LOG"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Function to log with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$SYNC_LOG"
}

# Function to sync and process
sync_and_process() {
    echo ""
    log_message "Checking for new PDFs..."

    # Check if OneDrive directory exists
    if [ ! -d "$ONEDRIVE_DIR" ]; then
        log_message "⚠️  OneDrive directory not found: $ONEDRIVE_DIR"
        log_message "   Skipping this sync cycle..."
        return
    fi

    # Get list of JSON files (invoice numbers we need PDFs for)
    cd "$GFS_ORDERS_DIR" || return

    DOWNLOADED_COUNT=0
    SKIPPED_COUNT=0
    MISSING_COUNT=0

    # Find all JSON files and extract invoice numbers
    for json_file in *.json; do
        if [ -f "$json_file" ]; then
            # Extract invoice number from filename (remove .json extension)
            INVOICE_NUM="${json_file%.json}"

            # Check if PDF already exists locally
            if [ ! -f "$GFS_ORDERS_DIR/$INVOICE_NUM.pdf" ]; then
                # Look for PDF in OneDrive
                if [ -f "$ONEDRIVE_DIR/$INVOICE_NUM.pdf" ]; then
                    # Copy PDF to gfs_orders folder
                    cp "$ONEDRIVE_DIR/$INVOICE_NUM.pdf" "$GFS_ORDERS_DIR/$INVOICE_NUM.pdf"
                    log_message "✅ Downloaded: $INVOICE_NUM.pdf"
                    DOWNLOADED_COUNT=$((DOWNLOADED_COUNT + 1))
                else
                    log_message "⚠️  Missing in OneDrive: $INVOICE_NUM.pdf"
                    MISSING_COUNT=$((MISSING_COUNT + 1))
                fi
            else
                SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            fi
        fi
    done

    # Summary
    echo ""
    log_message "=== Sync Summary ==="
    log_message "Downloaded: $DOWNLOADED_COUNT PDFs"
    log_message "Already exist: $SKIPPED_COUNT PDFs"
    log_message "Missing in OneDrive: $MISSING_COUNT PDFs"

    # If we downloaded any new PDFs, process them
    if [ "$DOWNLOADED_COUNT" -gt 0 ]; then
        echo ""
        log_message "🆕 Processing $DOWNLOADED_COUNT new PDFs..."

        # Check for unextracted PDFs
        log_message "🔍 Checking for unextracted PDFs..."
        cd "$BACKEND_DIR"
        node verify_new_invoices.js

        # Run extraction
        echo ""
        log_message "📋 Extracting new PDFs..."
        node flawless_pdf_extractor.js

        # Import to database
        echo ""
        log_message "💾 Importing to database..."
        node clean_import_real_data.js

        # Generate reports
        echo ""
        log_message "📊 Generating coverage analysis..."
        node analyze_invoice_coverage.js

        # Final verification
        echo ""
        log_message "✅ Running final verification..."
        node verify_system_accuracy.js

        echo ""
        log_message "🎉 Processing complete!"
        log_message "================================"
    else
        log_message "✅ All PDFs up to date - no processing needed"
    fi
}

# Initial sync on startup
sync_and_process

# Schedule daily sync at 2 PM
while true; do
    # Get current hour (0-23)
    CURRENT_HOUR=$(date +%H)
    CURRENT_MINUTE=$(date +%M)

    # Check if it's 2 PM (14:00)
    if [ "$CURRENT_HOUR" -eq 14 ] && [ "$CURRENT_MINUTE" -ge 0 ] && [ "$CURRENT_MINUTE" -lt 5 ]; then
        log_message "⏰ Scheduled sync time (2 PM) - Starting sync..."
        sync_and_process
        # Sleep for 5 minutes to avoid running multiple times in the same hour
        sleep 300
    fi

    # Check every 5 minutes to see if it's 2 PM yet
    sleep 300
done
