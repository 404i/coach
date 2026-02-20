# GitHub Publication Checklist

Final checklist before publishing Garmin AI Coach to GitHub with Docker support.

## ✅ Repository Preparation

### Files Created/Updated
- [x] `.gitignore` - Enhanced to exclude all sensitive data
- [x] `LICENSE` - MIT License with GarminDB GPL notice
- [x] `README.md` - Completely updated with Docker instructions, badges, API reference
- [x] `CONTRIBUTING.md` - Comprehensive contribution guidelines
- [x] `DOCKER_QUICKSTART.md` - Quick Docker reference
- [x] `DOCKER_DEPLOYMENT.md` - Full Docker deployment guide
- [x] `Dockerfile` - Multi-stage build with GarminDB support
- [x] `docker-compose.personal.yml` - Personal deployment (with your data)
- [x] `docker-compose.shareable.yml` - Clean deployment for distribution
- [x] `docker-setup.sh` - One-command setup script (executable)
- [x] `.dockerignore` - Optimized Docker build context
- [x] `.github/workflows/docker-publish.yml` - CI/CD pipeline

## 🔒 Security Verification

### Before Committing (CRITICAL!)
- [ ] **No personal data in git history**
  ```bash
  # Check for sensitive files
  git status
  git ls-files | grep -E '\.(db|json)$'
  ```

- [ ] **No credentials committed**
  ```bash
  # Search for potential credentials
  git log --all --full-history -- '*garmin*' '*password*' '*.env'
  ```

- [ ] **Clean data directory**
  ```bash
  # Verify .gitignore working
  ls -la data/
  ls -la data/garmin/
  # Should show no .db files or coach_mcp_store.json tracked
  ```

- [ ] **Environment files not tracked**
  ```bash
  git ls-files | grep -E '\.env$'
  # Should return nothing
  ```

### Files That Should NEVER Be Committed
- ❌ `data/coach_mcp_store.json` (personal training data)
- ❌ `data/garmin/HealthData/**/*.db` (GarminDB databases)
- ❌ `.env` or `.env.local` (credentials)
- ❌ `.garth/` (Garmin auth tokens)
- ❌ Screenshots with personal data
- ❌ Any files containing your email, name, or training data

## 🐳 Docker Testing

### Build Tests
- [ ] **Personal setup builds**
  ```bash
  docker-compose -f docker-compose.personal.yml build
  ```

- [ ] **Shareable setup builds**
  ```bash
  docker-compose -f docker-compose.shareable.yml build
  ```

### Functionality Tests
- [ ] **Health endpoint responds**
  ```bash
  ./docker-setup.sh shareable
  curl http://localhost:8080/api/health
  # Should return: {"status":"ok","timestamp":"..."}
  ```

- [ ] **MCP server starts**
  ```bash
  docker ps | grep mcp
  # Should show container running
  ```

- [ ] **Data import works (if GarminDB available)**
  ```bash
  docker-compose exec coach \
    python3 /app/scripts/import_garmindb_to_coach.py \
    --profile-id test --latest-days 7 --dry-run
  ```

## 📝 Documentation Review

### Update These Before Publishing
- [ ] **README.md badges** - Replace `YOUR_USERNAME` with actual GitHub username:
  - Line 3: Docker Build badge
  - Line 5: Docker Pulls badge

- [ ] **CONTRIBUTING.md links** - Update repository URLs:
  - Search for `ORIGINAL_OWNER` and replace
  - Search for `OWNER/coach` and replace

- [ ] **GitHub Actions workflow** - Verify registry settings:
  - `.github/workflows/docker-publish.yml`
  - Confirm `REGISTRY: ghcr.io` and `IMAGE_NAME: ${{ github.repository }}`

### Documentation Completeness
- [x] Installation instructions clear
- [x] Docker deployment documented
- [x] API reference available
- [x] Security warnings prominent
- [x] Contributing guidelines present
- [x] License file exists

## 🚀 Initial Commit & Push

### 1. Initialize Repository (if new)
```bash
# If not already a git repo
git init

# Verify remote (if cloning from your fork)
git remote -v
```

### 2. Stage Files
```bash
# Add all files (gitignore will exclude sensitive data)
git add .

# Review what's being staged
git status

# CRITICAL: Verify no sensitive files
git status | grep -E '\.(db|json)$|\.env'
# Should show only .env.example, not .env
```

### 3. First Commit
```bash
git commit -m "feat: initial commit with Docker support

- REST API with activity verification, stats, workouts, help endpoints
- Docker deployment (personal and shareable setups)
- GarminDB integration with VO2 max, activity metrics, daily data
- Claude Desktop MCP server integration
- Comprehensive documentation
- CI/CD pipeline with GitHub Actions
"
```

### 4. Create GitHub Repository
- Go to https://github.com/new
- Repository name: `coach` or `garmin-ai-coach`
- Description: "AI-powered training coach with GarminDB integration and Docker support"
- Public or Private (your choice)
- **Do NOT initialize with README** (we already have one)

### 5. Push to GitHub
```bash
# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/coach.git

# Push main branch
git branch -M main
git push -u origin main
```

## 🏷️ Release Tagging

### Create First Release
```bash
# Tag the initial release
git tag -a v1.0.0 -m "Release v1.0.0 - Docker deployment ready

Features:
- Activity verification system
- Data freshness tracking
- Training readiness breakdown
- Enhanced GarminDB import
- Docker deployment
- Claude Desktop integration
"

# Push tags
git push origin --tags
```

## 📦 GitHub Container Registry

### Enable GHCR
1. Go to repository Settings → Actions → General
2. Set "Workflow permissions" to "Read and write permissions"
3. Save

### Verify Auto-Publishing
After pushing a tag, GitHub Actions will:
1. Build Docker image
2. Run tests
3. Publish to ghcr.io/YOUR_USERNAME/coach:v1.0.0
4. Also tag as `:latest`

Check: https://github.com/YOUR_USERNAME/coach/pkgs/container/coach

## 📋 Repository Settings

### GitHub Settings to Configure
- [ ] **Description**: "AI-powered training coach with GarminDB integration"
- [ ] **Topics**: `garmin`, `training`, `ai-coach`, `docker`, `mcp`, `fitness`, `garmindb`
- [ ] **About**: Add website URL (if applicable)
- [ ] **Wiki**: Enable if you want community contributions
- [ ] **Issues**: Enable for bug reports
- [ ] **Discussions**: Enable for community Q&A

### Branch Protection (Optional)
For `main` branch:
- [ ] Require pull request reviews
- [ ] Require status checks (CI/CD)
- [ ] Require conversation resolution

## 📢 Announcement

### README Updates After Publishing
```bash
# Update badge URLs with actual username
sed -i '' 's/YOUR_USERNAME/actualusername/g' README.md
git commit -am "docs: update badges with actual username"
git push
```

### Share With Community
Once published, consider sharing:
- [ ] Reddit: r/running, r/cycling, r/triathlon
- [ ] Garmin Forums
- [ ] Claude Desktop community
- [ ] Hacker News (if it gains traction)

## 🔍 Post-Publication Verification

### Within 5 minutes of push:
- [ ] CI/CD pipeline runs successfully
- [ ] Docker image published to GHCR
- [ ] README displays correctly
- [ ] Links all work

### Within 24 hours:
- [ ] Security scan completes (no critical issues)
- [ ] Docker image can be pulled: `docker pull ghcr.io/YOUR_USERNAME/coach:latest`
- [ ] Someone else can follow setup instructions successfully

## 🛡️ Ongoing Maintenance

### Regular Tasks
- [ ] Monitor GitHub Issues
- [ ] Review Pull Requests
- [ ] Update dependencies monthly
- [ ] Re-run security scans
- [ ] Update documentation as needed

### Security Updates
```bash
# Check for vulnerabilities
npm audit
docker scan ghcr.io/YOUR_USERNAME/coach:latest

# Update dependencies
npm update
cd backend && npm update
```

## 📊 Success Metrics

Track these to measure adoption:
- GitHub stars
- Docker pulls
- Issues opened/closed
- Contributors
- Forks

---

## Final Pre-Commit Command

Run this ONE MORE TIME before initial push:

```bash
# Ensure no sensitive data
echo "=== Checking for sensitive files ==="
git status --short | grep -E '\.(db|json)$|\.env$|garmin|password'

if [ $? -eq 0 ]; then
    echo "❌ STOP! Sensitive files detected. Review and add to .gitignore"
    exit 1
else
    echo "✅ No sensitive files detected"
fi

# Verify .gitignore is working
echo "=== Files that will be committed ==="
git ls-files | head -20
echo "..."
git ls-files | wc -l
echo "total files"

# Check Docker builds
echo "=== Testing Docker build ==="
docker-compose -f docker-compose.shareable.yml build --no-cache

if [ $? -eq 0 ]; then
    echo "✅ Docker build successful"
else
    echo "❌ Docker build failed"
    exit 1
fi

echo ""
echo "🎉 Ready to commit and push!"
```

---

**Once this checklist is complete, your repository is ready for GitHub!** 🚀
