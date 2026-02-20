#!/usr/bin/env node
/**
 * Weather-Aware Adjustments Test & Demo
 * Demonstrates weather analysis and workout adjustments
 */

import {
  analyzeWeatherConditions,
  generateWeatherAdjustments,
  getWeatherAwareWorkout
} from './backend/src/services/weather-aware.js';

console.log('🌦️  Weather-Aware Workout Adjustments - Test Suite\n');
console.log('=' .repeat(70));

// Test scenarios with different weather conditions
const testScenarios = [
  {
    name: 'Ideal Conditions',
    weather: {
      current: {
        temp: 15,
        feels_like: 14,
        humidity: 55,
        pressure: 1015,
        wind_speed: 3,
        wind_gust: null,
        visibility: 10000,
        clouds: 20,
        condition: 'Clear',
        description: 'clear sky',
        rain_1h: 0,
        snow_1h: 0
      }
    },
    workout: {
      sport: 'cycling',
      duration: 90,
      type: 'endurance'
    }
  },
  {
    name: 'Extreme Heat',
    weather: {
      current: {
        temp: 35,
        feels_like: 42,
        humidity: 70,
        pressure: 1010,
        wind_speed: 5,
        wind_gust: null,
        visibility: 8000,
        clouds: 10,
        condition: 'Clear',
        description: 'clear sky',
        rain_1h: 0,
        snow_1h: 0
      }
    },
    workout: {
      sport: 'running',
      duration: 60,
      type: 'tempo'
    }
  },
  {
    name: 'Thunderstorm',
    weather: {
      current: {
        temp: 22,
        feels_like: 23,
        humidity: 85,
        pressure: 998,
        wind_speed: 18,
        wind_gust: 25,
        visibility: 3000,
        clouds: 95,
        condition: 'Thunderstorm',
        description: 'thunderstorm with rain',
        rain_1h: 15,
        snow_1h: 0
      }
    },
    workout: {
      sport: 'cycling',
      duration: 120,
      type: 'long_ride'
    }
  },
  {
    name: 'Cold Winter',
    weather: {
      current: {
        temp: -8,
        feels_like: -15,
        humidity: 75,
        pressure: 1025,
        wind_speed: 12,
        wind_gust: 18,
        visibility: 7000,
        clouds: 60,
        condition: 'Snow',
        description: 'light snow',
        rain_1h: 0,
        snow_1h: 2
      }
    },
    workout: {
      sport: 'running',
      duration: 45,
      type: 'easy'
    }
  },
  {
    name: 'Moderate Rain',
    weather: {
      current: {
        temp: 12,
        feels_like: 10,
        humidity: 88,
        pressure: 1008,
        wind_speed: 8,
        wind_gust: 12,
        visibility: 4000,
        clouds: 100,
        condition: 'Rain',
        description: 'moderate rain',
        rain_1h: 6,
        snow_1h: 0
      }
    },
    workout: {
      sport: 'cycling',
      duration: 75,
      type: 'intervals'
    }
  }
];

// Run tests
testScenarios.forEach((scenario, index) => {
  console.log(`\n${index + 1}. ${scenario.name.toUpperCase()}`);
  console.log('-'.repeat(70));
  
  // Display conditions
  const w = scenario.weather.current;
  console.log(`\n📊 Conditions:`);
  console.log(`   Temperature: ${w.temp}°C (feels like ${w.feels_like}°C)`);
  console.log(`   Humidity: ${w.humidity}%`);
  console.log(`   Wind: ${w.wind_speed} m/s${w.wind_gust ? ` (gusts ${w.wind_gust} m/s)` : ''}`);
  console.log(`   Weather: ${w.description}`);
  if (w.rain_1h > 0) console.log(`   Rain: ${w.rain_1h}mm/hr`);
  if (w.snow_1h > 0) console.log(`   Snow: ${w.snow_1h}mm/hr`);
  console.log(`   Visibility: ${w.visibility}m`);
  
  // Analyze weather
  const analysis = analyzeWeatherConditions(scenario.weather);
  
  console.log(`\n⚠️  Safety Analysis:`);
  console.log(`   Risk Level: ${analysis.risk_level.toUpperCase()}`);
  console.log(`   Safety Score: ${analysis.safety_score}/100`);
  
  if (analysis.warnings.length > 0) {
    console.log(`\n   🚨 WARNINGS:`);
    analysis.warnings.forEach(w => {
      console.log(`      [${w.severity.toUpperCase()}] ${w.message}`);
    });
  }
  
  if (analysis.concerns.length > 0) {
    console.log(`\n   ⚡ Concerns:`);
    analysis.concerns.slice(0, 3).forEach(c => {
      console.log(`      • ${c.message}`);
    });
  }
  
  if (analysis.advantages.length > 0) {
    console.log(`\n   ✅ Advantages:`);
    analysis.advantages.forEach(a => {
      console.log(`      • ${a}`);
    });
  }
  
  // Generate adjustments
  const adjustments = generateWeatherAdjustments(scenario.weather, analysis, scenario.workout);
  
  console.log(`\n🏋️  Planned Workout:`);
  console.log(`   Sport: ${scenario.workout.sport}`);
  console.log(`   Duration: ${scenario.workout.duration} minutes`);
  console.log(`   Type: ${scenario.workout.type}`);
  
  if (adjustments.modifications.length > 0) {
    console.log(`\n🔧 Adjustments:`);
    adjustments.modifications.forEach(mod => {
      const icon = mod.severity === 'critical' ? '🚨' : 
                   mod.severity === 'high' ? '⚠️' : 
                   mod.severity === 'medium' ? '⚡' : 'ℹ️';
      console.log(`   ${icon} ${mod.change}`);
      console.log(`      Reason: ${mod.reason}`);
    });
  }
  
  if (adjustments.timing_recommendation) {
    console.log(`\n⏰ Timing Recommendation:`);
    console.log(`   Best time: ${adjustments.timing_recommendation.window}`);
    console.log(`   Reason: ${adjustments.timing_recommendation.reason}`);
  }
  
  if (adjustments.gear_recommendations.length > 0) {
    console.log(`\n👕 Gear Recommendations:`);
    adjustments.gear_recommendations.slice(0, 4).forEach(gear => {
      console.log(`   • ${gear}`);
    });
    if (adjustments.gear_recommendations.length > 4) {
      console.log(`   ... and ${adjustments.gear_recommendations.length - 4} more`);
    }
  }
  
  if (adjustments.hydration_adjustment !== 'normal') {
    console.log(`\n💧 Hydration: ${adjustments.hydration_adjustment.toUpperCase()}`);
  }
  
  if (adjustments.nutrition_notes.length > 0) {
    console.log(`\n🍎 Nutrition Notes:`);
    adjustments.nutrition_notes.slice(0, 2).forEach(note => {
      console.log(`   • ${note}`);
    });
  }
  
  if (adjustments.indoor_alternative) {
    console.log(`\n🏠 Indoor Alternative:`);
    console.log(`   Activity: ${adjustments.indoor_alternative.activity}`);
    console.log(`   Duration: ${adjustments.indoor_alternative.duration} minutes`);
    console.log(`   Notes: ${adjustments.indoor_alternative.notes}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\n✅ Weather-Aware Adjustments System Test Complete!\n');

console.log('📝 Summary:');
console.log('   • Analyzes temperature, humidity, wind, precipitation, visibility');
console.log('   • Calculates safety score (0-100) and risk level');
console.log('   • Adjusts workout intensity and duration for conditions');
console.log('   • Provides gear, hydration, and nutrition recommendations');
console.log('   • Suggests optimal timing windows');
console.log('   • Generates indoor alternatives when needed\n');

console.log('🔑 To enable live weather data:');
console.log('   1. Get free API key from: https://openweathermap.org/api');
console.log('   2. Add to backend/.env: OPENWEATHER_API_KEY=your_key_here');
console.log('   3. Restart backend server\n');
