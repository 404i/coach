#!/bin/bash
# Secure Credential Manager for Garmin AI Coach
# Uses OpenSSL AES-256-CBC encryption

set -e

CRED_FILE="${HOME}/.garmin-coach-credentials.enc"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if credentials file exists
credentials_exist() {
    [ -f "$CRED_FILE" ]
}

# Encrypt and save credentials
save_credentials() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Save Encrypted Garmin Credentials"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Get Garmin credentials
    print_info "Enter your Garmin Connect credentials"
    echo ""
    read -p "Garmin Email: " GARMIN_EMAIL
    read -s -p "Garmin Password: " GARMIN_PASSWORD
    echo ""
    
    if [ -z "$GARMIN_EMAIL" ] || [ -z "$GARMIN_PASSWORD" ]; then
        print_error "Email and password cannot be empty"
        exit 1
    fi
    
    echo ""
    print_info "Create a master password to encrypt your credentials"
    print_warning "Remember this password - you'll need it to sync!"
    echo ""
    read -s -p "Master Password: " MASTER_PASSWORD
    echo ""
    read -s -p "Confirm Master Password: " MASTER_PASSWORD_CONFIRM
    echo ""
    
    if [ "$MASTER_PASSWORD" != "$MASTER_PASSWORD_CONFIRM" ]; then
        print_error "Passwords don't match"
        exit 1
    fi
    
    if [ ${#MASTER_PASSWORD} -lt 8 ]; then
        print_error "Master password must be at least 8 characters"
        exit 1
    fi
    
    # Create JSON with credentials
    CRED_JSON=$(cat <<EOF
{
  "garmin_email": "$GARMIN_EMAIL",
  "garmin_password": "$GARMIN_PASSWORD",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)
    
    # Encrypt and save
    echo "$CRED_JSON" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass pass:"$MASTER_PASSWORD" -out "$CRED_FILE"
    chmod 600 "$CRED_FILE"
    
    echo ""
    print_success "Credentials encrypted and saved to: $CRED_FILE"
    echo ""
    print_info "File permissions: 600 (owner read/write only)"
    print_info "Encryption: AES-256-CBC with PBKDF2 (100k iterations)"
    echo ""
    print_warning "⚠️  Keep your master password safe!"
    print_warning "⚠️  Never commit $CRED_FILE to git (already in .gitignore)"
    echo ""
}

# Load and decrypt credentials
load_credentials() {
    if ! credentials_exist; then
        print_error "No credentials found. Run: $0 save"
        exit 1
    fi
    
    # Get master password
    if [ -z "$MASTER_PASSWORD" ]; then
        read -s -p "Master Password: " MASTER_PASSWORD
        echo ""
    fi
    
    # Decrypt
    CRED_JSON=$(openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -pass pass:"$MASTER_PASSWORD" -in "$CRED_FILE" 2>/dev/null)
    
    if [ $? -ne 0 ] || [ -z "$CRED_JSON" ]; then
        print_error "Failed to decrypt credentials. Wrong password?"
        exit 1
    fi
    
    # Parse JSON (using python for reliability)
    export GARMIN_EMAIL=$(echo "$CRED_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['garmin_email'])")
    export GARMIN_PASSWORD=$(echo "$CRED_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['garmin_password'])")
    
    if [ -z "$GARMIN_EMAIL" ] || [ -z "$GARMIN_PASSWORD" ]; then
        print_error "Failed to parse credentials"
        exit 1
    fi
}

# Show credential info (masked)
show_credentials() {
    if ! credentials_exist; then
        print_error "No credentials found"
        exit 1
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Encrypted Credentials Info"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "File: $CRED_FILE"
    echo "Size: $(ls -lh "$CRED_FILE" | awk '{print $5}')"
    echo "Permissions: $(ls -l "$CRED_FILE" | awk '{print $1}')"
    echo "Modified: $(ls -l "$CRED_FILE" | awk '{print $6, $7, $8}')"
    echo ""
    
    # Try to load and show masked
    load_credentials
    
    MASKED_EMAIL="${GARMIN_EMAIL:0:3}***@${GARMIN_EMAIL##*@}"
    MASKED_PASSWORD="$(printf '*%.0s' {1..8})"
    
    echo "Email: $MASKED_EMAIL"
    echo "Password: $MASKED_PASSWORD (${#GARMIN_PASSWORD} characters)"
    echo ""
    print_success "Credentials are valid and can be decrypted"
    echo ""
}

# Delete credentials
delete_credentials() {
    if ! credentials_exist; then
        print_info "No credentials to delete"
        exit 0
    fi
    
    echo ""
    print_warning "This will permanently delete your encrypted credentials"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" == "yes" ]; then
        rm -f "$CRED_FILE"
        print_success "Credentials deleted"
    else
        print_info "Cancelled"
    fi
    echo ""
}

# Update credentials
update_credentials() {
    if credentials_exist; then
        print_warning "Existing credentials will be overwritten"
        echo ""
    fi
    save_credentials
}

# Test credentials by attempting Garmin sync
test_credentials() {
    print_info "Testing credentials with Garmin Connect..."
    echo ""
    
    load_credentials
    
    # Try a minimal sync
    cd "$SCRIPT_DIR/.."
    
    print_info "Attempting to authenticate with Garmin..."
    echo ""
    print_warning "If Garmin sends MFA code to your email, you'll be prompted"
    echo ""
    
    # Ask for MFA if needed
    read -p "Did you receive an MFA code via email? (y/n): " NEED_MFA
    if [[ "$NEED_MFA" =~ ^[Yy]$ ]]; then
        read -p "Enter MFA code: " MFA_CODE
        export GARMIN_MFA_CODE="$MFA_CODE"
    fi
    
    # Use the sync script with --activities --latest 1 day
    GARMIN_USER="$GARMIN_EMAIL" \
    GARMIN_PASSWORD="$GARMIN_PASSWORD" \
    GARMIN_MFA_CODE="${GARMIN_MFA_CODE:-}" \
    ./scripts/garmindb_sync_latest.sh --test 2>&1 | head -20
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "Credentials are valid!"
    else
        print_error "Authentication failed. Check your credentials or MFA code."
    fi
    echo ""
}

# Usage
usage() {
    cat << EOF
Garmin AI Coach - Credential Manager

Usage: $0 <command>

Commands:
  save     Save/encrypt Garmin credentials
  update   Update existing credentials
  load     Load credentials into environment (for scripts)
  show     Show credential info (masked)
  test     Test credentials with Garmin Connect
  delete   Delete encrypted credentials
  help     Show this help

Examples:
  $0 save                    # First-time setup
  $0 show                    # Check stored credentials
  $0 test                    # Verify credentials work
  
  # Use in scripts:
  source <($0 load)          # Load credentials as environment variables
  echo \$GARMIN_EMAIL         # Now available

Security:
  - Credentials encrypted with AES-256-CBC
  - 100,000 PBKDF2 iterations
  - Master password never stored
  - File permissions: 600 (owner only)
  - Location: $CRED_FILE

EOF
}

# Main
case "${1:-help}" in
    save)
        save_credentials
        ;;
    update)
        update_credentials
        ;;
    load)
        load_credentials
        echo "export GARMIN_EMAIL='$GARMIN_EMAIL'"
        echo "export GARMIN_PASSWORD='$GARMIN_PASSWORD'"
        ;;
    show)
        show_credentials
        ;;
    test)
        test_credentials
        ;;
    delete)
        delete_credentials
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        usage
        exit 1
        ;;
esac
