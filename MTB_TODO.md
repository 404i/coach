# MTB Integration - Implementation Checklist

## Phase 1: Trail Discovery (Week 1-2)

### Database Setup
- [ ] Create trails table migration
- [ ] Create trail_recommendations table
- [ ] Create indexes (location, difficulty, region)
- [ ] Seed with sample trail data

### Trailforks Integration
- [ ] Get Trailforks API key
- [ ] Create TrailforksService (backend/src/services/trailforks.js)
  - [ ] searchTrails(lat, lon, filters)
  - [ ] getTrailDetails(id)
  - [ ] getTrailConditions(id)
  - [ ] importRegionalTrails(region)
- [ ] Add error handling and rate limiting
- [ ] Cache trail data (24hr TTL)

### API Endpoints
- [ ] GET /api/trails/search
- [ ] GET /api/trails/:id
- [ ] GET /api/trails/recommended
- [ ] POST /api/trails/import-region

### Trail Recommendation Engine
- [ ] Create TrailRecommendationService
  - [ ] analyzeTrailFitness(trail, athlete)
  - [ ] calculateMatchScore(trail, athlete, conditions)
  - [ ] getRecommendedTrails(email, location)
- [ ] Integrate with existing fitness metrics (CTL, ATL, TSB)
- [ ] Factor in recovery score and HRV
- [ ] Weather-aware trail conditions

### MCP Tools
- [ ] search_mtb_trails - Location-based search
- [ ] get_trail_details - Detailed trail info
- [ ] get_recommended_trails - Smart recommendations

### Testing
- [ ] Test trail search with various filters
- [ ] Verify recommendation algorithm
- [ ] Check weather integration
- [ ] Load test with multiple regions

---

## Phase 2: Strava Integration (Week 3-4)

### Database Setup
- [ ] Create strava_connections table
- [ ] Create strava_activities table
- [ ] Add encryption for OAuth tokens
- [ ] Create indexes (profile_id, strava_id, date)

### Strava OAuth
- [ ] Register app on Strava
- [ ] Create StravaService (backend/src/services/strava.js)
  - [ ] initiateAuth(redirectUri)
  - [ ] handleAuthCallback(code)
  - [ ] refreshAccessToken(profileId)
  - [ ] revokeAccess(profileId)
- [ ] Implement token encryption/decryption
- [ ] Handle token expiration gracefully

### Activity Sync
- [ ] syncActivities(profileId, since)
- [ ] getActivityDetails(stravaId)
- [ ] parseActivityStreams(stravaId) - GPS, HR, power
- [ ] calculateTrainingLoad(activity)
- [ ] Auto-sync on schedule (daily)

### Trail-Activity Matching
- [ ] matchActivityToTrail(activityId)
  - [ ] GPS route matching algorithm
  - [ ] Location proximity check
  - [ ] Distance/elevation similarity
  - [ ] Confidence scoring
- [ ] Manual trail assignment option
- [ ] Bulk re-matching for historical data

### API Endpoints
- [ ] GET /api/strava/auth/init
- [ ] GET /api/strava/auth/callback
- [ ] POST /api/strava/auth/disconnect
- [ ] POST /api/strava/sync
- [ ] GET /api/strava/activities
- [ ] GET /api/trails/:id/attempts

### MCP Tools
- [ ] connect_strava - OAuth flow
- [ ] sync_strava_activities - Manual sync
- [ ] get_trail_performance - Stats on specific trail

### Testing
- [ ] Test OAuth flow end-to-end
- [ ] Verify activity import accuracy
- [ ] Test GPS matching algorithm
- [ ] Check auto-sync schedule

---

## Phase 3: Intelligent Features (Week 5-6)

### ML-Based Recommendations
- [ ] Collect training data (athlete fitness → trail performance)
- [ ] Build skill level assessment model
- [ ] Create trail difficulty progression path
- [ ] Implement "next challenge" suggestions

### Advanced Matching
- [ ] Factor HRV into trail recommendations
- [ ] Adjust for overtraining (TSB < -30)
- [ ] Consider recent injuries
- [ ] Track skill progression over time

### Route Generation
- [ ] Multi-trail loop builder
- [ ] Optimize for target duration
- [ ] Balance climbing/descending
- [ ] Avoid overcrowded trails

### Trail Conditions Intelligence
- [ ] Real-time condition reports
- [ ] Soil moisture predictions
- [ ] Crowdsourced updates
- [ ] "Best time to ride" algorithm

### Performance Analytics
- [ ] Track PRs on trails
- [ ] Trend analysis (improving/plateau)
- [ ] Compare to Strava segments
- [ ] Identify strengths/weaknesses (climber vs descender)

---

## Phase 4: Polish & Social (Week 7-8)

### UI/UX
- [ ] Trail detail pages with photos
- [ ] Interactive trail maps
- [ ] Condition status badges
- [ ] Strava connection status dashboard

### Social Features
- [ ] Trail challenges and goals
- [ ] Group ride planning
- [ ] Trail reviews and ratings
- [ ] Photo uploads

### Notifications
- [ ] Trail condition changes
- [ ] New recommended trails weekly
- [ ] PR celebrations
- [ ] Group ride invites

### Documentation
- [ ] User guide for Strava connection
- [ ] Trail difficulty rating explanation
- [ ] Privacy policy update
- [ ] API documentation

---

## Configuration Required

### Environment Variables
```bash
# Trailforks API
TRAILFORKS_API_KEY=your_key_here
TRAILFORKS_APP_ID=your_app_id

# Strava OAuth
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_secret
STRAVA_REDIRECT_URI=http://localhost:8080/api/strava/auth/callback

# Encryption
STRAVA_TOKEN_ENCRYPTION_KEY=32_byte_random_key

# Feature flags
ENABLE_MTB_FEATURES=true
ENABLE_STRAVA_SYNC=true
```

### API Keys to Obtain
1. Trailforks API: https://www.trailforks.com/about/api/
2. Strava App: https://www.strava.com/settings/api

---

## Quick Start (Minimal Viable Product)

**Goal**: Basic trail recommendations in 2 weeks

### Week 1
- [ ] Database schema (trails, trail_recommendations)
- [ ] Trailforks service (search + details)
- [ ] Trail recommendation algorithm (fitness-based)
- [ ] API endpoints (search, recommended)
- [ ] 2 MCP tools (search, recommended)

### Week 2
- [ ] Strava OAuth setup
- [ ] Activity sync (basic import)
- [ ] Trail-activity matching (simple GPS proximity)
- [ ] Performance tracking (attempts, PRs)
- [ ] 2 more MCP tools (connect, performance)

**Deliverable**: Athletes can discover trails, get recommendations based on fitness, connect Strava, and track performance on trails.

---

## Success Criteria

### Technical
- [ ] <500ms trail search response time
- [ ] >80% accuracy in trail-activity matching
- [ ] Zero token leaks or security issues
- [ ] Handle 1000+ trails per region

### User Experience
- [ ] <2 minutes to connect Strava
- [ ] Relevant recommendations (user feedback)
- [ ] Accurate trail difficulty ratings
- [ ] Useful condition information

### Engagement
- [ ] >50% of MTB riders connect Strava
- [ ] >5 trail searches per user per week
- [ ] >70% recommendation acceptance rate
- [ ] Users try 2+ new trails per month

---

## Risk Mitigation

### API Rate Limits
- **Risk**: Exceed Trailforks/Strava limits
- **Mitigation**: Aggressive caching, batch operations, upgrade to paid tier if needed

### GPS Matching Accuracy
- **Risk**: Incorrect trail-activity matching
- **Mitigation**: Confidence scoring, manual override, machine learning refinement

### Data Privacy
- **Risk**: Strava OAuth token leakage
- **Mitigation**: Encryption at rest, secure token refresh, audit logging

### Trail Data Staleness
- **Risk**: Outdated trail conditions
- **Mitigation**: 24hr cache, crowdsource updates, weather correlation

---

## Estimated Effort

### Development Time
- Phase 1 (Trail Discovery): 40 hours
- Phase 2 (Strava Integration): 50 hours
- Phase 3 (Intelligent Features): 60 hours
- Phase 4 (Polish & Social): 40 hours
- **Total**: ~190 hours (~5 weeks full-time)

### Testing Time
- Unit tests: 20 hours
- Integration tests: 15 hours
- User acceptance testing: 10 hours
- **Total**: 45 hours

### Grand Total: ~235 hours (~6 weeks)

---

## Next Action

**Immediate**: Create database migration for trails table and start Trailforks integration.

```bash
# Start Phase 1
cd backend/src/db/migrations
touch 20260219_add_trails_tables.js

# Get API keys
# 1. Visit https://www.trailforks.com/about/api/
# 2. Register app and get API key
# 3. Add to backend/.env
```
