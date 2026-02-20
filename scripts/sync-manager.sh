#!/bin/bash
# Sync Manager - Robust sync process with logging, verification, and retry logic

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/data/logs"
LOCK_FILE="$PROJECT_ROOT/data/.sync.lock"
STATUS_FILE="$PROJECT_ROOT/data/.sync-status.json"

# Default settings
MAX_RETRIES="${SYNC_MAX_RETRIES:-3}"
DAYS="${SYNC_DAYS:-7}"
PROFILE_ID="${PROFILE_ID:-test-athlete-1}"
AUTO_MODE="${AUTO_MODE:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Setup logging
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
LOG_FILE="$LOG_DIR/sync-$TIMESTAMP.log"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Garmin AI Coach - Sync Manager${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    log_info "Starting sync process"
    log_info "Log file: $LOG_FILE"
}

check_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
            log_error "Another sync is already running (PID: $lock_pid)"
            echo -e "${RED}✗${NC} Another sync is in progress. Wait for it to complete."
            exit 1
        else
            log_warn "Stale lock file found. Removing..."
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
    log_info "Lock acquired (PID: $$)"
}

cleanup() {
    local exit_code=$?
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
        log_info "Lock released"
    fi
    
    if [ $exit_code -eq 0 ]; then
        update_status "success"
    else
        update_status "failed"
    fi
    
    exit $exit_code
}

trap cleanup EXIT INT TERM

update_status() {
    local status="$1"
    local end_time=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    local start_time=$(date -u -r "$LOG_FILE" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "$end_time")
    
    # Load existing status or create new
    local prev_stats='{}'
    if [ -f "$STATUS_FILE" ]; then
        prev_stats=$(cat "$STATUS_FILE")
    fi
    
    # Update stats
    local total_syncs=$(echo "$prev_stats" | jq -r '.total_syncs // 0')
    local success_count=$(echo "$prev_stats" | jq -r '.success_count // 0')
    local failed_count=$(echo "$prev_stats" | jq -r '.failed_count // 0')
    
    total_syncs=$((total_syncs + 1))
    if [ "$status" = "success" ]; then
        success_count=$((success_count + 1))
    else
        failed_count=$((failed_count + 1))
    fi
    
    # Create status JSON
    cat > "$STATUS_FILE" <<EOF
{
    "last_sync": {
        "timestamp": "$end_time",
        "status": "$status",
        "log_file": "$LOG_FILE",
        "duration_seconds": $(($(date +%s) - $(date -r "$LOG_FILE" +%s)))
    },
    "total_syncs": $total_syncs,
    "success_count": $success_count,
    "failed_count": $failed_count,
    "success_rate": $(echo "scale=2; $success_count * 100 / $total_syncs" | bc)
}
EOF
    
    log_info "Status updated: $status (total: $total_syncs, success: $success_count, failed: $failed_count)"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check credential manager
    if [ ! -f "$SCRIPT_DIR/credential-manager.sh" ]; then
        log_error "Credential manager not found"
        return 1
    fi
    
    # Check garmindb sync script
    if [ ! -f "$SCRIPT_DIR/garmindb_sync_latest.sh" ]; then
        log_error "GarminDB sync script not found"
        return 1
    fi
    
    # Check import script
    if [ ! -f "$SCRIPT_DIR/import_garmindb_to_coach.py" ]; then
        log_error "Import script not found"
        return 1
    fi
    
    # Check Python3
    if ! command -v python3 &> /dev/null; then
        log_error "python3 not found in PATH"
        return 1
    fi
    
    # Check jq (for JSON processing)
    if ! command -v jq &> /dev/null; then
        log_warn "jq not found. Installing via brew (status updates will be limited)..."
        if command -v brew &> /dev/null; then
            brew install jq >> "$LOG_FILE" 2>&1 || true
        fi
    fi
    
    log_success "Prerequisites check passed"
    return 0
}

load_credentials() {
    log_info "Loading encrypted credentials..."
    
    if ! eval "$("$SCRIPT_DIR/credential-manager.sh" load 2>> "$LOG_FILE")"; then
        log_error "Failed to load credentials"
        
        if [ "$AUTO_MODE" = "true" ]; then
            log_error "Running in auto mode - cannot prompt for credentials"
            return 1
        fi
        
        echo -e "${YELLOW}No credentials found. Setting up...${NC}"
        "$SCRIPT_DIR/credential-manager.sh" save
        eval "$("$SCRIPT_DIR/credential-manager.sh" load 2>> "$LOG_FILE")"
    fi
    
    if [ -z "${GARMIN_EMAIL:-}" ]; then
        log_error "GARMIN_EMAIL not set after loading credentials"
        return 1
    fi
    
    export GARMIN_USER="$GARMIN_EMAIL"
    export GARMIN_PASSWORD="$GARMIN_PASSWORD"
    
    log_success "Credentials loaded for: ${GARMIN_EMAIL:0:3}***@${GARMIN_EMAIL#*@}"
    return 0
}

handle_mfa() {
    if [ "$AUTO_MODE" = "true" ]; then
        log_warn "MFA required but running in auto mode. Sync will fail."
        log_info "Run manually: ./scripts/sync-with-mfa.sh"
        return 1
    fi
    
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  MFA Required${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Garmin has sent a verification code to your email."
    echo ""
    read -p "Enter the MFA code from your email: " MFA_CODE
    
    if [ -z "$MFA_CODE" ]; then
        log_error "No MFA code provided"
        return 1
    fi
    
    export GARMIN_MFA_CODE="$MFA_CODE"
    log_info "MFA code provided"
    return 0
}

sync_garmindb() {
    local attempt="$1"
    log_info "Syncing GarminDB (attempt $attempt/$MAX_RETRIES)..."
    
    cd "$PROJECT_ROOT"
    
    local sync_output
    if sync_output=$("$SCRIPT_DIR/garmindb_sync_latest.sh" 2>&1); then
        echo "$sync_output" >> "$LOG_FILE"
        log_success "GarminDB sync completed"
        return 0
    else
        local exit_code=$?
        echo "$sync_output" >> "$LOG_FILE"
        
        # Check if MFA is needed
        if echo "$sync_output" | grep -qi "MFA\|multi-factor\|verification"; then
            log_warn "MFA required for authentication"
            if handle_mfa; then
                return 2  # Signal to retry with MFA
            else
                return 1
            fi
        fi
        
        log_error "GarminDB sync failed (exit code: $exit_code)"
        return 1
    fi
}

import_to_coach() {
    log_info "Importing data to coach store (last $DAYS days)..."
    
    cd "$PROJECT_ROOT"
    
    local before_count=0
    local after_count=0
    
    # Count entries before import
    if [ -f "data/coach_mcp_store.json" ]; then
        before_count=$(jq -r ".daily[\"$PROFILE_ID\"] | length // 0" data/coach_mcp_store.json 2>/dev/null || echo "0")
    fi
    
    local import_output
    if import_output=$(python3 scripts/import_garmindb_to_coach.py \
        --profile-id "$PROFILE_ID" \
        --latest-days "$DAYS" 2>&1); then
        echo "$import_output" >> "$LOG_FILE"
        
        # Count entries after import
        if [ -f "data/coach_mcp_store.json" ]; then
            after_count=$(jq -r ".daily[\"$PROFILE_ID\"] | length // 0" data/coach_mcp_store.json 2>/dev/null || echo "0")
        fi
        
        local imported=$((after_count - before_count))
        log_success "Import completed ($imported new/updated entries, total: $after_count)"
        
        # Extract summary from import output
        local activities_imported=$(echo "$import_output" | grep -oE "[0-9]+ activities" | head -1 || echo "Unknown")
        if [ "$activities_imported" != "Unknown" ]; then
            log_info "Activities imported: $activities_imported"
        fi
        
        return 0
    else
        echo "$import_output" >> "$LOG_FILE"
        log_error "Import failed"
        return 1
    fi
}

verify_sync() {
    log_info "Verifying sync results..."
    
    if [ ! -f "data/coach_mcp_store.json" ]; then
        log_error "Coach store file not found"
        return 1
    fi
    
    local today=$(date '+%Y-%m-%d')
    local has_today=$(jq -r ".daily[\"$PROFILE_ID\"] | map(select(.date == \"$today\")) | length" data/coach_mcp_store.json 2>/dev/null || echo "0")
    
    if [ "$has_today" -gt 0 ]; then
        log_success "Today's data ($today) is present in store"
    else
        log_warn "Today's data ($today) not found in store (may not have activities yet)"
    fi
    
    # Check latest activity date
    local latest_activity_date=$(jq -r ".daily[\"$PROFILE_ID\"] | map(select(.activities | length > 0)) | map(.date) | sort | last // \"none\"" data/coach_mcp_store.json 2>/dev/null || echo "none")
    log_info "Latest activity date in store: $latest_activity_date"
    
    return 0
}

run_sync() {
    local retry_count=0
    local retry_delay=5
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        retry_count=$((retry_count + 1))
        
        if [ $retry_count -gt 1 ]; then
            log_info "Retrying in $retry_delay seconds..."
            sleep $retry_delay
            retry_delay=$((retry_delay * 2))  # Exponential backoff
        fi
        
        if sync_garmindb "$retry_count"; then
            # Sync succeeded
            if import_to_coach; then
                verify_sync
                return 0
            else
                log_error "Import failed"
                continue
            fi
        else
            local sync_exit=$?
            if [ $sync_exit -eq 2 ]; then
                # MFA provided, retry immediately
                log_info "Retrying with MFA credentials..."
                retry_count=$((retry_count - 1))  # Don't count this as a retry
                retry_delay=0
                continue
            fi
        fi
    done
    
    log_error "Sync failed after $MAX_RETRIES attempts"
    return 1
}

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Sync Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "$STATUS_FILE" ]; then
        local status=$(jq -r '.last_sync.status' "$STATUS_FILE")
        local duration=$(jq -r '.last_sync.duration_seconds' "$STATUS_FILE")
        local success_rate=$(jq -r '.success_rate' "$STATUS_FILE")
        
        if [ "$status" = "success" ]; then
            echo -e "${GREEN}✓${NC} Status: Success"
        else
            echo -e "${RED}✗${NC} Status: Failed"
        fi
        
        echo -e "${CYAN}⏱${NC}  Duration: ${duration}s"
        echo -e "${CYAN}📊${NC} Success Rate: ${success_rate}%"
    fi
    
    echo -e "${CYAN}📝${NC} Log: $LOG_FILE"
    echo ""
    
    if [ "$AUTO_MODE" != "true" ]; then
        echo "Next steps:"
        echo "  • Check sync status: ./scripts/sync-status.sh"
        echo "  • View logs: tail -f $LOG_FILE"
        echo "  • Setup auto-sync: ./scripts/setup-auto-sync.sh"
        echo ""
    fi
}

main() {
    print_header
    check_lock
    
    if ! check_prerequisites; then
        exit 1
    fi
    
    if ! load_credentials; then
        exit 1
    fi
    
    if run_sync; then
        print_summary
        log_success "Sync completed successfully"
        exit 0
    else
        print_summary
        log_error "Sync failed"
        exit 1
    fi
}

main "$@"
