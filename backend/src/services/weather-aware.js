/**
 * Weather-Aware Workout Adjustment Service
 * Modifies workout recommendations based on weather conditions
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * Get current weather and forecast
 */
export async function getWeatherData(lat, lon) {
  if (!OPENWEATHER_API_KEY) {
    throw new Error('Weather API key not configured');
  }
  
  try {
    // Get current weather
    const currentResponse = await axios.get(`${OPENWEATHER_URL}/weather`, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: 'metric'
      }
    });
    
    // Get 3-hour forecast for next 24 hours
    const forecastResponse = await axios.get(`${OPENWEATHER_URL}/forecast`, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: 'metric',
        cnt: 8 // Next 24 hours (8 x 3-hour periods)
      }
    });
    
    return {
      current: parseCurrentWeather(currentResponse.data),
      forecast: parseForecast(forecastResponse.data)
    };
  } catch (error) {
    logger.error('Error fetching weather data:', error);
    throw error;
  }
}

/**
 * Parse current weather data
 */
function parseCurrentWeather(data) {
  return {
    temp: Math.round(data.main.temp),
    feels_like: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind_speed: data.wind.speed,
    wind_gust: data.wind.gust || null,
    visibility: data.visibility,
    clouds: data.clouds.all,
    condition: data.weather[0].main,
    description: data.weather[0].description,
    icon: data.weather[0].icon,
    rain_1h: data.rain?.['1h'] || 0,
    snow_1h: data.snow?.['1h'] || 0,
    dt: data.dt,
    sunrise: data.sys.sunrise,
    sunset: data.sys.sunset
  };
}

/**
 * Parse forecast data
 */
function parseForecast(data) {
  return data.list.map(item => ({
    dt: item.dt,
    dt_txt: item.dt_txt,
    temp: Math.round(item.main.temp),
    feels_like: Math.round(item.main.feels_like),
    humidity: item.main.humidity,
    wind_speed: item.wind.speed,
    wind_gust: item.wind.gust || null,
    condition: item.weather[0].main,
    description: item.weather[0].description,
    rain_3h: item.rain?.['3h'] || 0,
    snow_3h: item.snow?.['3h'] || 0,
    clouds: item.clouds.all
  }));
}

/**
 * Analyze weather conditions and assess safety
 */
export function analyzeWeatherConditions(weather) {
  const { current } = weather;
  
  const analysis = {
    safety_score: 100,
    warnings: [],
    concerns: [],
    advantages: [],
    risk_level: 'low'
  };
  
  // Temperature analysis
  const tempAnalysis = analyzeTemperature(current.temp, current.feels_like, current.humidity);
  analysis.safety_score -= tempAnalysis.penalty;
  analysis.warnings.push(...tempAnalysis.warnings);
  analysis.concerns.push(...tempAnalysis.concerns);
  analysis.advantages.push(...tempAnalysis.advantages);
  
  // Wind analysis
  const windAnalysis = analyzeWind(current.wind_speed, current.wind_gust);
  analysis.safety_score -= windAnalysis.penalty;
  analysis.warnings.push(...windAnalysis.warnings);
  analysis.concerns.push(...windAnalysis.concerns);
  
  // Precipitation analysis
  const precipAnalysis = analyzePrecipitation(current.condition, current.rain_1h, current.snow_1h);
  analysis.safety_score -= precipAnalysis.penalty;
  analysis.warnings.push(...precipAnalysis.warnings);
  analysis.concerns.push(...precipAnalysis.concerns);
  
  // Visibility analysis
  const visAnalysis = analyzeVisibility(current.visibility);
  analysis.safety_score -= visAnalysis.penalty;
  analysis.warnings.push(...visAnalysis.warnings);
  analysis.concerns.push(...visAnalysis.concerns);
  
  // Air quality proxy (humidity + pressure)
  const airAnalysis = analyzeAirQuality(current.humidity, current.pressure);
  analysis.concerns.push(...airAnalysis.concerns);
  analysis.advantages.push(...airAnalysis.advantages);
  
  // Determine overall risk level
  if (analysis.safety_score < 40) {
    analysis.risk_level = 'extreme';
  } else if (analysis.safety_score < 60) {
    analysis.risk_level = 'high';
  } else if (analysis.safety_score < 80) {
    analysis.risk_level = 'moderate';
  } else {
    analysis.risk_level = 'low';
  }
  
  analysis.safety_score = Math.max(0, Math.min(100, analysis.safety_score));
  
  return analysis;
}

/**
 * Analyze temperature conditions
 */
function analyzeTemperature(temp, feelsLike, humidity) {
  const warnings = [];
  const concerns = [];
  const advantages = [];
  let penalty = 0;
  
  // Extreme cold (< -10°C)
  if (temp < -10) {
    warnings.push({
      type: 'extreme_cold',
      severity: 'critical',
      message: `Extreme cold: ${temp}°C. Frostbite risk in < 30 minutes.`
    });
    penalty += 40;
  } else if (temp < 0) {
    warnings.push({
      type: 'cold',
      severity: 'high',
      message: `Freezing conditions: ${temp}°C. Risk of hypothermia and ice.`
    });
    penalty += 25;
  } else if (temp < 5) {
    concerns.push({
      type: 'cold',
      message: `Cold conditions: ${temp}°C. Dress in layers, extended warm-up needed.`
    });
    penalty += 10;
  }
  
  // Heat stress (heat index from temp + humidity)
  const heatIndex = calculateHeatIndex(temp, humidity);
  
  if (heatIndex >= 40) {
    warnings.push({
      type: 'extreme_heat',
      severity: 'critical',
      message: `Extreme heat: ${heatIndex}°C heat index. High risk of heat stroke.`
    });
    penalty += 40;
  } else if (heatIndex >= 32) {
    warnings.push({
      type: 'heat',
      severity: 'high',
      message: `Dangerous heat: ${heatIndex}°C heat index. Heat exhaustion likely.`
    });
    penalty += 30;
  } else if (heatIndex >= 27) {
    concerns.push({
      type: 'heat',
      message: `High heat: ${heatIndex}°C heat index. Increased hydration needed.`
    });
    penalty += 15;
  }
  
  // Ideal conditions
  if (temp >= 10 && temp <= 20 && feelsLike >= 8 && feelsLike <= 22) {
    advantages.push('Ideal temperature for endurance training');
  }
  
  return { warnings, concerns, advantages, penalty };
}

/**
 * Calculate heat index (feels like temperature)
 */
function calculateHeatIndex(temp, humidity) {
  if (temp < 27) return temp;
  
  const T = temp;
  const RH = humidity;
  
  // Simplified heat index formula
  let HI = -8.78469475556 +
           1.61139411 * T +
           2.33854883889 * RH +
           -0.14611605 * T * RH +
           -0.012308094 * T * T +
           -0.0164248277778 * RH * RH +
           0.002211732 * T * T * RH +
           0.00072546 * T * RH * RH +
           -0.000003582 * T * T * RH * RH;
  
  return Math.round(HI);
}

/**
 * Analyze wind conditions
 */
function analyzeWind(windSpeed, windGust) {
  const warnings = [];
  const concerns = [];
  let penalty = 0;
  
  const maxWind = windGust || windSpeed;
  
  if (maxWind >= 25) {
    warnings.push({
      type: 'extreme_wind',
      severity: 'critical',
      message: `Extreme wind: ${Math.round(maxWind)} m/s. Dangerous conditions, stay indoors.`
    });
    penalty += 35;
  } else if (maxWind >= 17) {
    warnings.push({
      type: 'high_wind',
      severity: 'high',
      message: `High wind: ${Math.round(maxWind)} m/s. Difficult cycling, compromised balance.`
    });
    penalty += 20;
  } else if (maxWind >= 11) {
    concerns.push({
      type: 'wind',
      message: `Strong wind: ${Math.round(maxWind)} m/s. Cycling headwinds challenging, adjust pace.`
    });
    penalty += 10;
  }
  
  return { warnings, concerns, penalty };
}

/**
 * Analyze precipitation
 */
function analyzePrecipitation(condition, rain1h, snow1h) {
  const warnings = [];
  const concerns = [];
  let penalty = 0;
  
  // Thunderstorm
  if (condition === 'Thunderstorm') {
    warnings.push({
      type: 'thunderstorm',
      severity: 'critical',
      message: 'Thunderstorm detected. Do NOT train outdoors - lightning risk.'
    });
    penalty += 50;
  }
  
  // Heavy snow
  if (snow1h > 5) {
    warnings.push({
      type: 'heavy_snow',
      severity: 'high',
      message: `Heavy snow: ${snow1h}mm/hr. Poor visibility, slippery surfaces.`
    });
    penalty += 30;
  } else if (snow1h > 2) {
    concerns.push({
      type: 'snow',
      message: `Moderate snow: ${snow1h}mm/hr. Reduced traction, slower pace advised.`
    });
    penalty += 15;
  } else if (snow1h > 0) {
    concerns.push({
      type: 'light_snow',
      message: 'Light snow. Watch for slippery spots, reduce intensity.'
    });
    penalty += 5;
  }
  
  // Heavy rain
  if (rain1h > 10) {
    warnings.push({
      type: 'heavy_rain',
      severity: 'high',
      message: `Heavy rain: ${rain1h}mm/hr. Poor visibility, slippery surfaces.`
    });
    penalty += 25;
  } else if (rain1h > 4) {
    concerns.push({
      type: 'rain',
      message: `Moderate rain: ${rain1h}mm/hr. Wet roads, reduce cycling speed.`
    });
    penalty += 12;
  } else if (rain1h > 0) {
    concerns.push({
      type: 'light_rain',
      message: 'Light rain. Slippery surfaces possible, use caution.'
    });
    penalty += 5;
  }
  
  return { warnings, concerns, penalty };
}

/**
 * Analyze visibility
 */
function analyzeVisibility(visibility) {
  const warnings = [];
  const concerns = [];
  let penalty = 0;
  
  if (visibility < 1000) {
    warnings.push({
      type: 'poor_visibility',
      severity: 'high',
      message: `Very poor visibility: ${visibility}m. Dangerous for outdoor training.`
    });
    penalty += 25;
  } else if (visibility < 5000) {
    concerns.push({
      type: 'reduced_visibility',
      message: `Reduced visibility: ${visibility}m. Use lights, wear bright colors.`
    });
    penalty += 10;
  }
  
  return { warnings, concerns, penalty };
}

/**
 * Analyze air quality proxy
 */
function analyzeAirQuality(humidity, pressure) {
  const concerns = [];
  const advantages = [];
  
  if (humidity > 85) {
    concerns.push({
      type: 'high_humidity',
      message: `High humidity: ${humidity}%. Harder to cool down, reduce intensity.`
    });
  } else if (humidity < 25) {
    concerns.push({
      type: 'low_humidity',
      message: `Low humidity: ${humidity}%. Increased dehydration risk, drink more.`
    });
  }
  
  if (pressure < 1005) {
    concerns.push({
      type: 'low_pressure',
      message: 'Low pressure system. Some athletes feel sluggish, adjust expectations.'
    });
  }
  
  if (humidity >= 40 && humidity <= 60 && pressure >= 1013 && pressure <= 1020) {
    advantages.push('Ideal air conditions for performance');
  }
  
  return { concerns, advantages };
}

/**
 * Generate workout adjustments based on weather
 */
export function generateWeatherAdjustments(weather, analysis, plannedWorkout) {
  const adjustments = {
    modified_workout: { ...plannedWorkout },
    modifications: [],
    indoor_alternative: null,
    timing_recommendation: null,
    gear_recommendations: [],
    hydration_adjustment: 'normal',
    nutrition_notes: []
  };
  
  const { current } = weather;
  const riskLevel = analysis.risk_level;
  
  // Critical conditions - recommend indoor only
  if (riskLevel === 'extreme') {
    adjustments.indoor_alternative = generateIndoorAlternative(plannedWorkout);
    adjustments.modifications.push({
      type: 'location',
      severity: 'critical',
      change: 'Move workout indoors',
      reason: 'Weather conditions are dangerous for outdoor training'
    });
    return adjustments;
  }
  
  // Intensity adjustments
  const intensityMod = calculateIntensityModification(current, analysis);
  if (intensityMod.change !== 0) {
    adjustments.modified_workout.intensity_adjustment = intensityMod.change;
    adjustments.modifications.push({
      type: 'intensity',
      severity: intensityMod.severity,
      change: `${intensityMod.change > 0 ? 'Increase' : 'Decrease'} intensity by ${Math.abs(intensityMod.change)}%`,
      reason: intensityMod.reason
    });
  }
  
  // Duration adjustments
  const durationMod = calculateDurationModification(current, analysis);
  if (durationMod.change !== 0) {
    adjustments.modified_workout.duration_adjustment = durationMod.change;
    adjustments.modifications.push({
      type: 'duration',
      severity: durationMod.severity,
      change: `${durationMod.change > 0 ? 'Extend' : 'Reduce'} duration by ${Math.abs(durationMod.change)}%`,
      reason: durationMod.reason
    });
  }
  
  // Timing recommendations
  adjustments.timing_recommendation = recommendOptimalTiming(weather, current);
  
  // Gear recommendations
  adjustments.gear_recommendations = generateGearRecommendations(current, analysis);
  
  // Hydration adjustments
  adjustments.hydration_adjustment = calculateHydrationNeeds(current);
  
  // Nutrition notes
  adjustments.nutrition_notes = generateNutritionNotes(current);
  
  // Indoor alternative (even if not critical, always provide option)
  if (riskLevel === 'high' || riskLevel === 'moderate') {
    adjustments.indoor_alternative = generateIndoorAlternative(plannedWorkout);
  }
  
  return adjustments;
}

/**
 * Calculate intensity modification
 */
function calculateIntensityModification(current, analysis) {
  let change = 0;
  let reason = '';
  let severity = 'low';
  
  const heatIndex = calculateHeatIndex(current.temp, current.humidity);
  
  // Heat stress
  if (heatIndex >= 32) {
    change = -30;
    reason = 'Extreme heat increases cardiovascular stress';
    severity = 'high';
  } else if (heatIndex >= 27) {
    change = -20;
    reason = 'High heat requires reduced intensity to prevent heat illness';
    severity = 'medium';
  } else if (heatIndex >= 24) {
    change = -10;
    reason = 'Warm conditions - ease off to maintain safety';
    severity = 'low';
  }
  
  // Cold
  if (current.temp < -5) {
    change = Math.min(change, -20);
    reason = 'Extreme cold increases injury risk and reduces performance';
    severity = 'high';
  } else if (current.temp < 0) {
    change = Math.min(change, -10);
    reason = 'Cold conditions - easier warm-up, reduced peak efforts';
    severity = 'medium';
  }
  
  // Wind
  const wind = current.wind_gust || current.wind_speed;
  if (wind >= 17) {
    change -= 15;
    reason = 'Strong wind significantly increases effort';
    severity = 'high';
  }
  
  // Ideal conditions bonus
  if (current.temp >= 10 && current.temp <= 18 && current.humidity < 70 && wind < 8) {
    change = 5;
    reason = 'Perfect conditions for high-quality training';
    severity = 'low';
  }
  
  return { change, reason, severity };
}

/**
 * Calculate duration modification
 */
function calculateDurationModification(current, analysis) {
  let change = 0;
  let reason = '';
  let severity = 'low';
  
  const heatIndex = calculateHeatIndex(current.temp, current.humidity);
  
  // Extreme heat - shorten duration
  if (heatIndex >= 32) {
    change = -40;
    reason = 'Extreme heat - significantly shorten workout to prevent heat stroke';
    severity = 'high';
  } else if (heatIndex >= 27) {
    change = -25;
    reason = 'High heat - reduce duration to manage heat stress';
    severity = 'medium';
  }
  
  // Heavy precipitation
  if (current.rain_1h > 10 || current.snow_1h > 5) {
    change = -30;
    reason = 'Heavy precipitation - shorten to reduce exposure';
    severity = 'high';
  }
  
  // Cold (can extend if dressed properly)
  if (current.temp >= 5 && current.temp <= 12 && current.humidity < 70) {
    change = 10;
    reason = 'Cool conditions ideal for longer duration efforts';
    severity = 'low';
  }
  
  return { change, reason, severity };
}

/**
 * Recommend optimal timing
 */
function recommendOptimalTiming(weather, current) {
  const now = Math.floor(Date.now() / 1000);
  const morningStart = current.sunrise;
  const eveningEnd = current.sunset;
  
  const recommendations = [];
  
  // Heat recommendations
  const heatIndex = calculateHeatIndex(current.temp, current.humidity);
  if (heatIndex > 27) {
    recommendations.push({
      time: 'early_morning',
      window: `${new Date(morningStart * 1000).toTimeString().slice(0, 5)} - 09:00`,
      reason: 'Coolest part of day, avoid 10am-4pm peak heat'
    });
    recommendations.push({
      time: 'evening',
      window: `After ${new Date((eveningEnd - 7200) * 1000).toTimeString().slice(0, 5)}`,
      reason: 'Temperature drops after sunset'
    });
  }
  
  // Cold recommendations
  if (current.temp < 5) {
    recommendations.push({
      time: 'midday',
      window: '11:00 - 15:00',
      reason: 'Warmest part of day'
    });
  }
  
  // Check forecast for better windows
  const forecast = weather.forecast;
  if (forecast && forecast.length > 0) {
    const betterConditions = forecast.find(f => {
      const fHeatIndex = calculateHeatIndex(f.temp, f.humidity);
      return (
        (heatIndex > 30 && fHeatIndex < heatIndex - 5) ||
        (current.rain_3h > 5 && f.rain_3h < 2) ||
        (current.wind_speed > 15 && f.wind_speed < 10)
      );
    });
    
    if (betterConditions) {
      recommendations.push({
        time: 'later',
        window: betterConditions.dt_txt,
        reason: 'Forecast shows improving conditions'
      });
    }
  }
  
  return recommendations.length > 0 ? recommendations[0] : null;
}

/**
 * Generate gear recommendations
 */
function generateGearRecommendations(current, analysis) {
  const gear = [];
  
  // Temperature-based
  if (current.temp < 0) {
    gear.push('Multiple layers with thermal base layer');
    gear.push('Insulated gloves and hat covering ears');
    gear.push('Face mask or neck gaiter for < -10°C');
    gear.push('Winter cycling tights or pants');
  } else if (current.temp < 10) {
    gear.push('Long sleeves with vest or light jacket');
    gear.push('Arm/leg warmers (removable layers)');
    gear.push('Light gloves');
  } else if (current.temp > 25) {
    gear.push('Light-colored, breathable clothing');
    gear.push('Cooling vest or ice socks (>30°C)');
    gear.push('Sun hat or visor');
    gear.push('Sunscreen SPF 30+');
  }
  
  // Precipitation
  if (current.rain_1h > 0 || current.condition === 'Rain') {
    gear.push('Waterproof jacket');
    gear.push('Water-resistant shoes or overshoes');
    gear.push('Cap under helmet to keep rain off face');
  }
  
  // Visibility
  if (current.visibility < 5000 || current.clouds > 70) {
    gear.push('Bright/reflective clothing');
    gear.push('Front and rear lights (flashing mode)');
  }
  
  // Wind
  const wind = current.wind_gust || current.wind_speed;
  if (wind > 10) {
    gear.push('Windproof jacket');
    gear.push('Cycling glasses to protect eyes');
  }
  
  return gear;
}

/**
 * Calculate hydration needs
 */
function calculateHydrationNeeds(current) {
  const heatIndex = calculateHeatIndex(current.temp, current.humidity);
  
  if (heatIndex >= 32) {
    return 'critical'; // 800-1000ml/hr
  } else if (heatIndex >= 27) {
    return 'high'; // 600-800ml/hr
  } else if (heatIndex >= 20 || current.humidity > 70) {
    return 'elevated'; // 500-600ml/hr
  } else if (current.temp < 5) {
    return 'moderate'; // Still need fluids in cold!
  }
  
  return 'normal'; // 400-500ml/hr
}

/**
 * Generate nutrition notes
 */
function generateNutritionNotes(current) {
  const notes = [];
  const heatIndex = calculateHeatIndex(current.temp, current.humidity);
  
  if (heatIndex >= 27) {
    notes.push('Increase electrolyte intake - sodium crucial for hot conditions');
    notes.push('Consider sports drink instead of plain water');
    notes.push('Cool fluids (10-15°C optimal) for better cooling');
  }
  
  if (current.temp < 0) {
    notes.push('Warm fluids help maintain core temperature');
    notes.push('Higher carb intake - body burns more fuel in cold');
    notes.push('Keep nutrition accessible - harder with gloves');
  }
  
  if (current.humidity > 80) {
    notes.push('Sweat evaporation impaired - higher fluid loss');
  }
  
  return notes;
}

/**
 * Generate indoor alternative workout
 */
function generateIndoorAlternative(plannedWorkout) {
  const sport = plannedWorkout.sport || plannedWorkout.type;
  
  const alternatives = {
    cycling: {
      activity: 'Indoor cycling (trainer or spin class)',
      duration: plannedWorkout.duration || 60,
      structure: 'Maintain planned intervals, use fan for cooling',
      notes: 'Trainer provides controlled environment for quality work'
    },
    running: {
      activity: 'Treadmill run',
      duration: plannedWorkout.duration || 60,
      structure: 'Match planned pace/intervals, set 1% incline',
      notes: 'Slightly shorter OK due to no wind resistance'
    },
    swimming: {
      activity: 'Pool swimming',
      duration: plannedWorkout.duration || 60,
      structure: 'Indoor pool unaffected by weather',
      notes: 'Ideal weather-proof activity'
    },
    default: {
      activity: 'Indoor cross-training',
      duration: plannedWorkout.duration || 60,
      structure: 'Rowing, elliptical, or strength training',
      notes: 'Maintain training stimulus indoors'
    }
  };
  
  return alternatives[sport] || alternatives.default;
}

/**
 * Get complete weather-aware workout recommendation
 */
export async function getWeatherAwareWorkout(lat, lon, plannedWorkout) {
  try {
    // Get weather data
    const weather = await getWeatherData(lat, lon);
    
    // Analyze conditions
    const analysis = analyzeWeatherConditions(weather);
    
    // Generate adjustments
    const adjustments = generateWeatherAdjustments(weather, analysis, plannedWorkout);
    
    return {
      weather: weather.current,
      forecast: weather.forecast.slice(0, 4), // Next 12 hours
      analysis,
      adjustments,
      summary: generateWeatherSummary(analysis, adjustments)
    };
  } catch (error) {
    logger.error('Error generating weather-aware workout:', error);
    throw error;
  }
}

/**
 * Generate weather summary
 */
function generateWeatherSummary(analysis, adjustments) {
  const { risk_level, warnings, concerns } = analysis;
  
  if (risk_level === 'extreme') {
    return '🚨 DANGEROUS CONDITIONS - Train indoors only';
  } else if (risk_level === 'high') {
    return `⚠️ High risk conditions. ${warnings.length} warnings. Indoor training recommended.`;
  } else if (risk_level === 'moderate') {
    return `️⚡ Caution advised. ${concerns.length} concerns. Adjust workout as recommended.`;
  } else if (adjustments.modifications.length > 0) {
    return `✅ Safe to train with ${adjustments.modifications.length} minor adjustments`;
  } else {
    return '🌟 Ideal conditions - go crush it!';
  }
}
