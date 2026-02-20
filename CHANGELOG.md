# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-01-17 - Modularization Release

### Added
- **Architecture Refactoring** - Extracted business logic into reusable modules:
  - `engine/recovery-scoring.js` (265 lines) - Recovery algorithm with `scoreRecovery()`, `countHardDays()`, `computeConfidence()`
  - `engine/gap-detection.js` (115 lines) - Training gap detection with `detectGaps()`
  - `engine/workout-planning.js` (230 lines) - Workout selection with `chooseWorkout()`, `buildPlanA()`, `buildPlanB()`
  - `storage/local-storage.js` (210 lines) - Storage abstraction layer with all localStorage operations
  - `utils/formatters.js` (180 lines) - Utility functions for formatting, parsing, and validation

### Changed
- **app.js reduced from 1,209 to 1,075 lines** (11% reduction, -134 lines)
  - Removed all duplicate function definitions
  - Now imports from modules via `window.CoachStorage` and `window.CoachUtils`
  - Replaced all direct `localStorage.setItem()` calls with storage module functions
  - Cleaner separation between UI logic and business logic
  
- **index.html** - Added script tags to load modules in correct order before app.js
- **package.json** - Removed `"type": "module"` to maintain CommonJS compatibility

### Removed
- Duplicate functions in app.js (now in modules):
  - Storage functions (loadProfile, saveProfile, upsertDaily, etc.)
  - Utility functions (parseCsv, toISODate, round, clamp, capitalize, etc.)
  - Recovery scoring logic (now shared between browser and server)
  - Gap detection logic (now shared between browser and server)
  - Workout planning logic (now shared between browser and server)

### Documentation
- `REFACTORING_PROGRESS.md` - Detailed progress report with metrics
- `REFACTORING_COMPLETE.md` - Summary and next steps
- `TESTING.md` - Comprehensive test plan and checklist

### Benefits
- ✅ Single source of truth for all business logic
- ✅ Modules work in both browser and Node.js
- ✅ Ready for unit testing
- ✅ Easier to maintain and debug
- ✅ Storage abstraction enables future database migration
- ✅ Consistent behavior across client and server

### Breaking Changes
- None - All functionality preserved, only internal organization changed

## [0.1.0] - 2025-01-17 - Initial Fixes

### Added
- **package.json** - Project dependency management and npm scripts
- **.gitignore** - Comprehensive gitignore for Node.js, Python, and sensitive files
- **constants.js** - Centralized constants for recovery scoring, gap detection, and training thresholds
- **validation.js** - Input validation utility module with comprehensive validators
- **SECURITY.md** - Security guidelines and best practices documentation
- **TODO.md** - Comprehensive refactoring roadmap and task list
- Security headers to web server (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- CORS configuration for localhost development
- Security warnings in code comments

### Fixed

#### Critical Bug Fixes
- **Timezone bug in date calculations** - Fixed `daysBetween()` function in `app.js` to use UTC (added 'Z' suffix)
  - Previously used local timezone which could cause incorrect day calculations across timezones
  - Impact: Affects lookback windows, hard day counting, and gap detection
  
- **Type coercion bug in pain scoring** - Added explicit `Number()` conversion for pain values in `app.js`
  - Previously compared strings instead of numbers (e.g., "7" >= 7 would work but "4" >= 7 would fail)
  - Impact: Could cause incorrect recovery state transitions and safety overrides

- **Null reference errors** - Added array and property existence checks in:
  - `detectGaps()` function - now checks if `day.activities` exists and is an array
  - `countHardDays()` function - validates activities array before processing
  - Impact: Prevents crashes when data is incomplete or malformed

#### Security Improvements
- **Path traversal protection** - Enhanced in `scripts/coach_web_server.js`
  - Added `realpath` check to prevent symlink attacks
  - Added file extension whitelist (only .html, .js, .css, .json, .ico)
  - Block any paths containing `..` or `~`
  - Impact: Prevents unauthorized file access

- **Input validation for Garmin sync** - Added `validateGarminSyncArgs()` function
  - Email format validation
  - MFA code format validation (6 digits)
  - Date format validation (MM/DD/YYYY)
  - Numeric range validation for timeouts and retries
  - Path traversal prevention for password file path
  - Impact: Prevents injection attacks and invalid configurations

### Changed
- Web server now includes comprehensive security warnings in comments
- Improved error messages for validation failures
- Enhanced input sanitization for user inputs

### Documentation
- Added security checklist for production deployment
- Created comprehensive TODO list for refactoring
- Documented known vulnerabilities and their fixes
- Added security best practices guide

## Notes

### Breaking Changes
None - all changes are backward compatible

### Migration Guide
No migration needed. All changes are internal improvements.

### Security Advisories

**⚠️ IMPORTANT: This application is for LOCAL DEVELOPMENT ONLY**

Do not deploy to production without implementing:
1. Authentication/authorization
2. HTTPS/TLS
3. Proper database (replace localStorage and JSON file)
4. Rate limiting
5. CSRF protection

See SECURITY.md for full details.

### Next Steps
See TODO.md for planned improvements:
- Module splitting for large files (app.js: 1209 lines, mcp/server.js: 2892 lines)
- Unit test coverage
- Database migration
- Authentication implementation
- API documentation
