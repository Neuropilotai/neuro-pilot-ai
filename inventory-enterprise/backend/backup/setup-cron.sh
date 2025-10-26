#!/bin/bash
################################################################################
# NeuroPilot Inventory - Automated Backup Cron Setup
#
# This script helps configure automated backups using cron.
#
# Usage: ./setup-cron.sh [--schedule daily|weekly|custom]
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-database.sh"
LOG_DIR="${HOME}/.neuropilot/logs"
LOG_FILE="${LOG_DIR}/backup.log"

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "$*"
}

error() {
    echo "ERROR: $*" >&2
}

show_usage() {
    cat << EOF
NeuroPilot Backup - Cron Setup Tool

Usage: $0 [OPTIONS]

OPTIONS:
    --schedule SCHEDULE    Backup schedule (daily, weekly, custom)
    --time HH:MM          Time to run backup (24-hour format)
    --test                Run test backup first
    --list                List current cron jobs
    --remove              Remove backup cron job

EXAMPLES:
    # Setup daily backup at 2:00 AM
    $0 --schedule daily --time 02:00

    # Setup weekly backup (Sunday at 3:00 AM)
    $0 --schedule weekly --time 03:00

    # Custom schedule
    $0 --schedule custom

    # List current backup jobs
    $0 --list

    # Remove backup cron job
    $0 --remove

EOF
}

check_backup_script() {
    if [ ! -f "$BACKUP_SCRIPT" ]; then
        error "Backup script not found: $BACKUP_SCRIPT"
        exit 1
    fi

    if [ ! -x "$BACKUP_SCRIPT" ]; then
        log "Making backup script executable..."
        chmod +x "$BACKUP_SCRIPT"
    fi
}

create_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        log "Creating log directory: $LOG_DIR"
        mkdir -p "$LOG_DIR"
    fi
}

test_backup() {
    log "Running test backup..."
    log "This may take a few minutes..."
    log ""

    if "$BACKUP_SCRIPT" --skip-upload; then
        log ""
        log "✅ Test backup completed successfully!"
        log ""
        return 0
    else
        error "Test backup failed!"
        log ""
        log "Please fix the issues above before setting up automated backups."
        exit 1
    fi
}

get_cron_expression() {
    local schedule=$1
    local time=${2:-"02:00"}

    # Parse hour and minute from time
    local hour=$(echo "$time" | cut -d: -f1 | sed 's/^0*//')
    local minute=$(echo "$time" | cut -d: -f2 | sed 's/^0*//')

    # Handle empty values
    hour=${hour:-0}
    minute=${minute:-0}

    case "$schedule" in
        daily)
            echo "$minute $hour * * *"
            ;;
        weekly)
            # Sunday at specified time
            echo "$minute $hour * * 0"
            ;;
        custom)
            read -p "Enter cron expression (e.g., 0 2 * * *): " -r custom_expr
            echo "$custom_expr"
            ;;
        *)
            error "Invalid schedule: $schedule"
            exit 1
            ;;
    esac
}

get_schedule_description() {
    local cron_expr=$1

    # Simple description based on pattern
    if [[ $cron_expr =~ ^[0-9]+[[:space:]]+[0-9]+[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*$ ]]; then
        local min=$(echo "$cron_expr" | awk '{print $1}')
        local hour=$(echo "$cron_expr" | awk '{print $2}')
        echo "Daily at $(printf "%02d:%02d" "$hour" "$min")"
    elif [[ $cron_expr =~ ^[0-9]+[[:space:]]+[0-9]+[[:space:]]+\*[[:space:]]+\*[[:space:]]+0$ ]]; then
        local min=$(echo "$cron_expr" | awk '{print $1}')
        local hour=$(echo "$cron_expr" | awk '{print $2}')
        echo "Weekly (Sunday) at $(printf "%02d:%02d" "$hour" "$min")"
    else
        echo "Custom schedule: $cron_expr"
    fi
}

add_cron_job() {
    local cron_expr=$1
    local description
    description=$(get_schedule_description "$cron_expr")

    # Create cron job entry
    local cron_command="$cron_expr $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
        log "⚠️  Backup cron job already exists"
        read -p "Replace existing cron job? (yes/no): " -r
        echo

        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Cancelled"
            exit 0
        fi

        # Remove existing job
        crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
    fi

    # Add new cron job
    (crontab -l 2>/dev/null; echo "# NeuroPilot Backup - $description"; echo "$cron_command") | crontab -

    log "✅ Cron job added successfully!"
    log ""
    log "Schedule: $description"
    log "Log file: $LOG_FILE"
    log ""
    log "To view logs:"
    log "  tail -f $LOG_FILE"
    log ""
    log "To list cron jobs:"
    log "  crontab -l"
}

list_cron_jobs() {
    log "Current cron jobs:"
    log "─────────────────────────────────────────────────────────────"

    if crontab -l 2>/dev/null | grep -A1 "NeuroPilot Backup"; then
        log "─────────────────────────────────────────────────────────────"
    else
        log "No NeuroPilot backup cron jobs found"
    fi
}

remove_cron_job() {
    log "Removing backup cron job..."

    if ! crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
        log "No backup cron job found"
        exit 0
    fi

    # Remove cron job and comment line
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | grep -v "# NeuroPilot Backup" | crontab -

    log "✅ Cron job removed"
}

show_next_runs() {
    local cron_expr=$1

    log "Next scheduled runs:"
    log "─────────────────────────────────────────────────────────────"

    # This is a simplified calculation - for accurate results, use a tool like 'croniter'
    # For now, just show the schedule
    log "$(get_schedule_description "$cron_expr")"
    log ""
    log "For exact next run times, use: https://crontab.guru/#$(echo "$cron_expr" | tr ' ' '_')"
}

interactive_setup() {
    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║        NeuroPilot Backup - Automated Schedule Setup            ║
╚════════════════════════════════════════════════════════════════╝

EOF

    # Check prerequisites
    check_backup_script
    create_log_dir

    # Ask for schedule
    cat << EOF
Choose backup schedule:

  1) Daily         - Every day at specified time
  2) Weekly        - Once per week (Sunday) at specified time
  3) Custom        - Define your own cron expression

EOF

    read -p "Select option (1-3): " -r schedule_choice
    echo

    local schedule
    case "$schedule_choice" in
        1)
            schedule="daily"
            ;;
        2)
            schedule="weekly"
            ;;
        3)
            schedule="custom"
            ;;
        *)
            error "Invalid option"
            exit 1
            ;;
    esac

    # Ask for time (if not custom)
    local time="02:00"
    if [ "$schedule" != "custom" ]; then
        read -p "Enter time (HH:MM, 24-hour format) [02:00]: " -r time_input
        time=${time_input:-02:00}

        # Validate time format
        if ! [[ $time =~ ^([0-1][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
            error "Invalid time format. Use HH:MM (e.g., 02:00)"
            exit 1
        fi
    fi

    # Get cron expression
    local cron_expr
    cron_expr=$(get_cron_expression "$schedule" "$time")

    # Confirm
    log ""
    log "Configuration:"
    log "  Schedule: $(get_schedule_description "$cron_expr")"
    log "  Cron expression: $cron_expr"
    log "  Backup script: $BACKUP_SCRIPT"
    log "  Log file: $LOG_FILE"
    log ""

    read -p "Proceed with setup? (yes/no): " -r
    echo

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Setup cancelled"
        exit 0
    fi

    # Run test backup
    log ""
    read -p "Run test backup first? (recommended) (yes/no): " -r
    echo

    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        test_backup
    fi

    # Add cron job
    add_cron_job "$cron_expr"

    # Show next runs
    show_next_runs "$cron_expr"

    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║                  Setup Complete!                                ║
╚════════════════════════════════════════════════════════════════╝

Your automated backups are now configured.

📋 Management Commands:
   View logs:        tail -f $LOG_FILE
   List cron jobs:   crontab -l
   Edit cron:        crontab -e
   Remove job:       $0 --remove

⚠️  Important:
   - Verify first backup completes successfully
   - Check logs regularly: $LOG_FILE
   - Test restore monthly
   - Keep GPG private key secure

EOF
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    local schedule=""
    local time="02:00"
    local run_test=false
    local list_jobs=false
    local remove_job=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --schedule)
                schedule=$2
                shift 2
                ;;
            --time)
                time=$2
                shift 2
                ;;
            --test)
                run_test=true
                shift
                ;;
            --list)
                list_jobs=true
                shift
                ;;
            --remove)
                remove_job=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Handle list/remove actions
    if [ "$list_jobs" = true ]; then
        list_cron_jobs
        exit 0
    fi

    if [ "$remove_job" = true ]; then
        remove_cron_job
        exit 0
    fi

    # Handle test-only
    if [ "$run_test" = true ] && [ -z "$schedule" ]; then
        check_backup_script
        test_backup
        exit 0
    fi

    # Non-interactive mode
    if [ -n "$schedule" ]; then
        check_backup_script
        create_log_dir

        if [ "$run_test" = true ]; then
            test_backup
        fi

        local cron_expr
        cron_expr=$(get_cron_expression "$schedule" "$time")
        add_cron_job "$cron_expr"
        exit 0
    fi

    # Interactive mode (no arguments provided)
    interactive_setup
}

# Run main function
main "$@"
