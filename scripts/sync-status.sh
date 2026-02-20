#!/bin/bash
# Sync Status - Display current sync status and history

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATUS_FILE="$PROJECT_ROOT/data/.sync-status.json"
LOG_DIR="$PROJECT_ROOT/data/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Sync Status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

format_timestamp() {
    local timestamp="$1"
    if command -v gdate &> /dev/null; then
        # Use GNU date if available (via brew coreutils)
        gdate -d "$timestamp" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "$timestamp"
    elif date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" '+%Y-%m-%d %H:%M:%S' 2>/dev/null; then
        # macOS date format
        date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" '+%Y-%m-%d %H:%M:%S'
    else
        echo "$timestamp"
    fi
}

format_duration() {
    local seconds="$1"
    if [ "$seconds" -lt 60 ]; then
        echo "${seconds}s"
    elif [ "$seconds" -lt 3600 ]; then
        echo "$((seconds / 60))m $((seconds % 60))s"
    else
        echo "$((seconds / 3600))h $((seconds % 3600 / 60))m"
    fi
}

show_status() {
    if [ ! -f "$STATUS_FILE" ]; then
        echo -e "${YELLOW}⚠${NC}  No sync history found"
        echo ""
        echo "Run your first sync:"
        echo "  ./scripts/sync-manager.sh"
        echo ""
        return 1
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠${NC}  jq not installed. Install with: brew install jq"
        echo ""
        cat "$STATUS_FILE"
        return 1
    fi
    
    local status=$(jq -r '.last_sync.status' "$STATUS_FILE")
    local timestamp=$(jq -r '.last_sync.timestamp' "$STATUS_FILE")
    local duration=$(jq -r '.last_sync.duration_seconds' "$STATUS_FILE")
    local log_file=$(jq -r '.last_sync.log_file' "$STATUS_FILE")
    
    local total=$(jq -r '.total_syncs' "$STATUS_FILE")
    local success=$(jq -r '.success_count' "$STATUS_FILE")
    local failed=$(jq -r '.failed_count' "$STATUS_FILE")
    local rate=$(jq -r '.success_rate' "$STATUS_FILE")
    
    echo "Last Sync:"
    echo ""
    
    if [ "$status" = "success" ]; then
        echo -e "  ${GREEN}✓${NC} Status: Success"
    else
        echo -e "  ${RED}✗${NC} Status: Failed"
    fi
    
    echo -e "  ${CYAN}🕐${NC} Time: $(format_timestamp "$timestamp")"
    echo -e "  ${CYAN}⏱${NC}  Duration: $(format_duration "$duration")"
    
    if [ -f "$log_file" ]; then
        echo -e "  ${CYAN}📝${NC} Log: $log_file"
    fi
    
    echo ""
    echo "Statistics:"
    echo ""
    echo -e "  ${CYAN}📊${NC} Total Syncs: $total"
    echo -e "  ${GREEN}✓${NC}  Successful: $success"
    echo -e "  ${RED}✗${NC}  Failed: $failed"
    echo -e "  ${CYAN}%${NC}  Success Rate: ${rate}%"
    echo ""
}

show_recent_logs() {
    if [ ! -d "$LOG_DIR" ]; then
        return 0
    fi
    
    local log_count=$(find "$LOG_DIR" -name "sync-*.log" | wc -l | tr -d ' ')
    
    if [ "$log_count" -eq 0 ]; then
        return 0
    fi
    
    echo "Recent Sync Logs:"
    echo ""
    
    find "$LOG_DIR" -name "sync-*.log" -type f | sort -r | head -5 | while read -r log; do
        local filename=$(basename "$log")
        local size=$(du -h "$log" | cut -f1)
        local date="${filename#sync-}"
        date="${date%.log}"
        echo "  • $date ($size)"
    done
    
    echo ""
    echo "View latest log:"
    if [ -f "$STATUS_FILE" ] && command -v jq &> /dev/null; then
        local latest_log=$(jq -r '.last_sync.log_file' "$STATUS_FILE" 2>/dev/null || echo "")
        if [ -n "$latest_log" ] && [ -f "$latest_log" ]; then
            echo "  tail -f $latest_log"
        fi
    else
        echo "  tail -f $LOG_DIR/sync-\$(ls -t $LOG_DIR/sync-*.log | head -1)"
    fi
    echo ""
}

show_data_status() {
    local store_file="$PROJECT_ROOT/data/coach_mcp_store.json"
    
    if [ ! -f "$store_file" ]; then
        echo -e "${YELLOW}⚠${NC}  No data store found"
        return 0
    fi
    
    if ! command -v jq &> /dev/null; then
        return 0
    fi
    
    local profile_id="${PROFILE_ID:-test-athlete-1}"
    local entry_count=$(jq -r ".daily[\"$profile_id\"] | length // 0" "$store_file" 2>/dev/null || echo "0")
    local latest_date=$(jq -r ".daily[\"$profile_id\"] | map(.date) | sort | last // \"none\"" "$store_file" 2>/dev/null || echo "none")
    local activity_days=$(jq -r ".daily[\"$profile_id\"] | map(select(.activities | length > 0)) | length // 0" "$store_file" 2>/dev/null || echo "0")
    
    echo "Data Store:"
    echo ""
    echo -e "  ${CYAN}📦${NC} Profile: $profile_id"
    echo -e "  ${CYAN}📅${NC} Total Days: $entry_count"
    echo -e "  ${CYAN}🏃${NC} Days with Activities: $activity_days"
    echo -e "  ${CYAN}📆${NC} Latest Date: $latest_date"
    echo ""
}

show_next_actions() {
    echo "Available Commands:"
    echo ""
    echo "  • Run sync now:"
    echo "    ./scripts/sync-manager.sh"
    echo ""
    echo "  • Sync with MFA:"
    echo "    ./scripts/sync-with-mfa.sh"
    echo ""
    echo "  • Setup automated daily sync:"
    echo "    ./scripts/setup-auto-sync.sh"
    echo ""
    echo "  • View this status:"
    echo "    ./scripts/sync-status.sh"
    echo ""
}

main() {
    print_header
    show_status
    show_data_status
    show_recent_logs
    show_next_actions
}

main "$@"
