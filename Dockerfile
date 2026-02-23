# Simplified Dockerfile for Garmin AI Coach Backend
# Frontend is optional - can be built separately or served statically

FROM node:20-alpine

WORKDIR /app

# Upgrade npm to get patched bundled dependencies (cross-spawn, minimatch, etc.)
RUN npm install -g npm@latest

# Install Python, SQLite, and build tools for GarminDB
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite \
    git \
    bash \
    build-base \
    python3-dev && \
    pip3 install --no-cache-dir garth --break-system-packages

# Copy backend package files
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production && \
    npm rebuild sqlite3 --build-from-source

# Copy GarminDB vendor code and install dependencies
COPY vendor/GarminDB /app/vendor/GarminDB
RUN cd /app/vendor/GarminDB && \
    pip3 install --no-cache-dir -r requirements.txt --break-system-packages && \
    pip3 install --no-cache-dir --upgrade garth --break-system-packages

# Copy backend source
COPY backend/ ./backend/

# Copy MCP server
COPY mcp/ /app/mcp/

# Copy import scripts
COPY scripts/ /app/scripts/

# Copy schemas
COPY schemas/ /app/schemas/

# Create data and logs directories
RUN mkdir -p /app/data /app/logs /app/data/garmin/HealthData/DBs /app/backend/data

# Set Python path for garmin-sync service
ENV PYTHON_PATH=/usr/bin/python3

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

EXPOSE 8080

WORKDIR /app/backend

CMD ["node", "src/server.js"]
