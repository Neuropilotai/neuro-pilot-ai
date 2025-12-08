#!/bin/bash
# ============================================================================
# NeuroPilot Codebase Cleanup Migration Script
# Purpose: Safely reorganize multi-project monorepo with full rollback support
# Author: Platform Engineering Team
# Version: 1.0.0
# ============================================================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ROOT_DIR="/Users/davidmikulis/neuro-pilot-ai"
INVENTORY_DIR="${ROOT_DIR}/inventory-enterprise"
ARCHIVE_DIR="${ROOT_DIR}/archive"
LOG_FILE="${ROOT_DIR}/cleanup_migration_$(date +%Y%m%d_%H%M%S).log"
ROLLBACK_FILE="${ROOT_DIR}/.cleanup_rollback_$(date +%Y%m%d_%H%M%S).sh"

# Operation tracking
OPERATIONS=()
FILES_MOVED=0
FILES_DELETED=0
FILES_SKIPPED=0
ERRORS=0

# ============================================================================
# Utility Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    ((ERRORS++))
}

check_file_exists() {
    if [ -e "$1" ]; then
        return 0
    else
        return 1
    fi
}

check_references() {
    local file="$1"
    local filename=$(basename "$file")
    
    # Check for imports/requires in inventory-enterprise
    if grep -r "require.*${filename}\|import.*${filename}" "${INVENTORY_DIR}" 2>/dev/null | grep -v ".git" > /dev/null; then
        return 1  # References found
    fi
    
    # Check for file path references
    if grep -r "${file}" "${INVENTORY_DIR}" 2>/dev/null | grep -v ".git" > /dev/null; then
        return 1  # References found
    fi
    
    return 0  # No references
}

safe_move() {
    local source="$1"
    local dest="$2"
    local description="$3"
    
    if [ ! -e "$source" ]; then
        log_warning "Source file not found: $source (skipping)"
        ((FILES_SKIPPED++))
        return 0
    fi
    
    # Create destination directory if needed
    mkdir -p "$(dirname "$dest")"
    
    # Check if destination already exists
    if [ -e "$dest" ]; then
        log_warning "Destination exists: $dest (skipping move)"
        ((FILES_SKIPPED++))
        return 0
    fi
    
    # Move file
    if mv "$source" "$dest" 2>/dev/null; then
        log_success "Moved: $description"
        echo "mv \"$dest\" \"$source\"" >> "$ROLLBACK_FILE"
        ((FILES_MOVED++))
        OPERATIONS+=("MOVE:$source:$dest")
        return 0
    else
        log_error "Failed to move: $source -> $dest"
        return 1
    fi
}

safe_delete() {
    local file="$1"
    local description="$2"
    local check_refs="${3:-true}"
    
    if [ ! -e "$file" ]; then
        log_warning "File not found: $file (skipping)"
        ((FILES_SKIPPED++))
        return 0
    fi
    
    # Check for references if requested
    if [ "$check_refs" = "true" ]; then
        if ! check_references "$file"; then
            log_warning "References found for $file (skipping delete)"
            ((FILES_SKIPPED++))
            return 0
        fi
    fi
    
    # Create backup before delete
    local backup_dir="${ARCHIVE_DIR}/.backups/$(dirname "$file" | sed 's|^/||' | tr '/' '_')"
    mkdir -p "$backup_dir"
    local backup_file="${backup_dir}/$(basename "$file")"
    
    if cp "$file" "$backup_file" 2>/dev/null; then
        log "Backed up: $file -> $backup_file"
    fi
    
    # Delete file
    if rm "$file" 2>/dev/null; then
        log_success "Deleted: $description"
        echo "cp \"$backup_file\" \"$file\"" >> "$ROLLBACK_FILE"
        ((FILES_DELETED++))
        OPERATIONS+=("DELETE:$file:$backup_file")
        return 0
    else
        log_error "Failed to delete: $file"
        return 1
    fi
}

# ============================================================================
# Phase 1: Create Archive Structure
# ============================================================================

phase1_create_archive() {
    log "Phase 1: Creating archive directory structure..."
    
    mkdir -p "${ARCHIVE_DIR}/resume-generator/src"
    mkdir -p "${ARCHIVE_DIR}/resume-generator/docs"
    mkdir -p "${ARCHIVE_DIR}/resume-generator/data"
    mkdir -p "${ARCHIVE_DIR}/legacy/scripts"
    mkdir -p "${ARCHIVE_DIR}/legacy/config"
    mkdir -p "${ARCHIVE_DIR}/legacy/deployment"
    mkdir -p "${ARCHIVE_DIR}/legacy/agents"
    mkdir -p "${ARCHIVE_DIR}/.backups"
    
    # Create README in archive
    cat > "${ARCHIVE_DIR}/README.md" << 'EOF'
# NeuroPilot Archive

This directory contains archived files from previous projects and legacy code.

## Structure

- `resume-generator/` - Paused resume generation system (Notion → Zapier → OpenAI → Canva)
- `legacy/` - Old scripts, configs, and deployment files
- `.backups/` - Automatic backups created during cleanup operations

## Restoration

To restore a file, check the rollback script in the root directory:
`.cleanup_rollback_YYYYMMDD_HHMMSS.sh`
EOF
    
    log_success "Archive structure created"
}

# ============================================================================
# Phase 2: Move Resume Generator Files
# ============================================================================

phase2_move_resume_files() {
    log "Phase 2: Moving resume generator files to archive..."
    
    # Resume generator source files
    local resume_files=(
        "automated-resume-workflow.js:resume-generator/src"
        "generate_david_ultimate_resume.js:resume-generator/src"
        "professional_resume_generator.js:resume-generator/src"
        "ultimate_ai_resume_system.js:resume-generator/src"
        "resume_processor.js:resume-generator/src"
        "notion_gig_controller.js:resume-generator/src"
        "notion-agent-integration.js:resume-generator/src"
        "notion-integration-setup.js:resume-generator/src"
        "universal-notion-integration.js:resume-generator/src"
    )
    
    for entry in "${resume_files[@]}"; do
        IFS=':' read -r file dest <<< "$entry"
        source_file="${ROOT_DIR}/${file}"
        dest_file="${ARCHIVE_DIR}/${dest}/${file}"
        
        if [ -e "$source_file" ]; then
            safe_move "$source_file" "$dest_file" "Resume generator: $file"
        fi
    done
    
    # Resume generator directories
    if [ -d "${ROOT_DIR}/generated_resumes" ]; then
        safe_move "${ROOT_DIR}/generated_resumes" "${ARCHIVE_DIR}/resume-generator/data/generated_resumes" "Resume generator data directory"
    fi
    
    # Notion documentation
    local notion_docs=(
        "NOTION_DATABASE_SETUP_GUIDE.md"
        "NOTION_ENTERPRISE_INTEGRATION_GUIDE.md"
        "NOTION_INTEGRATION_STEP_BY_STEP.md"
    )
    
    for doc in "${notion_docs[@]}"; do
        source_file="${ROOT_DIR}/${doc}"
        if [ -e "$source_file" ]; then
            safe_move "$source_file" "${ARCHIVE_DIR}/resume-generator/docs/${doc}" "Notion docs: $doc"
        fi
    done
    
    log_success "Phase 2 complete: Moved resume generator files"
}

# ============================================================================
# Phase 3: Move Legacy Deployment Files
# ============================================================================

phase3_move_deployment_files() {
    log "Phase 3: Moving legacy deployment files..."
    
    # Legacy deployment scripts (keep only inventory-enterprise versions)
    local deploy_files=(
        "deploy.sh"
        "deploy-now.sh"
        "deploy-to-railway.sh"
        "force-railway-deploy.sh"
        "DEPLOY_NOW"
        "DEPLOY_V19_3_NOW.sh"
        "DEPLOY_V19.sh"
    )
    
    for file in "${deploy_files[@]}"; do
        source_file="${ROOT_DIR}/${file}"
        if [ -e "$source_file" ]; then
            # Check if it's different from inventory-enterprise version
            inv_file="${INVENTORY_DIR}/${file}"
            if [ -e "$inv_file" ]; then
                if ! diff -q "$source_file" "$inv_file" > /dev/null 2>&1; then
                    log_warning "Root $file differs from inventory-enterprise version (archiving root)"
                    safe_move "$source_file" "${ARCHIVE_DIR}/legacy/deployment/${file}" "Legacy deployment: $file"
                else
                    log "Root $file matches inventory-enterprise version (deleting duplicate)"
                    safe_delete "$source_file" "Duplicate deployment: $file"
                fi
            else
                safe_move "$source_file" "${ARCHIVE_DIR}/legacy/deployment/${file}" "Legacy deployment: $file"
            fi
        fi
    done
    
    log_success "Phase 3 complete"
}

# ============================================================================
# Phase 4: Clean Root Directory - Duplicate Servers
# ============================================================================

phase4_clean_duplicate_servers() {
    log "Phase 4: Removing duplicate server files from root..."
    
    # Check for duplicate server files
    local server_files=(
        "server-v21_1.js"
        "railway-server.js"
        "railway-server-full.js"
        "railway-server-minimal.js"
        "railway-server-production.js"
        "emergency-server.js"
        "command_server.js"
    )
    
    for file in "${server_files[@]}"; do
        source_file="${ROOT_DIR}/${file}"
        inv_file="${INVENTORY_DIR}/backend/${file}"
        
        if [ -e "$source_file" ]; then
            if [ -e "$inv_file" ]; then
                log "Found duplicate: $file (inventory-enterprise has version)"
                if diff -q "$source_file" "$inv_file" > /dev/null 2>&1; then
                    safe_delete "$source_file" "Duplicate server: $file"
                else
                    log_warning "Root $file differs from inventory-enterprise version (archiving)"
                    safe_move "$source_file" "${ARCHIVE_DIR}/legacy/${file}" "Legacy server: $file"
                fi
            else
                # Check if it's referenced
                if ! check_references "$source_file"; then
                    log_warning "References found for $file (archiving instead of deleting)"
                    safe_move "$source_file" "${ARCHIVE_DIR}/legacy/${file}" "Legacy server: $file"
                else
                    safe_delete "$source_file" "Orphaned server: $file"
                fi
            fi
        fi
    done
    
    log_success "Phase 4 complete"
}

# ============================================================================
# Phase 5: Clean Root Directory - Orphaned Files
# ============================================================================

phase5_clean_orphaned_files() {
    log "Phase 5: Cleaning orphaned files..."
    
    # Orphaned test files (limited set for safety)
    local test_files=(
        "test-all-apis.js"
        "test-deployment-status.sh"
        "test-email.js"
        "test-file-upload.js"
        "test-frontend-security.js"
        "test-inventory.js"
        "test-openai.js"
        "test-pipeline.js"
        "test-production-deployment.js"
        "test-railway-deployment.sh"
        "test-security.js"
        "test-server.js"
        "test-without-apis.js"
    )
    
    for file in "${test_files[@]}"; do
        source_file="${ROOT_DIR}/${file}"
        if [ -e "$source_file" ]; then
            # Check if inventory-enterprise has tests directory
            if [ -d "${INVENTORY_DIR}/tests" ]; then
                # Check if similar test exists
                if find "${INVENTORY_DIR}/tests" -name "*${file}" -o -name "${file}" 2>/dev/null | grep -q .; then
                    safe_delete "$source_file" "Duplicate test: $file"
                else
                    safe_move "$source_file" "${ARCHIVE_DIR}/legacy/scripts/${file}" "Orphaned test: $file"
                fi
            else
                safe_move "$source_file" "${ARCHIVE_DIR}/legacy/scripts/${file}" "Orphaned test: $file"
            fi
        fi
    done
    
    # Orphaned agent files (limited set)
    local agent_files=(
        "agent_integrity_system.js"
        "ai_agent_dashboard.js"
        "ai_monitoring_dashboard.js"
        "ai_learning_enhancer.js"
        "auto_feedback_generator.js"
        "reinforcement_learning_agent.js"
        "system-discovery-agent.js"
    )
    
    for file in "${agent_files[@]}"; do
        source_file="${ROOT_DIR}/${file}"
        if [ -e "$source_file" ]; then
            if ! check_references "$source_file"; then
                log_warning "References found for $file (archiving)"
                safe_move "$source_file" "${ARCHIVE_DIR}/legacy/agents/${file}" "Legacy agent: $file"
            else
                safe_move "$source_file" "${ARCHIVE_DIR}/legacy/agents/${file}" "Orphaned agent: $file"
            fi
        fi
    done
    
    log_success "Phase 5 complete"
}

# ============================================================================
# Phase 6: Generate Summary and Rollback Script
# ============================================================================

phase6_generate_summary() {
    log "Phase 6: Generating summary and rollback script..."
    
    # Create rollback script header
    cat > "$ROLLBACK_FILE" << EOF
#!/bin/bash
# ============================================================================
# NeuroPilot Cleanup Rollback Script
# Generated: $(date)
# Log: $LOG_FILE
# ============================================================================
# 
# This script reverses the cleanup operations performed.
# Run with: bash $ROLLBACK_FILE
#
# WARNING: This will restore files from backups. Use with caution.
# ============================================================================

set -euo pipefail

echo "Rolling back cleanup operations..."
echo "Backups location: ${ARCHIVE_DIR}/.backups/"

EOF
    
    chmod +x "$ROLLBACK_FILE"
    
    # Generate summary
    cat >> "$LOG_FILE" << EOF

============================================================================
CLEANUP MIGRATION SUMMARY
============================================================================
Completed: $(date)
Log File: $LOG_FILE
Rollback Script: $ROLLBACK_FILE

Statistics:
  Files Moved: $FILES_MOVED
  Files Deleted: $FILES_DELETED
  Files Skipped: $FILES_SKIPPED
  Errors: $ERRORS

Operations:
EOF
    
    for op in "${OPERATIONS[@]}"; do
        echo "  $op" >> "$LOG_FILE"
    done
    
    cat >> "$LOG_FILE" << EOF

Next Steps:
1. Review the log file: $LOG_FILE
2. Verify inventory-enterprise/ still works correctly
3. Test deployment if applicable
4. If issues occur, run rollback: bash $ROLLBACK_FILE
5. Once verified, you can delete the archive/ directory if desired

============================================================================
EOF
    
    log_success "Summary generated"
    log "Rollback script: $ROLLBACK_FILE"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    log "============================================================================"
    log "NeuroPilot Codebase Cleanup Migration"
    log "============================================================================"
    log "Root Directory: $ROOT_DIR"
    log "Inventory Directory: $INVENTORY_DIR"
    log "Archive Directory: $ARCHIVE_DIR"
    log "Log File: $LOG_FILE"
    log "============================================================================"
    log ""
    
    # Pre-flight checks
    if [ ! -d "$ROOT_DIR" ]; then
        log_error "Root directory not found: $ROOT_DIR"
        exit 1
    fi
    
    if [ ! -d "$INVENTORY_DIR" ]; then
        log_error "Inventory directory not found: $INVENTORY_DIR"
        exit 1
    fi
    
    # Initialize rollback script
    echo "#!/bin/bash" > "$ROLLBACK_FILE"
    echo "# Auto-generated rollback script" >> "$ROLLBACK_FILE"
    echo "set -euo pipefail" >> "$ROLLBACK_FILE"
    echo "" >> "$ROLLBACK_FILE"
    
    # Execute phases
    phase1_create_archive
    phase2_move_resume_files
    phase3_move_deployment_files
    phase4_clean_duplicate_servers
    phase5_clean_orphaned_files
    phase6_generate_summary
    
    # Final summary
    echo ""
    log "============================================================================"
    log "CLEANUP COMPLETE"
    log "============================================================================"
    log "Files Moved: $FILES_MOVED"
    log "Files Deleted: $FILES_DELETED"
    log "Files Skipped: $FILES_SKIPPED"
    log "Errors: $ERRORS"
    log ""
    log "Review log: $LOG_FILE"
    log "Rollback script: $ROLLBACK_FILE"
    log "============================================================================"
}

# Run main
main "$@"

