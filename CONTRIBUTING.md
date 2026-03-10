# Contributing to Garmin AI Coach

Thank you for your interest in contributing to the Garmin AI Coach project! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project follows a standard Code of Conduct. Be respectful, inclusive, and professional in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/coach.git
   cd coach
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/coach.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.8+
- Docker (for containerized development)
- GarminDB installed and configured

### Local Development

```bash
# Install Node.js dependencies
npm install
cd backend && npm install && cd ..

# Install Python dependencies for GarminDB
cd vendor/GarminDB
pip3 install -r requirements.txt
cd ../..

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Start backend API
cd backend && npm start

# In another terminal, start MCP server (optional)
node mcp/coach-mcp-server.js
```

### Docker Development

```bash
# Personal setup (with your data)
docker compose -f docker-compose.personal.yml up -d

# Shareable setup (clean)
docker compose -f docker-compose.shareable.yml up -d

# View logs
docker compose -f docker-compose.personal.yml logs -f
```

## How to Contribute

### Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/OWNER/coach/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, Docker version)
   - Logs or screenshots if applicable

**⚠️ Never include personal data in bug reports!**
- No screenshots with your actual training data
- No Garmin credentials
- No database files

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and use case
3. Explain why it would benefit users
4. Provide examples if possible

### Contributing Code

1. **Pick an issue** or create one to discuss your change
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following coding standards
4. **Test thoroughly** (see Testing section)
5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add training readiness breakdown"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

## Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] All tests pass
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] No sensitive data in commits
- [ ] Commits are clear and atomic

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How did you test this?

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed
- [ ] Commented complex code
- [ ] Documentation updated
- [ ] No warnings generated
- [ ] Tests added/updated
- [ ] Tests pass
```

### Review Process

1. Maintainer reviews code
2. CI/CD runs automated tests
3. Security scan performed
4. Feedback provided if changes needed
5. Once approved, maintainer merges

## Coding Standards

### JavaScript/Node.js

```javascript
// Use const/let, not var
const athleteProfile = getProfile(id);

// Async/await over callbacks
async function fetchStats(email) {
  const stats = await statsService.getCurrentStats(email);
  return stats;
}

// Clear function names
function calculateTrainingReadinessScore(metrics) {
  // Implementation
}

// Comments for complex logic
// Calculate TSB using Banister model:
// TSB = Fitness - Fatigue
```

### Python

```python
# Follow PEP 8
def import_garmindb_data(profile_id, days=30):
    """Import GarminDB data into coach store.
    
    Args:
        profile_id: Unique athlete identifier
        days: Number of days to import
    
    Returns:
        dict: Import summary with counts
    """
    pass
```

### File Organization

```
backend/
  src/
    routes/          # API endpoints
    services/        # Business logic
    middleware/      # Express middleware
    utils/           # Utility functions
  tests/             # Test files
```

### Naming Conventions

- **Files**: `kebab-case.js` (activity-verification.js)
- **Functions**: `camelCase` (calculateReadinessScore)
- **Classes**: `PascalCase` (ActivityService)
- **Constants**: `UPPER_SNAKE_CASE` (MAX_TRAINING_LOAD)
- **Database fields**: `snake_case` (training_readiness_score)

## Testing

### Running Tests

```bash
# Backend tests
cd backend && npm test

# Integration tests
./test-suite.js

# Docker health check
curl http://localhost:8080/api/health
```

### Writing Tests

```javascript
describe('Activity Verification', () => {
  it('should detect activity gaps', async () => {
    const result = await activityVerification.getActivityContext(email);
    expect(result.days_since_last_activity).toBeGreaterThan(0);
  });
});
```

### Test Coverage

- Aim for 80%+ coverage on business logic
- Test happy paths and edge cases
- Mock external dependencies (GarminDB, LLMs)

## Documentation

### Code Comments

- **Why**, not **what** the code does
- Complex algorithms explained
- TODO/FIXME marked clearly

### API Documentation

Update [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for any API changes:

```markdown
### GET /api/new-endpoint

**Description:** What it does

**Parameters:**
- `param1` (string) - Description

**Response:**
```json
{
  "field": "value"
}
```
```

### User-Facing Docs

Update relevant markdown files:
- `README.md` - Main overview and quick start
- `DOCKER_DEPLOYMENT.md` - Docker instructions
- `TESTING_INSTRUCTIONS.md` - Testing guide

## Security Considerations

### Never Commit

- Credentials (Garmin, API keys)
- Personal training data
- Database files
- `.env` files

### Sensitive Code Changes

If changing authentication or data handling:
1. Review [SECURITY.md](SECURITY.md)
2. Highlight in PR description
3. Request security review

## Development Workflow

### Branch Strategy

- `main` - Stable, production-ready
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation only

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add activity verification service
fix: correct TSB calculation formula
docs: update Docker deployment guide
test: add readiness score tests
refactor: simplify data freshness middleware
chore: update dependencies
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Merge into your local main
git checkout main
git merge upstream/main

# Push to your fork
git push origin main
```

## Community

- **Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas
- **Pull Requests**: Code contributions

## Questions?

If you have questions not covered here:
1. Check existing documentation
2. Search [Issues](https://github.com/OWNER/coach/issues)
3. Open a new discussion/issue

## License

By contributing, you agree that your contributions will be licensed under the project's license (see [LICENSE](LICENSE)).

---

**Thank you for contributing to Garmin AI Coach!** 🏃‍♂️🚴‍♀️💪
