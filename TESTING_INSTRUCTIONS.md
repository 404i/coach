# Testing Instructions - Coach App v2.0.0-fixed

## 🚀 Quick Start

1. **Open in Browser**: http://127.0.0.1:8080
2. **Open DevTools**: Press `F12` or `Cmd+Option+I`
3. **Check Console**: You should see:
   ```
   🚀 Coach App 2.0.0-fixed Loading...
   ��� Initializing Coach app...
   ✅ DOM elements initialized
   ✅ Event listeners attached
   ✨ Coach App 2.0.0-fixed Ready!
   ```

## 🧪 Run Diagnostic Tests

Open http://127.0.0.1:8080/test.html and click all test buttons:
- Test Modules
- Test Storage  
- Test DOM
- Click Me! (event listener test)

All should show green ✅ checkmarks.

## ✅ Test Each Feature

### 1. Profile Form
1. Scroll to "Athlete Profile" section
2. Fill in:
   - Name: Your Name
   - FTP: 200
   - Max HR: 180
   - Select at least one sport (running/cycling/swimming)
3. Click **Submit**
4. Should see: "Profile saved." message in green

### 2. Add/Remove Activities
1. Scroll to "Today's Check-in" section
2. Click the **"+"** button
3. Activity card should appear
4. Click **"× Remove"** on the card
5. Card should disappear

### 3. Dashboard
At the top of the page:
- **Stats Widget**: Should show "0" if no data, or actual values
- **Weekly Plan**: Click refresh icon (🔄) → Plan should regenerate
- **Weather**: Click "Get Forecast" → Should fetch weather (requires internet)
- **LLM Status**: Click "Test Connection" → Should test (requires LM Studio running)

### 4. Garmin Integration
1. Scroll to "Garmin Connect Integration"
2. Fill credentials (test values ok)
3. Click **Submit** → "Garmin config saved!"
4. Click **"Copy command"** → Command copied to clipboard
5. Click **"Sync latest data"** → Makes API call (may fail if no backend)

### 5. Generate Recommendation
1. Add an activity (click + button)
2. Set type, intensity, duration
3. Fill pain/mood/readiness (0-10 sliders)
4. Click **"Generate recommendation"**
5. Should see AI recommendation below form

### 6. Chat
1. Scroll to bottom "Chat with Coach"
2. Type a message
3. Click **Send** or press Enter
4. Should send to LLM (requires LM Studio)

## 🐛 If Something Doesn't Work

### Check Console for Errors
Look for red ❌ messages that show:
- Which module failed to load
- Which DOM element is missing
- Which function failed

### Common Issues

**"CoachStorage module not loaded"**
- Check: http://127.0.0.1:8080/storage/local-storage.js loads (200 OK)
- Solution: Restart server

**"Missing DOM elements"**
- Check: http://127.0.0.1:8080/index.html has all form IDs
- Solution: Hard refresh (Cmd+Shift+R)

**"Functions not exported"**
- Check console for: `typeof window.onSaveProfile` 
- Should return: `"function"`
- Solution: Clear browser cache

### Nuclear Option
```bash
# Kill server
pkill -f coach_web_server

# Clear browser localStorage
# In console: localStorage.clear()

# Restart server
node scripts/coach_web_server.js &

# Hard refresh browser
Cmd+Shift+R
```

## 📊 Success Criteria

✅ Console shows "Coach App 2.0.0-fixed Ready!"  
✅ All test.html tests pass  
✅ Can save profile  
✅ Can add/remove activities  
✅ Buttons respond to clicks  
✅ Forms can be submitted  
✅ Dashboard displays  
✅ No console errors

## 🎯 Report Back

If it works: "All tests passed!"  
If it fails: Copy/paste the console errors starting with ❌

## 🔧 Files Modified

- app.js (v2.0.0-fixed) - Complete rewrite with:
  - Module loading checks
  - DOM element validation
  - Try/catch error handling
  - Detailed console logging
  - Function exports

- test.html (new) - Diagnostic test page

Ready to test! 🚀
