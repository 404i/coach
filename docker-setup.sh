#!/bin/bash
# Garmin AI Coach - Docker Setup Script

set -e

echo "🏃 Garmin AI Coach - Docker Setup"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if running with personal or shareable setup
SETUP_TYPE="${1:-personal}"

if [ "$SETUP_TYPE" != "personal" ] && [ "$SETUP_TYPE" != "shareable" ]; then
    print_error "Invalid setup type. Use 'personal' or 'shareable'"
    echo "Usage: $0 [personal|shareable]"
    exit 1
fi

echo "Setup type: $SETUP_TYPE"
echo ""

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_success "Docker found"

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_success "Docker Compose found"

# Create necessary directories
print_info "Creating directories..."
mkdir -p data logs
print_success "Directories created"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    print_info "Creating .env file..."
    cat > .env << EOF
# Garmin AI Coach Configuration
NODE_ENV=production

# LM Studio URL (for local LLM)
LM_STUDIO_URL=http://host.docker.internal:1234/v1

# OpenWeather API Key (optional)
OPENWEATHER_API_KEY=

# Timezone
TZ=$(date +%Z)

# Profile ID
PROFILE_ID=${PROFILE_ID:-athlete-1}

# GarminDB Path (for personal setup)
GARMINDB_PATH=${HOME}/HealthData
EOF
    print_success ".env file created"
else
    print_info ".env file already exists, skipping..."
fi

# Build and start containers based on setup type
echo ""
print_info "Building Docker image..."
if [ "$SETUP_TYPE" == "personal" ]; then
    docker-compose -f docker-compose.personal.yml build
    print_success "Personal setup built"
    
    echo ""
    print_info "Starting containers..."
    docker-compose -f docker-compose.personal.yml up -d
    
    # Import existing data
    echo ""
    print_info "Importing GarminDB data..."
    docker-compose -f docker-compose.personal.yml exec coach \
        python3 /app/scripts/import_garmindb_to_coach.py \
        --profile-id "${PROFILE_ID:-test-athlete-1}" \
        --latest-days 30
    print_success "Data imported"
    
else
    docker-compose -f docker-compose.shareable.yml build
    print_success "Shareable setup built"
    
    echo ""
    print_info "Starting containers..."
    docker-compose -f docker-compose.shareable.yml up -d
    
    echo ""
    print_info "To import GarminDB data, first sync your Garmin data:"
    echo "  1. Set up GarminDB on your machine"
    echo "  2. Run: docker-compose -f docker-compose.shareable.yml exec coach \\"
    echo "          python3 /app/scripts/import_garmindb_to_coach.py \\"
    echo "          --profile-id YOUR_PROFILE_ID --latest-days 30"
fi

# Wait for health check
echo ""
print_info "Waiting for services to be healthy..."
sleep 10

# Check if backend is running
if curl -s http://localhost:8080/api/health > /dev/null; then
    print_success "Backend API is running at http://localhost:8080"
else
    print_error "Backend API is not responding. Check logs: docker-compose logs coach"
fi

# MCP Server info
if docker ps | grep -q "garmin-coach-mcp"; then
    print_success "MCP Server is running at http://localhost:3001"
    echo ""
    print_info "To connect Claude Desktop, add this to your claude_desktop_config.json:"
    echo '  "coach-mcp": {'
    echo '    "command": "docker",'
    echo '    "args": ["exec", "-i", "garmin-coach-mcp-'${SETUP_TYPE}'", "node", "/app/mcp/server.js"]'
    echo '  }'
fi

echo ""
echo "=================================="
print_success "Setup complete!"
echo ""
echo "📊 API:     http://localhost:8080"
echo "🤖 MCP:     http://localhost:3001"
echo ""
echo "Commands:"
echo "  Start:  docker-compose -f docker-compose.$SETUP_TYPE.yml up -d"
echo "  Stop:   docker-compose -f docker-compose.$SETUP_TYPE.yml down"
echo "  Logs:   docker-compose -f docker-compose.$SETUP_TYPE.yml logs -f"
echo ""
