# OneDrive Auto-Sync System

## What It Does

Automatically monitors your OneDrive `GFS Order PDF` folder and:
1. ✅ Detects new PDFs uploaded to OneDrive
2. ✅ Syncs them to local `data/pdfs/` folder
3. ✅ Extracts invoice data from PDFs
4. ✅ Imports to database with GL categorization
5. ✅ Generates coverage and accuracy reports
6. ✅ Runs every 5 minutes in the background

## Quick Start

### Start Auto-Sync
```bash
./start_auto_sync.sh
```

### Check Status
```bash
./check_auto_sync.sh
```

### View Live Logs
```bash
tail -f auto_sync.log
```

### Stop Auto-Sync
```bash
./stop_auto_sync.sh
```

## How It Works

1. **Upload PDFs to OneDrive**
   - Go to: https://1drv.ms/f/c/613dd27101141ec1/EhOahKqtqcVNvx8b5GSOFzkBd1ngJR3DWIWi6wi-AJoztg?e=qJq9P4
   - Upload new GFS invoice PDFs
   - OneDrive Desktop app syncs to: `~/Library/CloudStorage/OneDrive-Personal/GFS Order PDF/`

2. **Auto-Sync Detects Changes**
   - Checks every 5 minutes for new PDFs
   - Compares OneDrive count vs local count
   - If different, triggers sync and processing

3. **Automatic Processing**
   - Syncs PDFs to local folder
   - Runs `verify_new_invoices.js` - Check for unextracted PDFs
   - Runs `flawless_pdf_extractor.js` - Extract invoice data
   - Runs `clean_import_real_data.js` - Import to database
   - Runs `analyze_invoice_coverage.js` - Generate reports
   - Runs `verify_system_accuracy.js` - Final verification

4. **Results**
   - All new invoices imported
   - Items categorized with GL codes
   - Reports updated
   - System ready to use

## Workflow

### Normal Workflow (Fully Automated)
1. Upload PDFs to OneDrive
2. Wait 5 minutes (or less)
3. Check logs: `tail -f auto_sync.log`
4. Done! New invoices are in the system

### Manual Workflow (If Auto-Sync is Off)
1. Upload PDFs to OneDrive
2. Run: `./process_all_new_invoices.sh`

## Files Created

- `auto_sync_onedrive.sh` - Main sync daemon script
- `start_auto_sync.sh` - Start the daemon
- `stop_auto_sync.sh` - Stop the daemon
- `check_auto_sync.sh` - Check daemon status
- `auto_sync.log` - Activity log
- `.auto_sync.pid` - Process ID file (hidden)

## Logs Location

```bash
# View all logs
cat auto_sync.log

# View live updates
tail -f auto_sync.log

# View last 50 lines
tail -n 50 auto_sync.log
```

## Troubleshooting

### Auto-sync won't start
```bash
# Check if OneDrive folder exists
ls ~/Library/CloudStorage/OneDrive-Personal/"GFS Order PDF"

# Check if already running
./check_auto_sync.sh

# Force stop and restart
./stop_auto_sync.sh
./start_auto_sync.sh
```

### PDFs not syncing
```bash
# Check OneDrive Desktop app is running
ps aux | grep OneDrive

# Manually trigger sync
rsync -av ~/Library/CloudStorage/OneDrive-Personal/"GFS Order PDF"/ ./data/pdfs/ --include="*.pdf" --exclude="*"
```

### Processing errors
```bash
# Check logs for errors
tail -f auto_sync.log

# Run manual processing
./process_all_new_invoices.sh
```

## Benefits

✅ **Zero Manual Work** - Upload to OneDrive and forget
✅ **Always Up-to-Date** - New invoices processed automatically
✅ **Error Prevention** - Duplicate detection, validation checks
✅ **Complete Audit Trail** - All activity logged
✅ **Background Operation** - Runs silently, doesn't interrupt work
✅ **Easy Monitoring** - Simple status and log commands

## System Requirements

- OneDrive Desktop app installed and syncing
- macOS (uses ~/Library/CloudStorage/)
- Node.js installed
- SQLite database initialized

## Current Configuration

- **OneDrive Folder**: `~/Library/CloudStorage/OneDrive-Personal/GFS Order PDF`
- **Local Folder**: `/Users/davidmikulis/neuro-pilot-ai/backend/data/pdfs`
- **Check Interval**: 5 minutes
- **Log File**: `auto_sync.log`

## Production Recommendations

### Run at Startup (Optional)
Add to your startup items or create a LaunchAgent:

```bash
# Create LaunchAgent (advanced)
# ~/Library/LaunchAgents/com.neuropilot.autosync.plist
```

### Monitor Disk Space
```bash
# Check disk usage
du -sh data/pdfs/
du -sh data/gfs_orders/
```

### Backup Database
```bash
# Backup database daily
cp enterprise_inventory.db "backups/inventory_$(date +%Y%m%d).db"
```

## Support

If issues occur:
1. Check status: `./check_auto_sync.sh`
2. Review logs: `tail -f auto_sync.log`
3. Run manual process: `./process_all_new_invoices.sh`
4. Restart daemon: `./stop_auto_sync.sh && ./start_auto_sync.sh`
