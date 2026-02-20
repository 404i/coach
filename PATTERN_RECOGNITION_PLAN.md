# Pattern Recognition & Intelligent Coaching Plan

## Overview
Build an AI coaching system that learns user patterns, detects when habits break, handles multi-activity days, and provides proactive performance optimization recommendations.

---

## Core Concepts

### 1. Pattern Recognition
**Goal**: Automatically detect user training habits and preferences

**Patterns to Detect**:
- **Frequency Patterns**: "Does yoga 6 days/week"
- **Time-of-Day Patterns**: "Runs in morning, strength in evening"
- **Weekly Structure**: "HIIT on Tuesdays/Thursdays"
- **Sport Preferences**: "Prefers cycling over running"
- **Duration Patterns**: "Yoga always 30min, rides 60-90min"
- **Intensity Distribution**: "80% easy, 20% hard"
- **Recovery Habits**: "Rest day every Sunday"

**Pattern Categories**:
```javascript
{
  // Consistency patterns
  daily_habits: ['yoga', 'meditation'],
  weekly_staples: ['long_ride_saturday', 'hiit_tuesday'],
  
  // Timing patterns
  morning_activities: ['yoga', 'easy_run'],
  evening_activities: ['strength', 'climbing'],
  
  // Sport distribution
  primary_sports: ['cycling', 'yoga'],
  occasional_sports: ['swimming', 'strength'],
  absent_sports: ['running'], // Never does
  
  // Multi-activity patterns
  double_days: {
    frequency: '2-3x per week',
    common_combos: [
      ['yoga_am', 'ride_am'],
      ['ride_am', 'strength_pm']
    ]
  }
}
```

### 2. Pattern Break Detection
**Goal**: Notice when established patterns break and understand why

**Break Types**:
- **Consistency Break**: "Haven't done yoga in 7 days (usually daily)"
- **Variety Break**: "No HIIT in 3 weeks (usually 2x/week)"
- **Intensity Break**: "All easy workouts last 2 weeks (need quality)"
- **Duration Break**: "Rides getting shorter (avg 90min → 45min)"
- **Multi-activity Break**: "Stopped doing double days"

**Detection Thresholds**:
```javascript
const breakThresholds = {
  daily_habit: {
    pattern: '6-7x per week',
    break_after: 3, // days without
    alert_severity: 'low'
  },
  weekly_staple: {
    pattern: '1-2x per week',
    break_after: 14, // days without
    alert_severity: 'medium'
  },
  monthly_regular: {
    pattern: '4-8x per month',
    break_after: 21, // days without
    alert_severity: 'high'
  },
  intensity_balance: {
    pattern: '20% hard workouts',
    break_threshold: 0.1, // <10% hard
    lookback: 14, // days
    alert_severity: 'medium'
  }
}
```

### 3. Multi-Activity Day Handling
**Goal**: Properly track, aggregate, and recommend multiple workouts per day

**Challenges**:
- Training load calculation (cumulative)
- Recovery needs (compound fatigue)
- Scheduling conflicts (time available)
- Complementary activities (yoga + ride = good)

**Data Model**:
```javascript
// daily_activities table
{
  day_id: integer,
  profile_id: integer,
  date: date,
  
  // Activities this day
  activities: [
    {
      activity_id: 1,
      time_slot: 'morning', // morning, midday, evening
      sport: 'yoga',
      duration_min: 30,
      intensity: 'easy',
      training_load: 15,
      order: 1 // First activity of day
    },
    {
      activity_id: 2,
      time_slot: 'morning',
      sport: 'cycling',
      duration_min: 75,
      intensity: 'endurance',
      training_load: 85,
      order: 2 // Second activity (after yoga)
    },
    {
      activity_id: 3,
      time_slot: 'evening',
      sport: 'strength',
      duration_min: 45,
      intensity: 'moderate',
      training_load: 55,
      order: 3
    }
  ],
  
  // Aggregated metrics
  total_duration_min: 150,
  total_training_load: 155, // Sum with recovery factor
  activity_count: 3,
  time_slots_used: ['morning', 'evening'],
  
  // Recovery impact
  recovery_deficit: 25, // Multi-activity fatigue penalty
  next_day_readiness: 65 // Predicted recovery score
}
```

**Training Load Calculation** (Multi-Activity):
```javascript
function calculateDailyLoad(activities) {
  let baseLoad = 0;
  let multiActivityPenalty = 0;
  
  // Sum all activities
  activities.forEach(activity => {
    baseLoad += activity.training_load;
  });
  
  // Multi-activity fatigue penalty
  if (activities.length === 2) {
    multiActivityPenalty = baseLoad * 0.10; // +10% stress
  } else if (activities.length >= 3) {
    multiActivityPenalty = baseLoad * 0.20; // +20% stress
  }
  
  // Time slot compression penalty
  const morningActivities = activities.filter(a => a.time_slot === 'morning');
  if (morningActivities.length >= 2) {
    multiActivityPenalty += baseLoad * 0.05; // +5% for same slot
  }
  
  return baseLoad + multiActivityPenalty;
}
```

### 4. Performance Multipliers
**Goal**: Identify missing training modalities and quantify their benefits

**Missing Modalities Detection**:
```javascript
const performanceMultipliers = {
  strength_training: {
    absent_threshold: 21, // days without
    benefits: [
      'Injury prevention: -30% risk',
      'Power output: +10-15% on climbs',
      'Bone density maintenance',
      'Core stability for endurance sports'
    ],
    recommended_frequency: '2x per week, 45min',
    intensity: 'moderate',
    timing: 'After hard rides or separate day'
  },
  
  hiit_intervals: {
    absent_threshold: 14,
    benefits: [
      'VO2 max improvement: +5-10% in 8 weeks',
      'Lactate threshold increase',
      'Time efficiency: Big gains in short time',
      'Race performance: +2-5% speed'
    ],
    recommended_frequency: '1-2x per week',
    intensity: 'hard',
    timing: 'When well recovered (TSB > -10)'
  },
  
  flexibility_mobility: {
    absent_threshold: 7,
    benefits: [
      'Recovery acceleration: -20% soreness',
      'Injury prevention: Reduced muscle imbalances',
      'Range of motion: Better bike position',
      'Sleep quality: +15% deep sleep'
    ],
    recommended_frequency: 'Daily, 15-30min',
    intensity: 'easy',
    timing: 'Evening or post-workout'
  },
  
  cross_training: {
    absent_threshold: 30,
    benefits: [
      'Overuse injury prevention',
      'Mental freshness: Break from routine',
      'Whole-body fitness',
      'Active recovery'
    ],
    recommended_frequency: '1x per week',
    intensity: 'easy-moderate',
    timing: 'Replace easy endurance day'
  }
}
```

---

## Data Models

### Pattern Tracking Schema

```javascript
// training_patterns table
{
  pattern_id: integer (PK),
  profile_id: integer (FK),
  
  // Pattern definition
  pattern_type: enum('daily_habit', 'weekly_staple', 'time_of_day', 'multi_activity'),
  sport: string,
  activity_type: string, // 'yoga', 'hiit', 'strength'
  
  // Frequency metrics
  frequency_days_per_week: decimal, // 6.5 days/week
  typical_duration_min: integer,
  typical_intensity: string,
  time_slot: string, // 'morning', 'evening'
  
  // Pattern strength
  pattern_confidence: integer (0-100), // How established is this pattern
  pattern_age_days: integer, // How long has this pattern existed
  last_occurrence: date,
  
  // Statistics
  total_occurrences: integer,
  streak_current: integer, // Current consecutive days/weeks
  streak_longest: integer,
  
  // Pattern metadata
  discovered_at: timestamp,
  updated_at: timestamp,
  status: enum('active', 'broken', 'dormant')
}

// pattern_breaks table
{
  break_id: integer (PK),
  pattern_id: integer (FK),
  profile_id: integer (FK),
  
  // Break details
  break_started: date,
  break_ended: date, // Null if ongoing
  break_duration_days: integer,
  
  // Severity
  severity: enum('low', 'medium', 'high', 'critical'),
  impact_score: integer (0-100), // How much this hurts training
  
  // Detection
  detected_at: timestamp,
  
  // Nudging
  nudge_sent: boolean,
  nudge_sent_at: timestamp,
  nudge_accepted: boolean, // Did user resume pattern
  
  // Context (why did pattern break?)
  break_reason: string, // 'injury', 'travel', 'weather', 'unknown'
  concurrent_factors: json // Other life events
}

// multi_activity_days table
{
  multi_day_id: integer (PK),
  profile_id: integer (FK),
  date: date,
  
  // Activities
  activity_ids: integer[], // References to daily_metrics or activities
  activity_count: integer,
  
  // Timing
  time_slots: string[], // ['morning', 'evening']
  total_duration_min: integer,
  
  // Load calculation
  individual_loads: integer[], // [15, 85, 55]
  base_total_load: integer, // 155
  multi_activity_penalty: integer, // 31 (+20%)
  adjusted_total_load: integer, // 186
  
  // Patterns
  activity_combo: string, // 'yoga_cycling_strength'
  is_typical_combo: boolean, // User does this often?
  
  // Recovery impact
  recovery_deficit: integer,
  predicted_next_day_recovery: integer,
  
  created_at: timestamp
}

// performance_gaps table
{
  gap_id: integer (PK),
  profile_id: integer (FK),
  
  // Missing modality
  modality: string, // 'strength', 'hiit', 'flexibility'
  
  // Gap metrics
  days_absent: integer,
  last_performed: date,
  typical_frequency: string, // '2x per week'
  current_frequency: string, // '0x in 3 weeks'
  
  // Impact assessment
  gap_severity: enum('minor', 'moderate', 'significant', 'critical'),
  performance_impact: integer (0-100),
  injury_risk_increase: integer (0-100),
  
  // Recommendations
  recommended_frequency: string,
  recommended_duration: integer,
  recommended_timing: string,
  
  // Benefits if addressed
  benefits: json, // Array of benefit statements
  estimated_improvement: json, // Quantified gains
  
  // Nudging
  nudge_priority: integer (1-10),
  nudge_sent: boolean,
  nudge_sent_at: timestamp,
  
  detected_at: timestamp,
  resolved_at: timestamp // When user addressed gap
}
```

---

## Feature Implementation

### Phase 1: Pattern Recognition Engine (Week 1-2)

**1.1 Pattern Discovery**
```javascript
// Analyze historical data to find patterns
async function discoverPatterns(profileId, lookbackDays = 90) {
  const activities = await getActivities(profileId, lookbackDays);
  
  // Group by sport/activity type
  const sportGroups = groupBy(activities, 'sport');
  
  const patterns = [];
  
  for (const [sport, sportActivities] of Object.entries(sportGroups)) {
    // Daily habit check
    const daysWithActivity = sportActivities.length;
    const frequencyPerWeek = (daysWithActivity / lookbackDays) * 7;
    
    if (frequencyPerWeek >= 5) {
      patterns.push({
        type: 'daily_habit',
        sport,
        frequency: frequencyPerWeek,
        confidence: calculateConfidence(sportActivities),
        typical_duration: median(sportActivities.map(a => a.duration)),
        typical_time_slot: mode(sportActivities.map(a => a.time_slot))
      });
    }
    
    // Weekly staple check
    if (frequencyPerWeek >= 1 && frequencyPerWeek < 5) {
      patterns.push({
        type: 'weekly_staple',
        sport,
        frequency: frequencyPerWeek,
        typical_day: findMostCommonDay(sportActivities)
      });
    }
  }
  
  // Multi-activity patterns
  const multiDays = activities
    .reduce((acc, activity) => {
      const date = activity.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(activity);
      return acc;
    }, {});
  
  const multiActivityCombos = Object.entries(multiDays)
    .filter(([date, acts]) => acts.length >= 2)
    .map(([date, acts]) => ({
      date,
      combo: acts.map(a => a.sport).sort().join('_'),
      activities: acts
    }));
  
  // Find common combos
  const comboFrequency = {};
  multiActivityCombos.forEach(({ combo }) => {
    comboFrequency[combo] = (comboFrequency[combo] || 0) + 1;
  });
  
  for (const [combo, count] of Object.entries(comboFrequency)) {
    if (count >= 4) { // At least 4 occurrences
      patterns.push({
        type: 'multi_activity',
        combo,
        frequency: (count / (lookbackDays / 7)).toFixed(1) + 'x per week',
        confidence: Math.min(100, count * 5)
      });
    }
  }
  
  return patterns;
}
```

**1.2 Pattern Storage**
```javascript
async function savePatterns(profileId, patterns) {
  for (const pattern of patterns) {
    await db('training_patterns').insert({
      profile_id: profileId,
      pattern_type: pattern.type,
      sport: pattern.sport,
      frequency_days_per_week: pattern.frequency,
      typical_duration_min: pattern.typical_duration,
      typical_intensity: pattern.typical_intensity,
      time_slot: pattern.time_slot,
      pattern_confidence: pattern.confidence,
      pattern_age_days: pattern.age || 0,
      total_occurrences: pattern.occurrences,
      discovered_at: new Date(),
      status: 'active'
    });
  }
}
```

**1.3 Pattern Update (Daily)**
```javascript
// Run nightly to update patterns
async function updatePatterns(profileId) {
  const patterns = await db('training_patterns')
    .where({ profile_id: profileId, status: 'active' });
  
  for (const pattern of patterns) {
    // Check if pattern still holds
    const recentActivities = await getRecentActivities(
      profileId, 
      pattern.sport, 
      14 // last 2 weeks
    );
    
    const currentFrequency = (recentActivities.length / 14) * 7;
    const expectedFrequency = pattern.frequency_days_per_week;
    
    // Pattern is breaking
    if (currentFrequency < expectedFrequency * 0.5) {
      await detectPatternBreak(pattern, currentFrequency);
    }
    
    // Update statistics
    await db('training_patterns')
      .where({ pattern_id: pattern.pattern_id })
      .update({
        last_occurrence: recentActivities[0]?.date,
        total_occurrences: pattern.total_occurrences + recentActivities.length,
        updated_at: new Date()
      });
  }
}
```

### Phase 2: Pattern Break Detection & Nudging (Week 3-4)

**2.1 Break Detection**
```javascript
async function detectPatternBreak(pattern, currentFrequency) {
  const daysSinceLastOccurrence = getDaysSince(pattern.last_occurrence);
  
  // Determine break threshold based on pattern type
  const thresholds = {
    daily_habit: 3,
    weekly_staple: 14,
    monthly_regular: 21
  };
  
  const threshold = thresholds[pattern.pattern_type] || 7;
  
  if (daysSinceLastOccurrence >= threshold) {
    // Calculate severity
    const severity = calculateBreakSeverity(
      daysSinceLastOccurrence,
      pattern.frequency_days_per_week,
      currentFrequency
    );
    
    // Calculate impact
    const impactScore = calculateImpactScore(pattern);
    
    // Record break
    const breakRecord = await db('pattern_breaks').insert({
      pattern_id: pattern.pattern_id,
      profile_id: pattern.profile_id,
      break_started: subDays(new Date(), daysSinceLastOccurrence),
      break_duration_days: daysSinceLastOccurrence,
      severity,
      impact_score: impactScore,
      detected_at: new Date(),
      nudge_sent: false
    }).returning('*');
    
    // Update pattern status
    await db('training_patterns')
      .where({ pattern_id: pattern.pattern_id })
      .update({ status: 'broken' });
    
    // Generate nudge
    await generatePatternBreakNudge(breakRecord[0]);
    
    return breakRecord[0];
  }
  
  return null;
}
```

**2.2 Nudge Generation**
```javascript
function generatePatternBreakNudge(breakRecord) {
  const pattern = breakRecord.pattern;
  
  const nudges = {
    yoga: {
      low: `Haven't done yoga in ${breakRecord.break_duration_days} days. Your flexibility and recovery might be affected.`,
      medium: `It's been ${breakRecord.break_duration_days} days without yoga. You usually do it ${pattern.frequency_days_per_week}x/week. Missing flexibility work can increase injury risk.`,
      high: `⚠️ You've stopped your daily yoga practice (${breakRecord.break_duration_days} days). This was helping your recovery and preventing injuries. Resume today?`,
      critical: `🚨 ${breakRecord.break_duration_days} days without yoga! Your recovery scores are declining. Consider a gentle 20min session today.`
    },
    hiit: {
      medium: `No HIIT intervals in ${breakRecord.break_duration_days} days. You're missing out on VO2 max gains and race speed improvements.`,
      high: `It's been ${breakRecord.break_duration_days} days since your last HIIT session. Your lactate threshold is likely stagnating. Schedule 1-2 interval sessions this week?`,
      critical: `You've gone ${breakRecord.break_duration_days} days without high-intensity work. Race performance will decline without these sessions. Plan a HIIT workout when recovered.`
    },
    strength: {
      medium: `${breakRecord.break_duration_days} days without strength training. Power and injury resistance are declining.`,
      high: `⚠️ No strength work in ${breakRecord.break_duration_days} days. This increases injury risk by ~30%. Schedule 2 sessions this week?`,
      critical: `🚨 ${breakRecord.break_duration_days} days without strength training! Bone density and power are declining. Resume with 2x45min sessions this week.`
    }
  };
  
  const sport = pattern.sport;
  const severity = breakRecord.severity;
  
  const message = nudges[sport]?.[severity] || 
    `You haven't done ${sport} in ${breakRecord.break_duration_days} days. This was part of your regular routine.`;
  
  return {
    type: 'pattern_break',
    severity,
    title: `Missing: ${sport}`,
    message,
    action: `Schedule ${sport} workout`,
    priority: severity === 'critical' ? 10 : severity === 'high' ? 7 : 5,
    expires_at: addDays(new Date(), 7)
  };
}
```

**2.3 Nudge Delivery**
```javascript
// API endpoint for getting nudges
router.get('/api/nudges', async (req, res) => {
  const { email } = req.query;
  const profileId = await getProfileIdFromEmail(email);
  
  // Get pattern breaks
  const patternBreaks = await db('pattern_breaks')
    .where({ 
      profile_id: profileId,
      nudge_sent: false,
      break_ended: null // Still ongoing
    })
    .orderBy('impact_score', 'desc');
  
  // Get performance gaps
  const performanceGaps = await db('performance_gaps')
    .where({
      profile_id: profileId,
      nudge_sent: false,
      resolved_at: null
    })
    .orderBy('nudge_priority', 'desc');
  
  const nudges = [];
  
  // Convert to nudge messages
  for (const breakRecord of patternBreaks) {
    const nudge = generatePatternBreakNudge(breakRecord);
    nudges.push(nudge);
    
    // Mark as sent
    await db('pattern_breaks')
      .where({ break_id: breakRecord.break_id })
      .update({ nudge_sent: true, nudge_sent_at: new Date() });
  }
  
  for (const gap of performanceGaps) {
    const nudge = generatePerformanceGapNudge(gap);
    nudges.push(nudge);
    
    await db('performance_gaps')
      .where({ gap_id: gap.gap_id })
      .update({ nudge_sent: true, nudge_sent_at: new Date() });
  }
  
  res.json({
    nudges: nudges.sort((a, b) => b.priority - a.priority),
    count: nudges.length
  });
});
```

### Phase 3: Multi-Activity Day Support (Week 5-6)

**3.1 Multi-Activity Tracking**
```javascript
async function trackMultiActivityDay(profileId, date, activities) {
  // Sort by time
  const sortedActivities = activities.sort((a, b) => 
    a.start_time.localeCompare(b.start_time)
  );
  
  // Calculate loads
  const individualLoads = sortedActivities.map(a => a.training_load);
  const baseTotal = individualLoads.reduce((sum, load) => sum + load, 0);
  
  // Multi-activity penalty
  let penalty = 0;
  if (activities.length === 2) penalty = baseTotal * 0.10;
  if (activities.length >= 3) penalty = baseTotal * 0.20;
  
  // Same time slot penalty
  const slots = sortedActivities.map(a => a.time_slot);
  const uniqueSlots = new Set(slots);
  if (slots.length > uniqueSlots.size) {
    penalty += baseTotal * 0.05;
  }
  
  const adjustedTotal = Math.round(baseTotal + penalty);
  
  // Determine activity combo
  const combo = sortedActivities
    .map(a => a.sport)
    .join('_');
  
  // Check if typical combo
  const historicalCombos = await db('multi_activity_days')
    .where({ profile_id: profileId })
    .pluck('activity_combo');
  
  const isTypical = historicalCombos.filter(c => c === combo).length >= 3;
  
  // Predict recovery impact
  const recoveryDeficit = calculateRecoveryDeficit(adjustedTotal, activities.length);
  const predictedRecovery = predictNextDayRecovery(profileId, recoveryDeficit);
  
  // Save
  await db('multi_activity_days').insert({
    profile_id: profileId,
    date,
    activity_ids: sortedActivities.map(a => a.id),
    activity_count: activities.length,
    time_slots: Array.from(uniqueSlots),
    total_duration_min: sortedActivities.reduce((sum, a) => sum + a.duration, 0),
    individual_loads: individualLoads,
    base_total_load: baseTotal,
    multi_activity_penalty: Math.round(penalty),
    adjusted_total_load: adjustedTotal,
    activity_combo: combo,
    is_typical_combo: isTypical,
    recovery_deficit: recoveryDeficit,
    predicted_next_day_recovery: predictedRecovery
  });
  
  return {
    total_load: adjustedTotal,
    penalty,
    predicted_recovery: predictedRecovery
  };
}
```

**3.2 Multi-Activity Recommendations**
```javascript
async function recommendMultiActivity(profileId, date) {
  const todayMetrics = await getDailyMetrics(profileId, date);
  const patterns = await getMultiActivityPatterns(profileId);
  
  // Current recovery state
  const recovery = todayMetrics.recovery_score;
  const hrv = todayMetrics.hrv;
  const tsb = todayMetrics.tsb;
  
  // Already did an activity today?
  const todayActivities = await getActivitiesOnDate(profileId, date);
  
  if (todayActivities.length === 0) {
    // No activity yet - suggest first activity
    return suggestPrimaryActivity(profileId, recovery, tsb);
  }
  
  if (todayActivities.length === 1) {
    const firstActivity = todayActivities[0];
    
    // Check if user typically does double days
    const hasDoublePattern = patterns.some(p => 
      p.pattern_type === 'multi_activity' && 
      p.frequency_days_per_week >= 1
    );
    
    if (!hasDoublePattern) {
      return { message: 'One workout is enough for today. Focus on recovery.' };
    }
    
    // Suggest complementary activity
    const suggestions = [];
    
    // If morning ride, suggest evening yoga/strength
    if (firstActivity.sport === 'cycling' && firstActivity.time_slot === 'morning') {
      if (recovery >= 60) {
        suggestions.push({
          sport: 'yoga',
          duration: 30,
          intensity: 'easy',
          time_slot: 'evening',
          reason: 'Promotes recovery from morning ride',
          estimated_load: 15
        });
      }
      
      if (recovery >= 70 && tsb > -20) {
        suggestions.push({
          sport: 'strength',
          duration: 45,
          intensity: 'moderate',
          time_slot: 'evening',
          reason: 'Build power while legs are already worked',
          estimated_load: 55
        });
      }
    }
    
    // If morning yoga, suggest morning ride after
    if (firstActivity.sport === 'yoga' && firstActivity.time_slot === 'morning') {
      if (recovery >= 65) {
        suggestions.push({
          sport: 'cycling',
          duration: 60,
          intensity: 'endurance',
          time_slot: 'morning',
          reason: 'Warmed up from yoga, good for quality ride',
          estimated_load: 75
        });
      }
    }
    
    // Calculate total day load
    suggestions.forEach(sug => {
      const dayLoad = firstActivity.training_load + sug.estimated_load;
      const penalty = dayLoad * 0.10; // 2 activities
      sug.total_day_load = Math.round(dayLoad + penalty);
      sug.predicted_recovery_tomorrow = predictRecoveryAfterLoad(
        profileId,
        sug.total_day_load
      );
    });
    
    return {
      current_load: firstActivity.training_load,
      suggestions,
      note: 'Second workout is optional - only if you feel recovered'
    };
  }
  
  // Already 2+ activities
  return {
    message: `You've already done ${todayActivities.length} workouts today. Rest and recover!`,
    total_load: todayActivities.reduce((sum, a) => sum + a.training_load, 0)
  };
}
```

### Phase 4: Performance Multipliers & Gap Analysis (Week 7-8)

**4.1 Gap Detection**
```javascript
async function detectPerformanceGaps(profileId) {
  const activities = await getActivities(profileId, 60); // Last 60 days
  
  const sportCounts = {};
  activities.forEach(a => {
    sportCounts[a.sport] = (sportCounts[a.sport] || 0) + 1;
  });
  
  const gaps = [];
  
  // Check each modality
  const modalities = [
    { name: 'strength', absent_threshold: 21, typical_frequency: '2x/week' },
    { name: 'hiit', absent_threshold: 14, typical_frequency: '1-2x/week' },
    { name: 'yoga', absent_threshold: 7, typical_frequency: 'Daily' },
    { name: 'flexibility', absent_threshold: 7, typical_frequency: 'Daily' }
  ];
  
  for (const modality of modalities) {
    const lastActivity = await getLastActivity(profileId, modality.name);
    const daysAbs = lastActivity ? getDaysSince(lastActivity.date) : 999;
    
    if (daysAbsent >= modality.absent_threshold) {
      const gap = {
        modality: modality.name,
        days_absent: daysAbsent,
        last_performed: lastActivity?.date || null,
        typical_frequency: modality.typical_frequency,
        current_frequency: '0x in last month',
        gap_severity: calculateGapSeverity(daysAbsent, modality.absent_threshold),
        performance_impact: calculatePerformanceImpact(modality.name, daysAbsent),
        injury_risk_increase: calculateInjuryRisk(modality.name, daysAbsent),
        benefits: performanceMultipliers[modality.name].benefits,
        estimated_improvement: estimateImprovementFromModality(
          profileId,
          modality.name
        ),
        nudge_priority: calculateNudgePriority(modality.name, daysAbsent)
      };
      
      gaps.push(gap);
      
      // Save to database
      await db('performance_gaps').insert({
        profile_id: profileId,
        ...gap,
        detected_at: new Date(),
        nudge_sent: false
      });
    }
  }
  
  return gaps;
}
```

**4.2 Performance Impact Calculation**
```javascript
function calculatePerformanceImpact(modality, daysAbsent) {
  const impacts = {
    strength: {
      14: 10,  // -10% power
      21: 20,  // -20% power
      30: 30,  // -30% power
      60: 50   // -50% power (significant atrophy)
    },
    hiit: {
      14: 5,   // -5% VO2max
      21: 10,  // -10% VO2max
      30: 15,  // -15% VO2max
      60: 25   // -25% VO2max
    },
    yoga: {
      7: 10,   // -10% flexibility
      14: 20,  // -20% flexibility, recovery slower
      30: 40,  // -40% flexibility, injury risk up
      60: 60   // Significant stiffness
    }
  };
  
  const modalityImpacts = impacts[modality] || {};
  
  // Find closest threshold
  const thresholds = Object.keys(modalityImpacts).map(Number).sort((a, b) => a - b);
  let impact = 0;
  
  for (const threshold of thresholds) {
    if (daysAbsent >= threshold) {
      impact = modalityImpacts[threshold];
    }
  }
  
  return impact;
}
```

**4.3 Benefit Visualization**
```javascript
function generatePerformanceGapNudge(gap) {
  const { modality, days_absent, benefits, estimated_improvement } = gap;
  
  const messages = {
    strength: {
      title: `💪 Missing Strength Training`,
      message: `It's been ${days_absent} days without strength work. You're leaving gains on the table:`,
      bullets: [
        `🚀 Power: +${estimated_improvement.power}% on climbs`,
        `🛡️ Injury risk: -30% with regular strength work`,
        `🦴 Bone density: Maintaining long-term health`,
        `⚡ Economy: Better efficiency in your primary sport`
      ],
      action: `Schedule 2x45min strength sessions this week`,
      recommended_days: ['Tuesday', 'Friday'],
      expected_timeline: '4-6 weeks to see power gains'
    },
    hiit: {
      title: `⚡ No High-Intensity Work`,
      message: `${days_absent} days without HIIT intervals. Your race performance is stagnating:`,
      bullets: [
        `📈 VO2 max: +${estimated_improvement.vo2_gain}% in 8 weeks`,
        `🏁 Race speed: +2-5% performance`,
        `⏱️ Time efficient: Big gains in short sessions`,
        `🔥 Lactate threshold: Push your limits higher`
      ],
      action: `Add 1-2 interval sessions this week`,
      recommended_format: '4-6 x 4min @ 95% effort, 3min recovery',
      when_to_do: 'When TSB > -10 (well recovered)'
    },
    yoga: {
      title: `🧘 Missing Flexibility Work`,
      message: `No yoga in ${days_absent} days. Your body is tightening up:`,
      bullets: [
        `🔄 Recovery: -20% soreness with daily practice`,
        `🛡️ Injury prevention: Balanced muscles`,
        `😴 Sleep: +15% deep sleep quality`,
        `🚴 Position: Better range of motion on bike`
      ],
      action: `Resume daily 20-30min yoga`,
      recommended_timing: 'Evening or post-workout',
      quick_start: '10min gentle flow to ease back in'
    }
  };
  
  return messages[modality] || {
    title: `Missing: ${modality}`,
    message: `Consider adding ${modality} back to your routine`,
    action: `Schedule ${modality} workout`
  };
}
```

---

## API Endpoints

```javascript
// Pattern Recognition
GET  /api/patterns?email=              // Get all patterns for athlete
POST /api/patterns/discover            // Force pattern discovery
GET  /api/patterns/breaks?email=       // Get current pattern breaks

// Nudges
GET  /api/nudges?email=                // Get all nudges (breaks + gaps)
POST /api/nudges/:id/acknowledge       // Mark nudge as seen
POST /api/nudges/:id/accept            // User acted on nudge

// Multi-Activity
GET  /api/multi-activity/today?email=  // Today's activities + suggestions
POST /api/multi-activity/log           // Log additional activity
GET  /api/multi-activity/history?email=  // Past multi-activity days

// Performance Gaps
GET  /api/performance/gaps?email=      // Current performance gaps
GET  /api/performance/benefits/:modality  // Detailed benefits of modality
POST /api/performance/gaps/:id/plan    // Create plan to address gap
```

## MCP Tools

```javascript
// 6 new tools
{
  name: "get_training_patterns",
  description: "Get athlete's established training patterns (daily habits, weekly staples, multi-activity patterns)"
},
{
  name: "get_pattern_breaks",
  description: "Identify when athlete stops doing regular activities (e.g., no yoga in 7 days, no HIIT in 3 weeks)"
},
{
  name: "get_nudges",
  description: "Get all coaching nudges (pattern breaks, performance gaps, recommendations)"
},
{
  name: "suggest_multi_activity",
  description: "Suggest second/third workout for today based on what's already done and recovery status"
},
{
  name: "analyze_performance_gaps",
  description: "Identify missing training modalities (strength, HIIT, flexibility) and quantify benefits"
},
{
  name: "get_performance_multipliers",
  description: "Show specific benefits athlete would gain from adding missing modality (e.g., +15% power from strength)"
}
```

---

## Example User Scenarios

### Scenario 1: Daily Yoga Practitioner
```
Pattern Detected:
- Yoga 6.5x per week, 30min, morning
- Confidence: 95%
- Established: 60 days

Day 8 without yoga:
Nudge: "⚠️ You've stopped your daily yoga practice (8 days). 
Your recovery scores are declining (-12% average). 
Consider a gentle 20min session today?"

User resumes → Pattern restored
```

### Scenario 2: Missing HIIT
```
Pattern History:
- HIIT 2x per week (Tuesdays/Thursdays)
- Last 4 weeks: 0 HIIT sessions

Gap Detected:
- Days absent: 28
- Performance impact: -15% VO2 max decline
- Severity: High

Nudge: "⚡ No high-intensity work in 28 days. 
Your race performance is stagnating.

Benefits of resuming:
📈 VO2 max: +8% in 8 weeks
🏁 Race speed: +3% performance  
⏱️ Time efficient: 30min sessions

Schedule 1-2 interval sessions when recovered (TSB > -10)"
```

### Scenario 3: Multi-Activity Days
```
Morning: Yoga (30min, load 15)
Status: "Great start! You're warmed up."

Suggestion: "Your recovery is good (72%). 
Consider adding:
🚴 60min endurance ride (load 75)
Total day load: 99 (with 10% multi-activity adjustment)
Predicted recovery tomorrow: 65%"

User adds ride → Both activities logged
Evening prompt: "You've done 2 workouts (load 99). 
Rest tonight - you've earned it!"
```

### Scenario 4: Performance Multiplier
```
Gap Analysis:
- No strength training in 35 days
- Previous frequency: 2x per week
- Performance impact: -25% power

Nudge: "💪 Missing Strength Training

You're leaving gains on the table:
🚀 Power: +12% on climbs (4-6 weeks)
🛡️ Injury risk: -30% with regular work
⚡ Economy: Better efficiency

Action: Schedule 2x45min this week
Recommended: Tuesday (upper body), Friday (lower body)

Expected timeline: 4-6 weeks to see power gains"

User schedules strength → Gap marked as addressed
Follow-up in 2 weeks: "Power up 6% since resuming strength! Keep it up."
```

---

## Success Metrics

### Pattern Recognition
- Patterns discovered per athlete: Avg 5-8
- Pattern confidence: >80% for established patterns
- False positives: <10%

### Nudging Effectiveness
- Nudge acceptance rate: >40%
- Pattern restoration within 7 days: >60%
- User satisfaction with nudges: >4.0/5.0

### Performance Impact
- Athletes addressing gaps: >50%
- Measured improvement after gap addressed: Track power, VO2, recovery
- Injury rate reduction: -20% with pattern adherence

---

## Implementation Timeline

- **Week 1-2**: Pattern discovery engine
- **Week 3-4**: Break detection + nudging
- **Week 5-6**: Multi-activity day support
- **Week 7-8**: Performance gaps + multipliers

**Total**: 8 weeks, ~200 hours

---

## Next Steps

1. Create database migrations for new tables
2. Implement pattern discovery algorithm
3. Build break detection service
4. Design nudge system
5. Test with real athlete data
