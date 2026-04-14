# Simplified Dockerfile for Garmin AI Coach Backend
# Frontend is optional - can be built separately or served statically

FROM node:22-alpine

WORKDIR /app

# Apply latest Alpine OS security patches before anything else
RUN apk upgrade --no-cache

# Install runtime system packages
RUN apk add --no-cache \
    python3 \
    sqlite \
    bash

# Install build-time-only tools in a named virtual package set so they can
# be cleanly removed after compilation (reduces final image attack surface).
RUN apk add --no-cache --virtual .build-deps \
    py3-pip \
    git \
    build-base \
    python3-dev && \
    pip3 install --no-cache-dir garth --break-system-packages

# Copy backend package files and install Node dependencies.
# sqlite3 is compiled from source here (requires build-base).
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production && \
    npm rebuild sqlite3 --build-from-source

# Copy GarminDB vendor code and install Python dependencies
COPY vendor/GarminDB /app/vendor/GarminDB
RUN cd /app/vendor/GarminDB && \
    pip3 install --no-cache-dir -r requirements.txt --break-system-packages && \
    pip3 install --no-cache-dir --upgrade garth --break-system-packages

# Remove build-time tools — compilers, headers, and git are not needed at runtime
RUN apk del .build-deps

# Create unprivileged user to run the application
RUN addgroup -S app && adduser -S app -G app

# Copy backend source
COPY backend/ ./backend/

# Copy MCP server
COPY mcp/ /app/mcp/

# Copy import scripts
COPY scripts/ /app/scripts/

# Copy schemas
COPY schemas/ /app/schemas/

# Create data and logs directories and transfer ownership to the app user
RUN mkdir -p /app/data /app/logs /app/data/garmin/HealthData/DBs /app/backend/data \
    && chown -R app:app /app

# Drop root privileges
USER app

# Set Python path for garmin-sync service
ENV PYTHON_PATH=/usr/bin/python3

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

EXPOSE 8080

WORKDIR /app/backend

CMD ["node", "src/server.js"]
