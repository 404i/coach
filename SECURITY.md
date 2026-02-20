# Security Guidelines

## ⚠️ IMPORTANT: This application is for LOCAL DEVELOPMENT ONLY

**DO NOT deploy this application to production or expose it to the internet without implementing the security measures listed below.**

## Critical Security Issues

### 1. Authentication & Authorization
- **Status**: ❌ Not Implemented
- **Risk**: Anyone with network access can trigger Garmin syncs and access data
- **Required**: 
  - Add user authentication (JWT, OAuth, or session-based)
  - Implement API key authentication for MCP server
  - Add authorization checks on all endpoints

### 2. HTTPS/TLS
- **Status**: ❌ Not Implemented (HTTP only)
- **Risk**: Passwords transmitted in plaintext over the network
- **Required**:
  - Use HTTPS for all communications
  - Implement certificate management
  - Redirect HTTP to HTTPS

### 3. Credential Management
- **Status**: ⚠️ Partial (passwords not persisted, but transmitted)
- **Risk**: Garmin credentials exposed in API calls and shell commands
- **Required**:
  - Use environment variables or secure vault (HashiCorp Vault, AWS Secrets Manager)
  - Never log passwords or include in error messages
  - Use password file approach instead of inline passwords

### 4. Input Validation
- **Status**: ⚠️ Partial (basic validation added)
- **Risk**: Potential injection attacks, path traversal
- **Required**:
  - Validate all user inputs at API boundaries
  - Sanitize file paths and shell arguments
  - Use parameterized queries for database operations

### 5. CORS Configuration
- **Status**: ⚠️ Development-only (localhost)
- **Risk**: Cross-origin attacks if exposed publicly
- **Required**:
  - Configure strict CORS policies for production
  - Only allow trusted origins

### 6. Rate Limiting
- **Status**: ❌ Not Implemented
- **Risk**: DoS attacks, brute force attempts
- **Required**:
  - Implement rate limiting on all endpoints
  - Add special limits for authentication endpoints
  - Consider implementing CAPTCHA for sensitive operations

### 7. CSRF Protection
- **Status**: ❌ Not Implemented
- **Risk**: Cross-site request forgery attacks
- **Required**:
  - Implement CSRF tokens for state-changing operations
  - Use SameSite cookie attributes

### 8. Data Storage
- **Status**: ⚠️ LocalStorage (browser) and JSON file (server)
- **Risk**: Unencrypted sensitive data, no access control
- **Required**:
  - Move to proper database with encryption at rest
  - Implement proper access controls
  - Consider data encryption for sensitive fields

## Security Best Practices

### For Development
1. **Never commit credentials** to version control
2. **.gitignore is configured** for common secrets (`.env`, `*.db`, config files)
3. **Use local environment variables** for testing with real credentials
4. **Run only on localhost** (127.0.0.1, not 0.0.0.0)

### For Production Deployment
1. **Use a reverse proxy** (nginx, Apache) with TLS termination
2. **Implement authentication middleware** before all routes
3. **Use secrets management** (AWS Secrets Manager, HashiCorp Vault, etc.)
4. **Enable logging and monitoring** with alerts for suspicious activity
5. **Regular security audits** and dependency updates
6. **Implement CSP headers** to prevent XSS
7. **Use helmet.js** or similar for security headers
8. **Database migration** from JSON file to PostgreSQL/MySQL with proper permissions
9. **Container security** if using Docker (non-root user, minimal base image)
10. **Regular backups** with encryption

## Known Vulnerabilities (Fixed)

### ✅ Path Traversal (Fixed)
- **Issue**: Weak path normalization allowed `../` sequences
- **Fix**: Enhanced validation with realpath checks and extension whitelist
- **File**: `scripts/coach_web_server.js`

### ✅ Type Coercion Bugs (Fixed)
- **Issue**: String comparisons on numeric values (pain scores)
- **Fix**: Explicit `Number()` conversion before comparisons
- **File**: `app.js`

### ✅ Timezone Bugs (Fixed)
- **Issue**: Local timezone used in date calculations causing cross-timezone errors
- **Fix**: Added 'Z' suffix for UTC in date parsing
- **File**: `app.js`

## Security Headers Implemented

Current headers (development only):
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Access-Control-Allow-Origin: http://127.0.0.1:* (localhost only)
```

Production should add:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## Reporting Security Issues

If you discover a security vulnerability:
1. **Do not** open a public issue
2. Contact the maintainer directly
3. Allow reasonable time for a fix before disclosure

## Security Checklist for Production

- [ ] Authentication implemented and tested
- [ ] HTTPS/TLS configured with valid certificates
- [ ] All credentials moved to secure vault
- [ ] Rate limiting configured
- [ ] CSRF protection enabled
- [ ] Input validation on all endpoints
- [ ] Security headers configured
- [ ] Database with encryption at rest
- [ ] Logging and monitoring in place
- [ ] Security audit completed
- [ ] Dependency scan (npm audit, Snyk, etc.)
- [ ] Penetration testing performed
- [ ] Backup and disaster recovery plan
- [ ] Incident response plan documented

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
