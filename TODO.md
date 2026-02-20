# Refactoring TODO

## High Priority (Security & Stability)

### Authentication & Authorization
- [ ] Implement JWT or session-based authentication
- [ ] Add API key authentication for MCP endpoints
- [ ] Create middleware for auth checks
- [ ] Add user roles (admin, user, read-only)

### HTTPS/TLS
- [ ] Add HTTPS support to web server
- [ ] Generate/configure SSL certificates
- [ ] Implement certificate renewal process
- [ ] Force HTTPS redirect in production

### Database Migration
- [ ] Replace localStorage with SQLite/PostgreSQL
- [ ] Create database schema
- [ ] Add migration scripts
- [ ] Implement connection pooling
- [ ] Add proper indexing for queries

### Input Validation
- [x] Create validation utility module
- [ ] Add validation to all MCP tool handlers
- [ ] Validate all API endpoint inputs in web server
- [ ] Add JSON schema validation for complex objects
- [ ] Sanitize all user inputs

## Medium Priority (Code Quality)

### Refactoring Large Files
- [ ] Split app.js into modules:
  - [ ] `ui/profile-form.js` - Profile management UI
  - [ ] `ui/checkin-form.js` - Daily check-in UI
  - [ ] `ui/garmin-sync.js` - Garmin sync UI
  - [ ] `ui/chat.js` - Chat interface
  - [ ] `engine/recommendation.js` - Core recommendation logic
  - [ ] `engine/recovery-scoring.js` - Recovery score calculation
  - [ ] `engine/gap-detection.js` - Training gap detection
  - [ ] `storage/local-storage.js` - Storage abstraction

- [ ] Split mcp/server.js into modules:
  - [ ] `mcp/protocol/handler.js` - MCP protocol implementation
  - [ ] `mcp/tools/profile.js` - Profile management tools
  - [ ] `mcp/tools/daily.js` - Daily metrics tools
  - [ ] `mcp/tools/garmin.js` - Garmin sync tools
  - [ ] `mcp/tools/recommendation.js` - Recommendation tools
  - [ ] `mcp/tools/planning.js` - Activity planning tools
  - [ ] `mcp/tools/weather.js` - Weather integration
  - [ ] `mcp/tools/agent.js` - AI agent tools
  - [ ] `mcp/storage/store.js` - Data persistence
  - [ ] `mcp/integrations/lm-studio.js` - LM Studio client
  - [ ] `mcp/integrations/garmindb.js` - GarminDB integration

### Extract Shared Logic
- [ ] Create shared recommendation engine module
- [ ] Share between app.js and mcp/server.js
- [ ] Add unit tests for shared logic
- [ ] Document algorithms

### Constants Migration
- [x] Create constants.js
- [ ] Replace magic numbers in app.js with constants
- [ ] Replace magic numbers in mcp/server.js with constants
- [ ] Add JSDoc comments for constants

### Error Handling
- [ ] Create custom error classes
- [ ] Implement consistent error format
- [ ] Add error codes for client handling
- [ ] Improve error messages
- [ ] Add error logging/monitoring

## Testing

### Unit Tests
- [ ] Set up Jest or Mocha test framework
- [ ] Test recommendation engine (recovery scoring)
- [ ] Test gap detection logic
- [ ] Test date/time utilities
- [ ] Test validation functions
- [ ] Test data normalization
- [ ] Aim for >80% code coverage

### Integration Tests
- [ ] Test Garmin sync flow end-to-end
- [ ] Test MCP server tools
- [ ] Test web API endpoints
- [ ] Test LM Studio integration

### End-to-End Tests
- [ ] Set up Playwright or Cypress
- [ ] Test complete user workflows
- [ ] Test screenshot upload flow
- [ ] Test recommendation generation

## Documentation

### API Documentation
- [ ] Document all MCP tools with examples
- [ ] Document web API endpoints (OpenAPI/Swagger)
- [ ] Add request/response examples
- [ ] Document error responses

### Code Documentation
- [ ] Add JSDoc comments to all public functions
- [ ] Document data structures and schemas
- [ ] Add inline comments for complex logic
- [ ] Document configuration options

### User Documentation
- [ ] Create user guide
- [ ] Add troubleshooting section
- [ ] Document Garmin setup process
- [ ] Create FAQ

### Developer Documentation
- [ ] Create CONTRIBUTING.md
- [ ] Add architecture diagrams
- [ ] Document development workflow
- [ ] Add code style guide

## Performance

### Optimization
- [ ] Add caching for expensive calculations
- [ ] Implement cache invalidation strategy
- [ ] Add pagination for large datasets
- [ ] Optimize history queries (indexing, binary search)
- [ ] Profile application for bottlenecks

### Monitoring
- [ ] Add performance metrics
- [ ] Add request timing
- [ ] Monitor memory usage
- [ ] Add health check endpoints

## Features

### Rate Limiting
- [ ] Implement rate limiting middleware
- [ ] Configure limits per endpoint
- [ ] Add rate limit headers
- [ ] Add bypass for authenticated users

### Logging
- [ ] Set up structured logging (Winston, Pino)
- [ ] Add log levels (debug, info, warn, error)
- [ ] Log all API requests
- [ ] Add request ID tracing
- [ ] Configure log rotation

### Backup & Recovery
- [ ] Implement automatic backups
- [ ] Add export functionality
- [ ] Add import/restore functionality
- [ ] Test disaster recovery process

## DevOps

### Containerization
- [ ] Create Dockerfile
- [ ] Create docker-compose.yml
- [ ] Use non-root user
- [ ] Minimize image size
- [ ] Add health checks

### CI/CD
- [ ] Set up GitHub Actions or similar
- [ ] Run tests on every commit
- [ ] Add linting checks
- [ ] Add security scanning (npm audit, Snyk)
- [ ] Automate deployments

### Configuration Management
- [ ] Use environment variables for all config
- [ ] Create .env.example
- [ ] Document all configuration options
- [ ] Validate configuration on startup

## Completed ✅

- [x] Create package.json
- [x] Create .gitignore
- [x] Fix timezone bugs (UTC enforcement)
- [x] Fix type coercion bugs (explicit Number() conversion)
- [x] Add security warnings and documentation
- [x] Create SECURITY.md
- [x] Improve path traversal protection
- [x] Add security headers
- [x] Add input validation to web server
- [x] Add null/undefined checks for activities
- [x] Create constants.js with all thresholds
- [x] Create validation.js utility module
