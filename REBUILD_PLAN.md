# Coach App - Clean Rebuild Plan

## Current Problems
- ❌ Buttons don't work
- ❌ Module loading issues
- ❌ Browser caching problems
- ❌ Duplicate function declarations
- ❌ DOM timing issues
- ❌ Overly complex initialization

## Core Requirements

### What the app needs to do:
1. **Profile Management** - Save/load athlete profile (goals, sports, FTP, etc.)
2. **Daily Check-in** - Add activities, record pain/mood/readiness
3. **AI Recommendations** - Generate training advice based on check-in
4. **Garmin Integration** - Sync config, run sync commands
5. **Dashboard** - Show stats, weekly plan, weather, LLM status
6. **Chat** - Talk to LLM coach
7. **Data Persistence** - localStorage for all data

### Technical Stack:
- Pure JavaScript (no frameworks)
- HTML forms for input
- localStorage for persistence
- Modular architecture (5 existing modules)
- Node.js HTTP server

## Clean Architecture

```
┌─────────────────────────────────────────┐
│           Browser (index.html)          │
│  ┌───────────────────────────────────┐  │
│  │  UI Layer (app.js)                │  │
│  │  - Event handlers                 │  │
│  │  - Form management                │  │
│  │  - DOM updates                    │  │
│  └───────────────┬───────────────────┘  │
│                  │                       │
│  ┌───────────────▼───────────────────┐  │
│  │  Business Logic (modules)         │  │
│  │  - storage/local-storage.js      │  │
│  │  - utils/formatters.js            │  │
│  │  - engine/recovery-scoring.js    │  │
│  │  - engine/gap-detection.js       │  │
│  │  - engine/workout-planning.js    │  │
│  └───────────────┬───────────────────┘  │
│                  │                       │
│  ┌───────────────▼───────────────────┐  │
│  │  Browser APIs                     │  │
│  │  - localStorage                   │  │
│  │  - fetch (for LLM/weather)       │  │
│  │  - DOM API                        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## New app.js Structure

### 1. Module Imports (Top)
```javascript
// Check modules exist
// Import from window.CoachStorage
// Import from window.CoachUtils
// Import engine functions
```

### 2. State (Simple Variables)
```javascript
let profile = null;
let dailyHistory = [];
let chatLog = [];
// etc.
```

### 3. DOM References (Null Initially)
```javascript
let profileForm = null;
let addActivityBtn = null;
// etc.
```

### 4. Initialization
```javascript
document.addEventListener('DOMContentLoaded', () => {
  initDOM();      // Get all DOM references
  initData();     // Load from localStorage
  initEvents();   // Attach event listeners
  initDashboard(); // Set up dashboard
  console.log('✅ Ready');
});
```

### 5. Event Handlers (One per button/form)
```javascript
function handleProfileSubmit(e) { ... }
function handleAddActivity() { ... }
function handleRemoveActivity(e) { ... }
// etc.
```

### 6. UI Update Functions
```javascript
function updateStats() { ... }
function renderWeeklyPlan() { ... }
function renderChat() { ... }
```

### 7. Utilities (Local helpers)
```javascript
function showSuccess(message) { ... }
function showError(message) { ... }
```

## Implementation Steps

### Phase 1: Minimal Working App
1. ✅ Create new app.js with ONLY profile form
2. ✅ Test: Can save/load profile
3. ✅ Verify: No console errors

### Phase 2: Add Check-in
1. ✅ Add activity cards (add/remove)
2. ✅ Add check-in form
3. ✅ Test: Can submit check-in

### Phase 3: Add Dashboard
1. ✅ Stats widget
2. ✅ Weekly plan widget
3. ✅ Weather widget
4. ✅ LLM status widget

### Phase 4: Add Integrations
1. ✅ Garmin config
2. ✅ Chat
3. ✅ LLM recommendations

## Key Principles

1. **One responsibility per function** - No giant functions
2. **Explicit over implicit** - Clear variable names, obvious flow
3. **Fail gracefully** - Try/catch on critical operations
4. **Log everything** - Console logs for debugging
5. **No globals** - Everything in closures or explicit state
6. **Progressive enhancement** - Core works without extras

## Testing Strategy

1. **Manual smoke test** after each phase:
   - Load page → No console errors ✅
   - Click button → Something happens ✅
   - Save data → Persists after refresh ✅

2. **Browser compatibility**:
   - Test in Brave (primary)
   - Clear cache between tests
   - Check localStorage in DevTools

3. **Error scenarios**:
   - No localStorage → Show error
   - Module missing → Show error
   - Form invalid → Show error

## File Changes

- `app.js` → **COMPLETE REWRITE** (~500 lines, not 1400)
- `index.html` → Keep as-is (working)
- `styles.css` → Keep as-is (working)
- Modules → Keep as-is (tested, working)

## Success Criteria

✅ Page loads with no console errors
✅ Can save profile → Persists after refresh
✅ Can add/remove activities
✅ Can generate recommendation (if LLM running)
✅ Dashboard shows stats
✅ All buttons respond to clicks
✅ Code is under 600 lines
✅ No duplicate functions
✅ No timing issues

## Time Estimate

- Phase 1 (Profile): 15 min
- Phase 2 (Check-in): 20 min
- Phase 3 (Dashboard): 20 min
- Phase 4 (Integrations): 25 min
- **Total: ~80 minutes** for clean rebuild

---

Ready to start? I'll build Phase 1 first (minimal working app with just profile form).
