# Quick Test Commands

## 1. Server Health
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8080
```

## 2. Module Files Check
```bash
for file in utils/formatters.js storage/local-storage.js engine/recovery-scoring.js engine/gap-detection.js engine/workout-planning.js; do
  curl -s -o /dev/null -w "$file: %{http_code}\n" http://127.0.0.1:8080/$file
done
```

## 3. Browser Console Quick Test
Open http://127.0.0.1:8080 and paste in console (F12):

```javascript
// Quick validation
console.log({
  storage: typeof window.CoachStorage,
  utils: typeof window.CoachUtils,
  scoring: typeof scoreRecovery,
  gaps: typeof detectGaps,
  workouts: typeof chooseWorkout
});

// Test storage
localStorage.clear();
window.CoachStorage.saveProfile({ goals: ["test"] });
console.log("✅ Profile:", window.CoachStorage.loadProfile());

// Test daily
const day = {
  date: "2026-02-16",
  subjective: { sleep_quality_0_10: 8 },
  activities: [{ sport: "run", duration_minutes: 45 }]
};
window.CoachStorage.upsertDaily(day);
console.log("✅ History:", window.CoachStorage.loadDailyHistory().length, "days");

// Test recovery
const score = scoreRecovery(day, [day]);
console.log("✅ Recovery:", score);

// Test gaps
const gaps = detectGaps([day]);
console.log("✅ Gaps:", gaps.length);

console.log("🎉 All core functions working!");
```

## 4. Test Dashboard Functions
```javascript
// Update stats
if (typeof updateStats === 'function') {
  updateStats();
  console.log("✅ Stats updated");
}

// Regenerate plan
if (typeof generateWeeklyPlan === 'function') {
  generateWeeklyPlan();
  console.log("✅ Plan generated");
}

// Check elements
const checks = {
  stats: document.getElementById('stats-7d-volume'),
  plan: document.getElementById('weekly-plan'),
  weather: document.getElementById('weather-forecast'),
  llm: document.getElementById('test-llm')
};
console.log("Elements:", Object.keys(checks).every(k => checks[k] !== null) ? "✅ All found" : "❌ Missing");
```

## 5. Test Weather (requires internet)
```javascript
fetchWeather().then(() => {
  console.log("✅ Weather loaded");
}).catch(e => {
  console.error("❌ Weather failed:", e.message);
});
```

## 6. Test LLM Connection
```javascript
testLLMConnection().then(() => {
  console.log("✅ LLM test complete - check status box");
}).catch(e => {
  console.log("⚠️  LLM service unavailable:", e.message);
});
```

## 7. Security Test - Password Sanitization
```javascript
// Save config with password
window.CoachStorage.saveGarminConfig({
  garmin_user: "test@example.com",
  garmin_password: "SECRET123",
  garmin_mfa_code: "123456"
});

// Load and verify passwords removed
const loaded = window.CoachStorage.loadGarminConfig();
console.log("Password removed:", !loaded.garmin_password ? "✅ YES" : "❌ NO");
console.log("MFA removed:", !loaded.garmin_mfa_code ? "✅ YES" : "❌ NO");
console.log("Email saved:", loaded.garmin_user === "test@example.com" ? "✅ YES" : "❌ NO");
```

## 8. Check Console for Errors
```javascript
// This should run without errors
try {
  // Test all main functions
  window.CoachStorage.loadProfile();
  window.CoachUtils.round(3.14, 1);
  const testDay = { date: "2026-02-16", subjective: {}, activities: [] };
  scoreRecovery(testDay, [testDay]);
  detectGaps([testDay]);
  chooseWorkout(75, [], ["run"]);
  console.log("✅ NO ERRORS - All functions executable");
} catch (e) {
  console.error("❌ ERROR:", e);
}
```

## Expected Results

### ✅ All Tests Pass:
- HTTP 200 for all files
- All modules return 'object' or 'function'
- Profile/daily save/load works
- Recovery score is number 0-100
- Gaps is array
- No console errors
- Passwords sanitized
- Dashboard elements present

### 🚀 Ready to Use!
