#!/bin/bash
# Pre-publish verification script for GitHub

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

ERRORS=0
WARNINGS=0

print_header "GitHub Publication Verification"
echo ""

# Check 1: Sensitive files not tracked
print_header "1. Checking for sensitive files"
SENSITIVE_TRACKED=$(git ls-files | grep -E '\.(db|db-journal)$|^data/coach_mcp_store\.json$|^\.env$|^\.garth/' || true)
if [ -n "$SENSITIVE_TRACKED" ]; then
    print_error "Sensitive files are tracked by git:"
    echo "$SENSITIVE_TRACKED"
    ERRORS=$((ERRORS + 1))
else
    print_success "No sensitive files tracked"
fi

# Check if .env exists but not tracked
if [ -f .env ] && ! git ls-files --error-unmatch .env > /dev/null 2>&1; then
    print_success ".env exists but properly ignored"
elif [ -f .env ]; then
    print_error ".env file is tracked! Add it to .gitignore"
    ERRORS=$((ERRORS + 1))
fi

# Check personal data directory
if [ -d data/garmin/HealthData ]; then
    DB_COUNT=$(find data/garmin/HealthData -name "*.db" 2>/dev/null | wc -l)
    if [ $DB_COUNT -gt 0 ]; then
        GIT_DB_COUNT=$(git ls-files data/garmin/HealthData | grep "\.db$" | wc -l || echo 0)
        if [ $GIT_DB_COUNT -gt 0 ]; then
            print_error "GarminDB database files are tracked!"
            ERRORS=$((ERRORS + 1))
        else
            print_success "GarminDB files exist but properly ignored ($DB_COUNT databases)"
        fi
    fi
fi

echo ""

# Check 2: Required files present
print_header "2. Checking required files"
REQUIRED_FILES=(
    "README.md"
    "LICENSE"
    "CONTRIBUTING.md"
    "DOCKER_QUICKSTART.md"
    "DOCKER_DEPLOYMENT.md"
    "Dockerfile"
    "docker-compose.personal.yml"
    "docker-compose.shareable.yml"
    "docker-setup.sh"
    ".dockerignore"
    ".github/workflows/docker-publish.yml"
    ".gitignore"
    "backend/src/server.js"
    "mcp/server.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "$file"
    else
        print_error "$file missing"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# Check 3: Placeholder replacements
print_header "3. Checking for placeholders"
PLACEHOLDERS=$(grep -r "YOUR_USERNAME\|ORIGINAL_OWNER" --include="*.md" --include="*.yml" . 2>/dev/null || true)
if [ -n "$PLACEHOLDERS" ]; then
    print_warning "Found placeholders that should be replaced:"
    echo "$PLACEHOLDERS" | head -5
    echo "(This is OK if you'll replace them after first push)"
    WARNINGS=$((WARNINGS + 1))
else
    print_success "No placeholders found (or already replaced)"
fi

echo ""

# Check 4: Docker builds
print_header "4. Testing Docker builds"
print_info "Building shareable Docker image..."
if docker-compose -f docker-compose.shareable.yml build > /tmp/docker-build.log 2>&1; then
    print_success "Shareable Docker image builds successfully"
else
    print_error "Docker build failed! Check /tmp/docker-build.log"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 5: Git status
print_header "5. Checking git status"
if git rev-parse --git-dir > /dev/null 2>&1; then
    print_success "Git repository initialized"
    
    # Check for uncommitted changes
    UNCOMMITTED=$(git status --porcelain | wc -l)
    if [ $UNCOMMITTED -gt 0 ]; then
        print_info "You have $UNCOMMITTED uncommitted changes"
        git status --short | head -10
    else
        print_success "Working directory clean"
    fi
else
    print_warning "Not a git repository yet. Run: git init"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check 6: File permissions
print_header "6. Checking file permissions"
if [ -x docker-setup.sh ]; then
    print_success "docker-setup.sh is executable"
else
    print_error "docker-setup.sh is not executable. Run: chmod +x docker-setup.sh"
    ERRORS=$((ERRORS + 1))
fi

if [ -f scripts/garmindb_sync_latest.sh ] && [ -x scripts/garmindb_sync_latest.sh ]; then
    print_success "Garmin sync scripts are executable"
else
    print_warning "Some scripts may not be executable"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check 7: Documentation links
print_header "7. Checking documentation links"
if grep -q "DOCKER_QUICKSTART.md" README.md; then
    print_success "Docker documentation linked in README"
else
    print_error "Docker documentation not linked in README"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "CONTRIBUTING.md" README.md; then
    print_success "Contributing guide linked in README"
else
    print_error "Contributing guide not linked in README"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 8: Package files
print_header "8. Checking package configurations"
if [ -f package.json ]; then
    print_success "Root package.json exists"
fi

if [ -f backend/package.json ]; then
    print_success "Backend package.json exists"
fi

echo ""

# Summary
print_header "VERIFICATION SUMMARY"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 Perfect! Repository is ready for GitHub!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review staged files: git status"
    echo "  2. Commit: git commit -m 'feat: initial commit with Docker support'"
    echo "  3. Create GitHub repo at: https://github.com/new"
    echo "  4. Add remote: git remote add origin https://github.com/YOUR_USERNAME/coach.git"
    echo "  5. Push: git push -u origin main"
    echo ""
    echo "See GITHUB_PUBLISH_CHECKLIST.md for detailed steps"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Ready with $WARNINGS warning(s)${NC}"
    echo ""
    echo "Review warnings above. You can proceed if they're acceptable."
    echo "See GITHUB_PUBLISH_CHECKLIST.md for next steps"
    exit 0
else
    echo -e "${RED}❌ Not ready! Found $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Fix errors above before publishing to GitHub"
    echo "See GITHUB_PUBLISH_CHECKLIST.md for guidance"
    exit 1
fi
