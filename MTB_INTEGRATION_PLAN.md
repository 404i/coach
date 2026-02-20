# Trailforks & Strava MTB Integration Plan

## Overview
Integrate Trailforks (trail discovery) and Strava (activity tracking) to provide intelligent mountain bike trail recommendations based on athlete fitness, conditions, and preferences.

---

## API Capabilities Analysis

### Trailforks API
**Documentation**: https://www.trailforks.com/about/api/

**Key Endpoints**:
- `/trails` - Search trails by location, difficulty, length
- `/trail/{id}` - Detailed trail info (length, elevation, difficulty, features)
- `/regions` - Geographic regions with trail counts
- `/conditions` - Real-time trail conditions (wet, dry, snow)
- `/reports` - User condition reports
- `/photos` - Trail photos and media

**Trail Metadata**:
- **Difficulty**: Easy (green), Intermediate (blue), Advanced (black), Expert (double black)
- **Physical Rating**: 1-5 scale (fitness requirement)
- **Technical Rating**: 1-5 scale (skill requirement)
- **Length**: Meters/kilometers
- **Elevation Gain**: Meters
- **Trail Type**: Singletrack, doubletrack, downhill, XC, enduro
- **Features**: Jumps, drops, berms, technical sections
- **Conditions**: Current status (dry, wet, muddy, snow)

**Rate Limits**: 
- Free tier: 100 requests/day
- Paid: 10,000 requests/day ($99/month)

### Strava API
**Documentation**: https://developers.strava.com/

**Key Endpoints**:
- `/athlete` - Athlete profile
- `/athlete/activities` - Activity history
- `/activities/{id}` - Detailed activity data
- `/activities/{id}/streams` - GPS, heartrate, power streams
- `/segments` - Popular segments (climbs, descents)
- `/segment/{id}/leaderboard` - Competitive rankings

**Activity Data**:
- GPS route (lat/lon stream)
- Heart rate zones
- Power data (if available)
- Elevation profile
- Segment performance
- Kudos/comments
- Gear used

**Rate Limits**:
- 100 requests per 15 minutes
- 1,000 requests per day

---

## Data Models

### Trail Schema
```javascript
// trails table
{
  trail_id: integer (PK),
  trailforks_id: integer (unique),
  name: string,
  region: string,
  country: string,
  
  // Location
  latitude: decimal,
  longitude: decimal,
  trailhead_address: text,
  
  // Difficulty ratings
  difficulty: enum('green', 'blue', 'black', 'double_black'),
  physical_rating: integer (1-5),
  technical_rating: integer (1-5),
  
  // Trail metrics
  length_km: decimal,
  elevation_gain_m: integer,
  elevation_loss_m: integer,
  duration_estimate_min: integer,
  
  // Trail characteristics
  trail_type: string[], // ['singletrack', 'xc', 'enduro']
  features: string[], // ['jumps', 'drops', 'technical', 'flow']
  surface: string, // 'dirt', 'rock', 'mixed'
  
  // Conditions
  current_condition: enum('dry', 'wet', 'muddy', 'snow', 'closed'),
  condition_updated: timestamp,
  condition_reports: jsonb,
  
  // Season
  best_season: string[], // ['spring', 'summer', 'fall', 'winter']
  
  // Metadata
  description: text,
  photos: string[],
  popularity_score: integer,
  
  created_at: timestamp,
  updated_at: timestamp
}
```

### Trail Recommendation Schema
```javascript
// trail_recommendations table
{
  recommendation_id: integer (PK),
  profile_id: integer (FK),
  trail_id: integer (FK),
  date: date,
  
  // Scoring
  fitness_match_score: integer (0-100),
  skill_match_score: integer (0-100),
  condition_score: integer (0-100),
  weather_score: integer (0-100),
  overall_score: integer (0-100),
  
  // Reasoning
  match_reasons: string[],
  warnings: string[],
  preparation_tips: string[],
  
  // Predicted metrics
  predicted_duration_min: integer,
  predicted_avg_hr: integer,
  predicted_training_load: integer,
  
  created_at: timestamp
}
```

### Strava Integration Schema
```javascript
// strava_connections table
{
  connection_id: integer (PK),
  profile_id: integer (FK, unique),
  strava_athlete_id: integer,
  
  // OAuth tokens
  access_token: string (encrypted),
  refresh_token: string (encrypted),
  token_expires_at: timestamp,
  
  // Permissions
  scopes: string[], // ['activity:read', 'activity:write']
  
  // Sync settings
  auto_sync: boolean,
  last_sync: timestamp,
  sync_frequency: string, // 'hourly', 'daily'
  
  created_at: timestamp,
  updated_at: timestamp
}

// strava_activities table
{
  activity_id: integer (PK),
  profile_id: integer (FK),
  strava_id: bigint (unique),
  trail_id: integer (FK, nullable),
  
  // Activity basics
  name: string,
  type: string, // 'Ride', 'MountainBikeRide'
  sport_type: string,
  date: timestamp,
  
  // Metrics
  distance_km: decimal,
  duration_sec: integer,
  elevation_gain_m: integer,
  
  // Physiological
  avg_hr: integer,
  max_hr: integer,
  avg_power: integer,
  normalized_power: integer,
  training_load: integer,
  
  // Route data
  route_polyline: text, // encoded polyline
  start_latlng: point,
  
  // Analysis
  matched_trail: boolean,
  trail_match_confidence: decimal,
  
  // Raw data
  raw_data: jsonb,
  
  synced_at: timestamp,
  created_at: timestamp
}
```

---

## Feature Roadmap

### Phase 1: Trail Discovery & Basic Recommendations (Week 1-2)

**Features**:
1. **Trail Database Setup**
   - Import regional trail data from Trailforks
   - Store trail metadata, difficulty ratings, conditions
   - Cache trail photos and descriptions

2. **Location-Based Trail Search**
   - Find trails near athlete location (radius search)
   - Filter by difficulty, length, elevation
   - Display trail details with photos

3. **Basic Trail Recommendations**
   - Match trails to athlete fitness level
   - Consider current weather conditions
   - Factor in trail conditions (wet/dry/snow)
   - Recommend suitable trails for today's workout

**API Endpoints**:
```
GET  /api/trails/search?lat=&lon=&radius=&difficulty=
GET  /api/trails/:id
GET  /api/trails/recommended?email=&sport=mtb
POST /api/trails/import-region
```

**MCP Tools**:
- `search_mtb_trails` - Find trails near location
- `get_trail_details` - Detailed trail information
- `get_recommended_trails` - Smart trail recommendations

### Phase 2: Strava Integration (Week 3-4)

**Features**:
1. **Strava OAuth Connection**
   - Connect athlete Strava account
   - Secure token storage
   - Auto-refresh expired tokens

2. **Activity Import**
   - Pull historical MTB rides
   - Parse GPS data, HR, power
   - Calculate training load
   - Match rides to known trails

3. **Trail Performance Tracking**
   - Track attempts on specific trails
   - Compare performance over time
   - Identify PRs and improvements
   - Detect fitness gains

**API Endpoints**:
```
GET  /api/strava/auth/init
GET  /api/strava/auth/callback
POST /api/strava/sync
GET  /api/strava/activities?email=
GET  /api/trails/:id/attempts?email=
```

**MCP Tools**:
- `connect_strava` - Link Strava account
- `sync_strava_activities` - Import rides
- `get_trail_performance` - Performance on specific trail

### Phase 3: Intelligent Trail Matching (Week 5-6)

**Features**:
1. **AI-Powered Trail Recommendations**
   - ML model: fitness level → suitable trails
   - Consider: HRV, recovery, TSB, recent training
   - Skill progression tracking
   - Personalized difficulty scaling

2. **Route Generation**
   - Create custom loops using multiple trails
   - Optimize for target duration/distance
   - Balance climbing/descending
   - Avoid overcrowded trails

3. **Trail Conditions Intelligence**
   - Real-time weather integration
   - Soil moisture predictions
   - Crowdsourced condition reports
   - "Best time to ride" recommendations

**Advanced Logic**:
```javascript
function recommendTrails(athlete, conditions) {
  // Fitness assessment
  const fitnessLevel = athlete.current_fitness; // CTL/ATL ratio
  const recoveryStatus = athlete.recovery_score;
  const tsbScore = athlete.tsb;
  
  // Skill level (derived from past MTB activities)
  const skillLevel = calculateSkillLevel(athlete.mtb_history);
  
  // Today's recommendation
  if (recoveryStatus < 50 || tsbScore < -30) {
    // Easy recovery ride
    return trails.filter(t => 
      t.physical_rating <= 2 &&
      t.technical_rating <= skillLevel - 1 &&
      t.length_km < 15
    );
  } else if (tsbScore > 0) {
    // Challenge day - push limits
    return trails.filter(t =>
      t.physical_rating <= skillLevel + 1 &&
      t.technical_rating <= skillLevel + 1 &&
      t.current_condition === 'dry'
    );
  } else {
    // Normal training
    return trails.filter(t =>
      t.physical_rating <= skillLevel &&
      t.technical_rating <= skillLevel
    );
  }
}
```

### Phase 4: Social & Competitive Features (Week 7-8)

**Features**:
1. **Trail Challenges**
   - Set goals on specific trails
   - Track progress toward targets
   - Celebrate PRs and milestones

2. **Segment Analysis**
   - Import Strava segments
   - Compare performance to others
   - Identify weak areas (climbs/descents)

3. **Group Ride Planning**
   - Recommend trails for group abilities
   - Find common skill level trails
   - Suggest meeting points

4. **Trail Maintenance Alerts**
   - Report trail issues
   - Subscribe to condition updates
   - Integration with local trail associations

---

## Implementation Priorities

### High Priority
1. ✅ Trail database schema and migrations
2. ✅ Trailforks API integration service
3. ✅ Basic trail search and display
4. ✅ Trail-to-fitness matching algorithm
5. ✅ Strava OAuth flow
6. ✅ Activity import and parsing

### Medium Priority
7. ⏳ GPS route matching to trails
8. ⏳ Trail performance analytics
9. ⏳ Condition-based recommendations
10. ⏳ Trail progression tracking
11. ⏳ Custom route generation

### Low Priority
12. 🔜 Segment leaderboards
13. 🔜 Group ride planning
14. 🔜 Trail maintenance crowdsourcing
15. 🔜 Social features (comments, photos)

---

## Technical Architecture

### Service Layers

**1. TrailforksService** (`backend/src/services/trailforks.js`)
```javascript
- searchTrails(lat, lon, filters)
- getTrailDetails(trailforksId)
- getTrailConditions(trailforksId)
- importRegionalTrails(regionId)
- refreshTrailConditions()
```

**2. StravaService** (`backend/src/services/strava.js`)
```javascript
- initiateAuth(redirectUri)
- handleAuthCallback(code)
- refreshAccessToken(profileId)
- syncActivities(profileId, since)
- getActivityDetails(stravaId)
- matchActivityToTrail(activityId)
```

**3. TrailRecommendationService** (`backend/src/services/trail-recommendations.js`)
```javascript
- getRecommendedTrails(email, location)
- analyzeTrailFitness(trail, athleteProfile)
- calculateTrailMatchScore(trail, athlete, conditions)
- generateTrailWorkout(trail, targetLoad)
- trackTrailAttempt(activityId, trailId)
```

### Database Migrations

```javascript
// migrations/20260219_add_trails_tables.js
export async function up(knex) {
  // trails table
  await knex.schema.createTable('trails', ...);
  
  // trail_recommendations table
  await knex.schema.createTable('trail_recommendations', ...);
  
  // strava_connections table
  await knex.schema.createTable('strava_connections', ...);
  
  // strava_activities table
  await knex.schema.createTable('strava_activities', ...);
}
```

### API Routes Structure

```
/api/trails/
  GET    /search            - Find trails
  GET    /:id               - Trail details
  GET    /:id/conditions    - Current conditions
  GET    /:id/attempts      - Athlete's attempts
  GET    /recommended       - Smart recommendations
  POST   /import-region     - Bulk import
  
/api/strava/
  GET    /auth/init         - Start OAuth
  GET    /auth/callback     - OAuth redirect
  POST   /auth/disconnect   - Unlink
  POST   /sync              - Manual sync
  GET    /activities        - List activities
  GET    /activities/:id    - Activity details
```

---

## Security Considerations

### API Keys
- Store Trailforks API key in environment variables
- Rotate keys periodically
- Monitor rate limit usage

### OAuth Tokens
- Encrypt Strava tokens at rest (AES-256)
- Use secure token refresh flow
- Revoke tokens on disconnect
- Never expose tokens in logs

### Data Privacy
- Request minimal Strava scopes (activity:read only)
- Allow users to control sync preferences
- Provide data deletion option
- GDPR compliance for EU users

---

## Cost Analysis

### Trailforks API
- **Free Tier**: 100 requests/day
  - Sufficient for: ~20 athletes, ~5 trail searches each
- **Paid Tier**: $99/month (10k requests/day)
  - Sufficient for: ~1000 athletes

### Strava API
- **Free**: 1000 requests/day, 100 per 15 min
  - Sufficient for: ~100 active athletes
- **Premium**: Contact for higher limits

### Storage
- Trail database: ~100MB per region (1000 trails)
- Activity data: ~1KB per activity
- GPS polylines: ~2KB per activity (encoded)

**Estimated Costs** (100 athletes):
- Trailforks: Free tier OK initially
- Strava: Free tier sufficient
- Database storage: <1GB
- **Total**: $0-20/month

---

## Success Metrics

### Engagement
- % athletes connecting Strava
- Trail searches per week
- Trail recommendations accepted
- Average trails attempted per month

### Performance
- Trail recommendation relevance score
- Activity-to-trail match accuracy
- API response times (<500ms)

### Impact
- Improvement in trail performance over time
- Reduced injury rate (appropriate difficulty matching)
- Increased training variety (number of unique trails)

---

## Next Steps

1. **Week 1**: Set up trail database schema and Trailforks integration
2. **Week 2**: Build trail search and basic recommendations
3. **Week 3**: Implement Strava OAuth and activity sync
4. **Week 4**: Develop trail-activity matching algorithm
5. **Week 5**: Create ML-based recommendation engine
6. **Week 6**: Add condition-based adjustments
7. **Week 7**: Build performance tracking features
8. **Week 8**: Polish UI and add social features

---

## Questions to Resolve

1. **Geographic Focus**: Which regions to prioritize for trail data?
   - Start with athlete's locations?
   - Popular MTB destinations first?

2. **Skill Assessment**: How to initially assess athlete's MTB skill level?
   - Self-reported?
   - Derived from first few activities?
   - Quiz-based?

3. **Recommendation Frequency**: How often to suggest new trails?
   - Weekly "Trail of the Week"?
   - Every workout day?
   - On-demand only?

4. **Data Refresh**: How often to update trail conditions?
   - Real-time (expensive)?
   - Daily cache refresh?
   - On-demand with 24hr cache?

---

## Integration with Existing System

### Enhanced Daily Recommendations
```javascript
// Current: "60 min endurance ride, Zone 2"
// New: "60 min MTB ride on Blue Diamond Trail (8km, 250m climb)"
```

### Recovery Considerations
- Easy trails for recovery days (low physical/technical rating)
- Challenging trails only when TSB > 0
- No technical trails when HRV is low (injury risk)

### Training Load Tracking
- MTB rides contribute to weekly load
- Elevation gain = extra training stress
- Technical difficulty = mental fatigue factor

### Weather Integration
- Check trail conditions + weather
- Recommend dry trails on wet days
- Suggest alternatives if chosen trail is muddy

---

## Future Enhancements

### Advanced Features
1. **Trail Combos**: Multi-trail rides for custom distances
2. **Shuttle Logistics**: Downhill-focused rides with car spot
3. **Night Riding**: Moon phase + light requirements
4. **Trail Building**: Suggest trails needing maintenance
5. **Virtual Exploration**: 360° trail previews
6. **MTB Events**: Races, group rides, trail days

### AI/ML Opportunities
1. Predict trail enjoyment based on past preferences
2. Estimate completion time with higher accuracy
3. Detect skill improvements over time
4. Suggest progression path (trail difficulty ladder)
5. Anomaly detection (unusual effort on familiar trail = fatigue)

---

## Documentation Needs

1. **User Guide**: "How to connect Strava"
2. **Trail Glossary**: Difficulty ratings explained
3. **API Documentation**: For third-party integrations
4. **Privacy Policy**: Strava data usage
5. **FAQ**: Common questions about trail matching

---

## Summary

This integration will transform the coaching system into a comprehensive MTB training platform. By combining:
- **Trailforks**: Trail discovery and conditions
- **Strava**: Performance tracking and history
- **Existing AI Coach**: Fitness-based recommendations
- **Weather System**: Condition optimization

Athletes get personalized trail recommendations that match their fitness, skill level, recovery status, and current conditions - making every ride safer, more enjoyable, and optimally challenging.

**ROI**: Increased athlete engagement, better training variety, reduced injury risk through appropriate difficulty matching, and competitive differentiation in the coaching market.
