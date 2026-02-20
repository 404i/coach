#!/bin/bash
# Coach Web App API Test Script

echo "🧪 Testing Coach Web Server"
echo "============================="

BASE_URL="http://127.0.0.1:8080"

# Test 1: Server Health
echo ""
echo "1️⃣  Server Health Check"
CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL)
if [ "$CODE" = "200" ]; then
  echo "✅ Server responding - HTTP $CODE"
else
  echo "❌ Server not responding - HTTP $CODE"
  exit 1
fi

# Test 2: Static Files
echo ""
echo "2️⃣  Static Files"
for file in index.html styles.css app.js; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/$file)
  if [ "$CODE" = "200" ]; then
    echo "✅ $file - HTTP $CODE"
  else
    echo "❌ $file - HTTP $CODE"
  fi
done

# Test 3: Module Files
echo ""
echo "3️⃣  Module Files"
for module in utils/formatters.js storage/local-storage.js engine/recovery-scoring.js engine/gap-detection.js engine/workout-planning.js; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/$module)
  if [ "$CODE" = "200" ]; then
    echo "✅ $module"
  else
    echo "❌ $module - HTTP $CODE"
  fi
done

# Test 4: HTML Content
echo ""
echo "4️⃣  HTML Structure"
HTML=$(curl -s $BASE_URL)

if echo "$HTML" | grep -q "section-dashboard"; then
  echo "✅ Dashboard section present"
else
  echo "❌ Dashboard missing"
fi

if echo "$HTML" | grep -q "stats-7d-volume"; then
  echo "✅ Stats widgets present"
else
  echo "❌ Stats widgets missing"
fi

if echo "$HTML" | grep -q "weekly-plan"; then
  echo "✅ Weekly plan present"
else
  echo "❌ Weekly plan missing"
fi

if echo "$HTML" | grep -q "weather-forecast"; then
  echo "✅ Weather widget present"
else
  echo "❌ Weather widget missing"
fi

if echo "$HTML" | grep -q "test-llm"; then
  echo "✅ LLM test button present"
else
  echo "❌ LLM test button missing"
fi

echo ""
echo "✅ Server tests complete!"
echo ""
echo "Next steps:"
echo "1. Open http://127.0.0.1:8080 in browser"
echo "2. Open console (F12)"
echo "3. Copy/paste test-suite.js content"
echo "4. Run manual UI tests"
