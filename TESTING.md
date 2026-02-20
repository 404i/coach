# Refactoring Test Plan

## 🎯 What Changed

### Modularization Complete
- ✅ Extracted 5 reusable modules from app.js
- ✅ Reduced app.js from 1,209 → 1,075 lines (11% reduction)
- ✅ Eliminated all duplicate code
- ✅ Created storage abstraction layer

### New Files
1. **engine/recovery-scoring.js** - Recovery scoring algorithm
2. **engine/gap-detection.js** - Training gap detection  
3. **engine/workout-planning.js** - Workout recommendation logic
4. **storage/local-storage.js** - localStorage abstraction
5. **utils/formatters.js** - Utility functions

## 🧪 Manual Testing Steps

### 1. Basic Page Load
- [x] Server started: http://127.0.0.1:8080
- [ ] Open in browser
- [ ] Check: No JavaScript errors in console (F12)
- [ ] Check: All sections visible (Profile, Daily Check-In, Chat, etc.)

### 2. Profile Section
- [ ] Fill out athlete profile form
- [ ] Click "Save Profile"
- [ ] Check: Success message appears
- [ ] Reload page
- [ ] Check: Profile data persists

### 3. Daily Check-In
- [ ] Fill out today's data (sleep, HRV, soreness, etc.)
- [ ] Add an activity (sport, duration, intensity)
- [ ] Click "Submit Check-In"
- [ ] Check: Recommendation appears in chat
- [ ] Check: Recommendation has workout details

### 4. Storage Functions
Open browser console (F12) and run:
```javascript
// Test storage module is available
console.log('CoachStorage:', window.CoachStorage);
console.log('CoachUtils:', window.CoachUtils);

// Test save/load
const testProfile = { name: 'Test Athlete', age: 30 };
window.CoachStorage.saveProfile(testProfile);
console.log('Loaded:', window.CoachStorage.loadProfile());

// Test daily history
const testDaily = { date: '2025-01-17', sleep_hours: 8 };
window.CoachStorage.upsertDaily(testDaily);
console.log('History:', window.CoachStorage.loadDailyHistory());
```

### 5. Utility Functions
Test in browser console:
```javascript
// Test formatters
console.log(window.CoachUtils.toISODate(new Date()));
console.log(window.CoachUtils.round(3.14159, 2)); // 3.14
console.log(window.CoachUtils.capitalize('hello')); // 'Hello'
console.log(window.CoachUtils.prettySignal('high', 8)); // 'HIGH (8)'
```

### 6. Engine Functions
Test in browser console:
```javascript
// Test recovery scoring (loaded globally, not namespaced)
const testDay = {
  date: '2025-01-17',
  subjective: { sleep_quality_0_10: 7, soreness_0_10: 3, stress_0_10: 4 },
  activities: []
};
const history = [testDay];
const score = scoreRecovery(testDay, history);
console.log('Recovery score:', score);

// Test gap detection
const gaps = detectGaps(history);
console.log('Training gaps:', gaps);
```

### 7. Garmin Sync
- [ ] Fill out Garmin credentials
- [ ] Click "Save Garmin Config"
- [ ] Click "Sync Latest"
- [ ] Check: Terminal command appears
- [ ] Check: Copy button works

### 8. LM Studio Integration
- [ ] Fill out LM Studio URL (http://127.0.0.1:1234/v1)
- [ ] Fill out model name
- [ ] Click "Save LM Studio Config"
- [ ] Try sending a chat message
- [ ] Check: Response appears (if LM Studio running)

## ✅ Success Criteria

All of these should work:
- [ ] No JavaScript console errors
- [ ] Profile save/load works
- [ ] Daily check-in works
- [ ] Recommendations generate
- [ ] Page reload preserves data
- [ ] All modules load correctly
- [ ] Storage abstraction works
- [ ] Utility functions work
- [ ] Engine functions work

## 🐛 Known Issues to Verify Fixed

1. **Timezone bug** - daysBetween() now uses UTC
   - Test: Add activities over multiple days
   - Verify: Recovery score calculates correctly

2. **Type coercion bug** - Pain scores converted to numbers
   - Test: Enter pain score "5" (string)
   - Verify: Recommendation logic treats it as number

3. **Null reference errors** - Array checks added
   - Test: Check-in without activities
   - Verify: No console errors

## 🔄 Rollback Instructions

If major issues found:
```bash
# Revert to pre-refactor state
git checkout HEAD~N -- app.js index.html
rm -rf engine/ storage/ utils/
```

Then reload browser.

## 📝 Test Results

Date: _______________
Tester: _______________

| Test | Pass | Fail | Notes |
|------|------|------|-------|
| Page loads without errors | [ ] | [ ] | |
| Profile save/load | [ ] | [ ] | |
| Daily check-in | [ ] | [ ] | |
| Recommendation generation | [ ] | [ ] | |
| Data persistence | [ ] | [ ] | |
| Storage module | [ ] | [ ] | |
| Utility functions | [ ] | [ ] | |
| Engine functions | [ ] | [ ] | |
| Garmin sync UI | [ ] | [ ] | |
| LM Studio UI | [ ] | [ ] | |

**Overall Status**: _______________

**Critical Issues**: _______________

**Minor Issues**: _______________

**Recommendation**: [ ] Deploy [ ] Fix issues [ ] Rollback
