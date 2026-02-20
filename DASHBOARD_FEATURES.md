# 🎯 Dashboard Features Added

## What's New

Your Coach app now has a comprehensive **Dashboard** at the top of the page with 4 key widgets:

### 1. 📊 Recent Stats
**Automatically calculated from your training history:**

**Last 7 Days:**
- Total training volume (hours)
- Number of hard training days
- Average recovery score

**Last 4 Weeks:**
- Total training volume (hours)
- Weekly average (hrs/week)
- Training consistency (% of days with activity)

**How it works:**
- Stats update automatically when you load the page
- Pulls data from your daily check-in history
- Hard days = exercise load > 80 OR high intensity (Z4+Z5 > 10min)

### 2. 📅 This Week's Plan
**AI-generated 7-day training schedule:**

Shows for each day:
- Day of week and date
- Recovery score estimate (color-coded: 🟢 Good / 🟡 OK / 🔴 Poor)
- Recommended workout type (Intervals, Aerobic, Strength, Recovery)
- Specific zones and instructions

**Example:**
```
Monday Feb 17 - 75% recovery 🟢
🔥 Bike - Intervals
10min warmup Z1-Z2, 4x(4min Z4 + 2min Z1), 10min cooldown
```

**Features:**
- Automatically adjusts based on recovery scores
- Uses your favorite sports from profile
- Balances hard days and recovery
- Click **🔄 Regenerate Plan** to refresh

### 3. 🌤️ Weather Outlook
**7-day weather forecast for outdoor activity planning:**

Shows for each day:
- Weather icon and description
- Temperature range (min-max)
- Precipitation probability
- **Outdoor suitability badge:**
  - ✅ Good for outdoor (< 30% rain, 5-35°C)
  - ⚠️ Indoor preferred (high rain or extreme temps)

**How to use:**
1. (Optional) Enter your city name in the location field
2. Click **Get Forecast**
3. Check the 7-day outlook
4. Plan outdoor activities (MTB, running) on good weather days

**Smart recommendations:**
- If Wednesday shows rain, do indoor HIIT instead of MTB
- If Saturday is perfect weather, save your long outdoor ride for then
- Save strength/yoga for bad weather days

### 4. 🤖 LM Studio Status
**Test your AI connection:**

Click **Test Connection** to:
- Verify LM Studio is running
- Check connection speed (response time in ms)
- See available models
- Troubleshoot connection issues

**Status indicators:**
- ✅ Connected (XXms) - Ready to use
- ❌ Connection failed - Check LM Studio

## How to Use

### First Time Setup
1. **Open** http://127.0.0.1:8080 (server must be running)
2. **Fill out** your Athlete Profile (section 1)
3. **Submit** some Daily Check-ins (section 3) to build history
4. **Dashboard stats** will populate automatically

### Daily Workflow
1. **Check dashboard** for today's plan
2. **Check weather** for outdoor activity viability
3. **Do your workout** based on the plan
4. **Submit check-in** with actual data
5. **Stats update** automatically

### Planning Your Week
1. Click **🔄 Regenerate Plan** to get fresh weekly plan
2. Click **Get Forecast** to see weather outlook
3. **Adjust outdoor activities** based on weather
4. **Example:** Swap Wednesday MTB with Friday if rain expected

## Technical Details

### Stats Calculation
```javascript
// Last 7 days volume
const volume7d = days7.reduce((sum, d) => {
  const acts = d.activities || [];
  const mins = acts.reduce((s, a) => s + (a.duration_minutes || 0), 0);
  return sum + mins;
}, 0);

// Hard days = high load OR high intensity
const hard7d = days7.filter(d => {
  const acts = d.activities || [];
  return acts.some(a => 
    (a.exercise_load || 0) > 80 || 
    ((a.z4_minutes || 0) + (a.z5_minutes || 0)) > 10
  );
}).length;
```

### Weekly Plan Algorithm
- **Recovery < 50%** → 🧘 Recovery day (yoga, walk, rest)
- **Recovery >= 70% + every 3rd day** → 🔥 Hard interval session
- **Every 2nd day** → 💪 Strength training
- **Other days** → 🚴 Aerobic base building (Z2)

Uses your favorite sports from profile, rotates through them intelligently.

### Weather Integration
- Uses **Open-Meteo API** (free, no API key needed)
- Default location: **San Francisco** (37.7749, -122.4194)
- To change location: Update your profile with lat/lon (future feature)
- Or manually enter city name in weather widget

### LLM Connection Test
```javascript
// Tests /models endpoint
const response = await fetch(`${baseUrl}/models`);
// Reports: connection time, available models, errors
```

## New Files Added
- ✅ Dashboard HTML section in [index.html](index.html)
- ✅ Dashboard functions in [app.js](app.js) (+280 lines)
- ✅ Dashboard styles in [styles.css](styles.css) (+270 lines)

## Styling
- **Color-coded badges** for quick status recognition
- **Responsive grid layout** - works on mobile and desktop
- **Consistent with existing design** - same colors and spacing
- **Card-based widgets** - clean separation

## Future Enhancements (Optional)

### Location Support
- Add lat/lon fields to profile
- Use profile location for weather
- Auto-detect location from browser

### Plan Customization
- Drag-and-drop to reorder workouts
- Edit individual day plans
- Save custom templates

### Advanced Stats
- VO2max trend
- Chronic Training Load (CTL)
- Acute:Chronic Workload Ratio
- Fitness/Fatigue/Form (Banister model)

### Weather-Aware Recommendations
- Automatically swap outdoor → indoor on rain days
- Suggest alternative sports based on conditions
- Heat/cold warnings for safety

### Goal Tracking
- Set weekly/monthly volume targets
- Track progress toward goals
- Visual progress bars

## Testing Checklist

- [ ] Open http://127.0.0.1:8080
- [ ] Dashboard appears at top of page
- [ ] Stats show "0" or "-" (if no history yet)
- [ ] Weekly plan shows 7 days
- [ ] Weather section has "Get Forecast" button
- [ ] LLM section has "Test Connection" button
- [ ] Click "Get Forecast" → weather loads
- [ ] Click "Test Connection" → connection tested
- [ ] Click "Regenerate Plan" → plan refreshes
- [ ] Add daily check-in → stats update
- [ ] No JavaScript errors in console (F12)

## Screenshots

### Dashboard Overview
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Recent Stats     │ 📅 This Week's Plan                    │
│ 7d: 4.2 hrs         │ Monday - Bike Intervals                │
│ 4w: 16.8 hrs        │ Tuesday - Strength                     │
│ Consistency: 85%    │ Wednesday - Recovery                   │
│                     │ ...                                     │
├─────────────────────┼────────────────────────────────────────┤
│ 🌤️ Weather Outlook │ 🤖 LM Studio Status                    │
│ Mon: ☀️ 18-25°C    │ ✅ Connected (24ms)                    │
│ Tue: 🌧️ 15-20°C   │ Models: qwen2.5-7b-instruct            │
│ ...                 │ [Test Connection]                      │
└─────────────────────┴────────────────────────────────────────┘
```

## Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify server is running: `ps aux | grep coach_web_server`
3. Clear localStorage: `localStorage.clear()` in console
4. Reload page: `Cmd+R` / `Ctrl+R`

## Summary

✅ **Stats tracking** - Understand your recent training load
✅ **Weekly planning** - AI-generated workout schedule
✅ **Weather integration** - Plan outdoor activities strategically
✅ **LLM testing** - Verify AI connection anytime

**Result:** More informed training decisions with a complete overview of your fitness status, upcoming plan, and environmental conditions!
