# 🧪 Brave Browser Testing Guide

**URL**: http://127.0.0.1:8080

## Quick Start

1. **Open DevTools**: Press `F12` or `Cmd+Option+I`
2. **Go to Console tab**
3. **Run automated test** (paste and press Enter):

```javascript
// Paste the contents of test-buttons.js here
// OR load it via:
fetch('/test-buttons.js').then(r => r.text()).then(eval);
```

## Manual Button Tests

### Dashboard Section (Top)

#### 1. Stats Widget
- **What to see**: Current stats, 7-day averages, 4-week averages
- **Expected**: Numbers should display (may be 0 if no data)
- ✅ **Status**: Always visible on page load

#### 2. Weekly Plan Widget
- **Button**: Refresh icon (🔄)
- **Expected**: Plan regenerates with workout recommendations
- ✅ **Test**: Click refresh → Plan updates

#### 3. Weather Widget
- **Button**: "Get Forecast"
- **Expected**: Fetches weather (requires internet)
- ⚠️ **Note**: May fail if external API unreachable

#### 4. LLM Status Widget
- **Button**: "Test Connection"
- **Expected**: Status changes to "Testing..." then result
- ⚠️ **Note**: Requires LM Studio running on localhost:1234

### Profile Section

#### 5. Profile Form
- **Button**: Submit (inside form)
- **Test**: 
  1. Fill in name, FTP, max HR, sports
  2. Click Submit
  3. **Expected**: "Profile saved!" message

### Garmin Integration

#### 6. Garmin Config Form
- **Button**: Submit
- **Test**: Fill email, password → Submit
- **Expected**: "Garmin config saved!" message
- ⚠️ **Security**: Password saved in localStorage (dev only)

#### 7. Copy Command Button
- **Button**: "Copy command"
- **Test**: Click → Check clipboard
- **Expected**: Command copied to clipboard

#### 8. Sync Latest Button
- **Button**: "Sync latest data"
- **Test**: Click
- **Expected**: Makes API call to `/api/garmin/sync-latest`
- ⚠️ **Note**: Requires backend endpoint

### Check-in Section

#### 9. Add Activity Button (+)
- **Button**: "+" icon
- **Test**: Click
- **Expected**: New activity card appears

#### 10. Remove Activity Button (×)
- **Button**: "×" on activity card
- **Prerequisites**: At least one activity card
- **Test**: Click × on any activity
- **Expected**: Activity card disappears

#### 11. Generate Recommendation
- **Button**: Submit
- **Test**: 
  1. Add activities with type/intensity/duration
  2. Fill pain/mood/readiness
  3. Submit
- **Expected**: AI recommendation appears below

### LM Studio Config

#### 12. LM Studio Form
- **Button**: Submit
- **Test**: Enter API URL → Submit
- **Expected**: Config saved message

### Chat Section

#### 13. Chat Form
- **Button**: Send (or press Enter)
- **Test**: Type message → Send
- **Expected**: Message sent to LLM, response appears
- ⚠️ **Note**: Requires LM Studio running

## Console Verification Commands

```javascript
// 1. Check modules loaded
console.log('Storage:', typeof window.CoachStorage);
console.log('Utils:', typeof window.CoachUtils);
console.log('Recovery:', typeof scoreRecovery);
console.log('Gaps:', typeof detectGaps);
console.log('Workout:', typeof chooseWorkout);

// 2. Check dashboard initialized
console.log('Dashboard:', document.getElementById('section-dashboard'));
console.log('Stats:', document.getElementById('stats-7d'));
console.log('Plan:', document.getElementById('weekly-plan'));

// 3. Test button existence
const buttons = {
  'test-llm': document.getElementById('test-llm'),
  'fetch-weather': document.getElementById('fetch-weather'),
  'refresh-plan': document.getElementById('refresh-plan'),
  'add-activity': document.getElementById('add-activity'),
  'garmin-copy-command': document.getElementById('garmin-copy-command'),
  'garmin-sync-latest': document.getElementById('garmin-sync-latest')
};
console.table(buttons);

// 4. Check localStorage
console.log('Profile:', localStorage.getItem('coach:profile'));
console.log('Daily History:', localStorage.getItem('coach:daily'));

// 5. Test a function manually
window.CoachUtils.formatDuration(135); // Should show "2h 15min"
window.CoachUtils.formatPace(245); // Should show "4:05/km"
```

## Automated Test Script

Run this in console for comprehensive testing:

```javascript
// Load and run test-buttons.js
fetch('/test-buttons.js')
  .then(r => r.text())
  .then(code => {
    eval(code);
    console.log('✅ Test script loaded and running');
  })
  .catch(err => console.error('❌ Failed to load test script:', err));
```

## Expected Console Output (Success)

```
🔘 Testing All Buttons

🧪 Running Button Tests...

1. Test LLM Button
✅ Test LLM Connection: Button exists
  🔘 Clicking "Test Connection"...
  ✅ Button works - status updated

2. Fetch Weather Button
✅ Get Forecast: Button exists
  📡 Weather button functional

3. Refresh Plan Button
✅ Regenerate Plan: Button exists
  🔘 Clicking "Regenerate Plan"...
  ✅ Button works - plan regenerated

[... more tests ...]

==================================================
🔘 Button Test Results
==================================================
✅ Passed: 17
❌ Failed: 0
Total: 17

🎉 All buttons work correctly!
```

## Troubleshooting

### No buttons appear
- Check: Network tab → All JS files loaded? (app.js, modules)
- Check: Console errors?

### Functions undefined
- Check: Module script tags in index.html
- Check: `<script type="module">` for modules
- Check: Order of script loading

### Dashboard empty
- Normal: No data yet
- Test: Submit profile and check-in to generate data

### LLM tests fail
- Normal: LM Studio not running
- Fix: Start LM Studio on port 1234
- Or: Skip LLM-related tests

### API calls fail
- Check: Server running on port 8080?
- Check: Network tab for 404/500 errors

## Success Criteria

✅ All buttons are clickable (not disabled)
✅ No console errors on page load
✅ Dashboard displays (even if empty)
✅ Forms can be submitted
✅ Activity cards can be added/removed
✅ Profile can be saved and loaded
✅ All modules loaded (check console)

## Performance Check

```javascript
// Check page load time
performance.timing.loadEventEnd - performance.timing.navigationStart;
// Should be < 1000ms

// Check module load
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('.js'))
  .map(r => ({ name: r.name.split('/').pop(), duration: r.duration }));
```

---

**Testing Date**: February 16, 2026
**Browser**: Brave
**Platform**: macOS
**Server**: http://127.0.0.1:8080
