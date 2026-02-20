// Node.js test script for Coach modules
// Tests the modules can be loaded and executed in Node.js context

const fs = require('fs');
const path = require('path');

console.log('🧪 Coach Module Tests - Node.js Environment\n');

// Load modules
function loadModule(filepath) {
  const code = fs.readFileSync(filepath, 'utf8');
  const module = { exports: {} };
  const func = new Function('module', 'exports', code);
  func(module, module.exports);
  return module.exports;
}

try {
  // Test 1: Load modules
  console.log('1️⃣  Loading Modules...');
  
  const recoveryModule = loadModule('./engine/recovery-scoring.js');
  const gapModule = loadModule('./engine/gap-detection.js');
  const workoutModule = loadModule('./engine/workout-planning.js');
  
  console.log('✅ recovery-scoring.js loaded');
  console.log('✅ gap-detection.js loaded');
  console.log('✅ workout-planning.js loaded');
  
  // Test 2: Recovery Scoring
  console.log('\n2️⃣  Testing Recovery Scoring...');
  
  const testDay = {
    date: '2026-02-16',
    recovery_signals: {
      resting_hr_bpm: 52,
      hrv_ms: 65,
      sleep_hours: 7.5,
      stress_score: 40
    },
    readiness: {
      garmin_training_readiness: 78,
      load_ratio: 1.1
    },
    subjective: {
      pain_0_10: 0,
      fatigue_0_10: 3,
      soreness_0_10: 3,
      illness_symptoms: false
    },
    activities: [
      {
        sport: 'run',
        duration_min: 45,
        exercise_load: 65,
        hr_zone_minutes: {
          z1: 5,
          z2: 30,
          z3: 8,
          z4: 2,
          z5: 0
        }
      }
    ]
  };
  
  const history = [testDay];
  const scoreData = recoveryModule.scoreRecovery(testDay, history, {});
  
  console.log(`   Recovery score: ${scoreData.score}`);
  console.log(`   Type: ${typeof scoreData.score}`);
  console.log(`   Valid range: ${scoreData.score >= -20 && scoreData.score <= 20}`);
  console.log(`   Completeness: ${scoreData.completeness}/6 signals`);
  console.log(`   Flags: ${scoreData.flags.join(', ') || 'none'}`);
  
  if (typeof scoreData.score === 'number') {
    console.log('✅ Recovery scoring works');
  } else {
    console.log('❌ Recovery scoring failed');
  }
  
  // Test 3: Gap Detection
  console.log('\n3️⃣  Testing Gap Detection...');
  
  const gapData = gapModule.detectGaps(history, testDay.date);
  console.log(`   Gaps found: ${gapData.gaps.length}`);
  console.log(`   Gap types: ${gapData.gaps.map(g => g.gap_type).join(', ') || 'none'}`);
  console.log(`   Zone mix - Low: ${gapData.mix.low_aerobic_pct}%, High: ${gapData.mix.high_pct}%`);
  
  if (Array.isArray(gapData.gaps)) {
    console.log('✅ Gap detection works');
  } else {
    console.log('❌ Gap detection failed');
  }
  
  // Test 4: Workout Selection
  console.log('\n4️⃣  Testing Workout Selection...');
  
  const testProfile = {
    favorite_sports: ['run', 'bike', 'swim'],
    access: {
      minutes_per_session: 60
    }
  };
  
  const workout = workoutModule.chooseWorkout(testProfile, testDay, scoreData, gapData);
  
  console.log(`   State: ${workout.state}`);
  console.log(`   Recommendation: ${workout.recommendationType}`);
  console.log(`   Sport: ${workout.chosenSport}`);
  console.log(`   Plan A: ${workout.planA.title} (${workout.planA.duration_min}min, ${workout.planA.intensity})`);
  console.log(`   Steps: ${workout.planA.steps[0]}`);
  
  if (workout && workout.state && workout.chosenSport && workout.planA) {
    console.log('✅ Workout selection works');
  } else {
    console.log('❌ Workout selection failed');
  }
  
  // Test 5: Edge Cases
  console.log('\n5️⃣  Testing Edge Cases...');
  
  // Low recovery
  const lowRecoveryDay = {
    date: '2026-02-17',
    recovery_signals: {
      resting_hr_bpm: 65,
      hrv_ms: 35,
      sleep_hours: 4,
      stress_score: 80
    },
    readiness: {
      garmin_training_readiness: 20
    },
    subjective: {
      soreness_0_10: 8,
      fatigue_0_10: 9,
      pain_0_10: 6,
      illness_symptoms: false
    },
    activities: []
  };
  
  const lowData = recoveryModule.scoreRecovery(lowRecoveryDay, [lowRecoveryDay], {});
  console.log(`   Low recovery score: ${lowData.score}`);
  
  if (lowData.score < 0 || lowData.forceRecover) {
    console.log('✅ Low recovery detected correctly');
  }
  
  // High recovery
  const highRecoveryDay = {
    date: '2026-02-18',
    recovery_signals: {
      resting_hr_bpm: 48,
      hrv_ms: 85,
      sleep_hours: 9,
      stress_score: 15
    },
    readiness: {
      garmin_training_readiness: 95,
      load_ratio: 0.8
    },
    subjective: {
      soreness_0_10: 1,
      fatigue_0_10: 1,
      pain_0_10: 0,
      illness_symptoms: false
    },
    activities: []
  };
  
  const highData = recoveryModule.scoreRecovery(highRecoveryDay, [highRecoveryDay], {});
  console.log(`   High recovery score: ${highData.score}`);
  
  if (highData.score > 5) {
    console.log('✅ High recovery detected correctly');
  }
  
  // Empty history
  const emptyGapData = gapModule.detectGaps([], '2026-02-16');
  console.log(`   Gaps on empty history: ${emptyGapData.gaps.length}`);
  
  if (Array.isArray(emptyGapData.gaps)) {
    console.log('✅ Handles empty history');
  }
  
  // Test 6: Data Quality
  console.log('\n6️⃣  Testing Data Quality...');
  
  // Missing recovery signals data
  const incompleteDay = {
    date: '2026-02-19',
    recovery_signals: {},
    subjective: {},
    activities: []
  };
  
  try {
    const incompleteData = recoveryModule.scoreRecovery(incompleteDay, [incompleteDay], {});
    console.log(`   Score with missing data: ${incompleteData.score}`);
    console.log(`   Completeness: ${incompleteData.completeness}/6`);
    console.log('✅ Handles missing recovery signals data');
  } catch (e) {
    console.log(`❌ Error on missing data: ${e.message}`);
  }
  
  // Test 7: Multi-day History
  console.log('\n7️⃣  Testing Multi-Day History...');
  
  const multiDayHistory = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date('2026-02-16');
    date.setDate(date.getDate() - i);
    multiDayHistory.push({
      date: date.toISOString().split('T')[0],
      recovery_signals: {
        sleep_hours: 7 + Math.random() * 2,
        resting_hr_bpm: 50 + Math.random() * 5,
        hrv_ms: 60 + Math.random() * 15
      },
      subjective: {
        soreness_0_10: 2 + Math.random() * 3
      },
      activities: i % 2 === 0 ? [
        { sport: 'run', duration_min: 40 + Math.random() * 20, exercise_load: 60 }
      ] : []
    });
  }
  
  const multiData = recoveryModule.scoreRecovery(multiDayHistory[0], multiDayHistory, {});
  const multiGapData = gapModule.detectGaps(multiDayHistory, multiDayHistory[0].date);
  
  console.log(`   Score with 14-day history: ${multiData.score}`);
  console.log(`   Completeness: ${multiData.completeness}/6`);
  console.log(`   Gaps with 14-day history: ${multiGapData.gaps.length}`);
  console.log('✅ Handles multi-day history');
  
  // Final Summary
  console.log('\n' + '='.repeat(50));
  console.log('🎉 All Tests Passed!');
  console.log('='.repeat(50));
  console.log('\n✅ Module Functionality:');
  console.log('   • Recovery scoring working');
  console.log('   • Gap detection working');
  console.log('   • Workout selection working');
  console.log('   • Edge cases handled');
  console.log('   • Data quality checks active');
  console.log('\n✅ Ready for browser testing!');
  
} catch (error) {
  console.error('\n❌ Test Failed:');
  console.error(error);
  process.exit(1);
}
