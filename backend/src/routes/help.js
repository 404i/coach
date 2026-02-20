/**
 * Help & Documentation Routes
 * 
 * Provides explanations for:
 * - TSB (Training Stress Balance)
 * - Readiness vs Recovery
 * - Glossary of metrics
 */

import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/help/tsb - Explain Training Stress Balance
router.get('/tsb', (req, res) => {
  res.json({
    name: "Training Stress Balance (TSB)",
    also_known_as: ["Form", "Fitness-Fatigue Balance"],
    what_it_is: "TSB measures your current form by comparing long-term fitness to short-term fatigue",
    
    formula: {
      description: "TSB = Fitness (CTL) - Fatigue (ATL)",
      components: {
        CTL: {
          name: "Chronic Training Load (Fitness)",
          definition: "42-day exponential weighted average of training load",
          represents: "Long-term training adaptations and aerobic fitness"
        },
        ATL: {
          name: "Acute Training Load (Fatigue)",
          definition: "7-day exponential weighted average of training load",
          represents: "Recent training stress and accumulated fatigue"
        }
      }
    },
    
    interpretation: {
      ranges: [
        {
          tsb: "< -30",
          form: "overreached",
          status: "🔴 CRITICAL",
          meaning: "Severe fatigue. You've accumulated far more stress than your body can handle.",
          action: "Immediate recovery week required - reduce volume by 50%, easy intensity only, prioritize sleep"
        },
        {
          tsb: "-30 to -10",
          form: "fatigued",
          status: "🟠 CAUTION",
          meaning: "Accumulated fatigue from training block. Common before a taper.",
          action: "Reduce training volume, focus on recovery, monitor HRV closely"
        },
        {
          tsb: "-10 to +10",
          form: "fresh",
          status: "🟢 OPTIMAL",
          meaning: "Good balance between fitness and fatigue. Ready to train.",
          action: "Maintain training load, execute planned workouts"
        },
        {
          tsb: "> +10",
          form: "rested",
          status: "🟡 PEAKED",
          meaning: "Well-rested, often from taper. Good for racing but fitness may decline if maintained too long.",
          action: "Race or hard workout window. Resume normal training after event."
        }
      ]
    },
    
    how_to_use: [
      "Monitor trend over time, not just single day value",
      "Negative TSB during build phases is normal",
      "Plan recovery weeks when TSB drops below -20",
      "Target TSB of +5 to +15 for race day",
      "TSB < -30 indicates overtraining risk"
    ],
    
    limitations: [
      "Based on training load, not actual fitness tests",
      "Individual responses vary - some recover faster",
      "Doesn't account for external stressors (work, life)",
      "Works best with consistent tracking over months"
    ],
    
    origin: {
      model: "Banister Fitness-Fatigue Model",
      developed: "1975 by Eric Banister",
      used_by: "Professional cycling teams, TrainingPeaks, WKO5"
    },
    
    related_metrics: [
      {
        name: "ACR (Acute:Chronic Ratio)",
        relationship: "Another way to view fitness-fatigue balance",
        formula: "Acute Load / Chronic Load",
        optimal: "0.8 - 1.3"
      },
      {
        name: "Ramp Rate",
        relationship: "Rate of training load increase",
        safe_limit: "< 10% per week"
      }
    ],
    
    further_reading: [
      "https://www.trainingpeaks.com/blog/what-is-tsb/",
      "https://www.scienceforsport.com/training-stress-balance/",
      "Banister, E. W. (1991). Modeling Elite Athletic Performance"
    ]
  });
});

// GET /api/help/readiness - Explain Readiness vs Recovery
router.get('/readiness', (req, res) => {
  res.json({
    name: "Training Readiness Score",
    what_it_is: "A composite metric that combines multiple factors to determine how ready you are to train hard",
    
    important: "⚠️  Readiness ≠ Recovery. Readiness is a broader assessment.",
    
    components: [
      {
        name: "Recovery Score",
        weight: "35%",
        source: "Garmin",
        what_it_measures: "Sleep quality + HRV + stress from previous night",
        range: "0-100",
        interpretation: "How well your body recovered overnight"
      },
      {
        name: "Acute:Chronic Ratio (ACR)",
        weight: "25%",
        source: "Calculated",
        what_it_measures: "Recent training load (7 days) vs long-term (42 days)",
        range: "0.5-2.0",
        interpretation: "Whether you're training more or less than usual",
        optimal: "0.8-1.3"
      },
      {
        name: "HRV Status",
        weight: "20%",
        source: "Garmin",
        what_it_measures: "Heart Rate Variability vs your baseline",
        interpretation: "Autonomic nervous system recovery"
      },
      {
        name: "TSB (Form)",
        weight: "20%",
        source: "Calculated",
        what_it_measures: "Fitness vs Fatigue balance",
        interpretation: "Long-term training load balance"
      }
    ],
    
    interpretation: {
      ranges: [
        {
          score: "80-100",
          status: "🟢 EXCELLENT",
          meaning: "Fully recovered and ready for hard training",
          recommended: "High intensity workout, personal best attempts"
        },
        {
          score: "60-79",
          status: "🟢 GOOD",
          meaning: "Ready to train, minor fatigue may be present",
          recommended: "Moderate to high intensity training"
        },
        {
          score: "40-59",
          status: "🟡 MODERATE",
          meaning: "Some fatigue present, recovery incomplete",
          recommended: "Easy to moderate training, focus on aerobic"
        },
        {
          score: "20-39",
          status: "🟠 LOW",
          meaning: "Significant fatigue, poor recovery",
          recommended: "Easy recovery work only, consider rest day"
        },
        {
          score: "0-19",
          status: "🔴 VERY LOW",
          meaning: "Critical fatigue, overtraining risk",
          recommended: "Rest day or very light active recovery"
        }
      ]
    },
    
    example: {
      scenario: "Recovery is good but readiness is low",
      recovery_score: 71,
      training_readiness_score: 45,
      breakdown: {
        recovery_contribution: 25,
        acr_contribution: 5,
        hrv_contribution: 10,
        tsb_contribution: 5
      },
      explanation: "You slept well (recovery 71) but your training load is too high (ACR 1.69) and you have accumulated fatigue (TSB -123). Your body is recovering each night but the cumulative stress is still very high.",
      action: "Need recovery week to reduce training load, not just better sleep"
    },
    
    key_differences: {
      recovery: {
        what: "Single metric from Garmin",
        measures: "Overnight recovery quality",
        timeframe: "Last night",
        good_for: "Checking if you slept well"
      },
      readiness: {
        what: "Composite score from 4 metrics",
        measures: "Overall training readiness",
        timeframe: "Recent training + recovery",
        good_for: "Deciding today's workout intensity"
      }
    },
    
    how_to_use: [
      "Use readiness score to plan workout intensity",
      "High readiness = green light for hard training",
      "Low readiness = scale back even if you feel okay",
      "Recovery is just one piece of the puzzle",
      "Can have good recovery but low readiness (high training load)",
      "Can have poor recovery but okay readiness (well-tapered)"
    ]
  });
});

// GET /api/help/glossary - Full glossary of metrics
router.get('/glossary', (req, res) => {
  res.json({
    metrics: {
      // Training Load Metrics
      training_load: {
        name: "Training Load",
        unit: "arbitrary units",
        what_it_is: "Quantified training stress from a workout",
        source: "Garmin (based on duration, intensity, heart rate)",
        typical_range: "0-1000 per day",
        interpretation: {
          "< 100": "Easy recovery day",
          "100-300": "Moderate training day",
          "300-500": "Hard training day",
          "> 500": "Very hard or long training day"
        }
      },
      
      ATL: {
        name: "Acute Training Load (Fatigue)",
        formula: "7-day exponential weighted average of training load",
        what_it_is: "Recent training stress",
        use: "Component of TSB calculation"
      },
      
      CTL: {
        name: "Chronic Training Load (Fitness)",
        formula: "42-day exponential weighted average of training load",
        what_it_is: "Long-term fitness level",
        use: "Component of TSB calculation"
      },
      
      TSB: {
        name: "Training Stress Balance (Form)",
        formula: "CTL - ATL",
        what_it_is: "Fitness-fatigue balance",
        see: "/api/help/tsb for detailed explanation"
      },
      
      ACR: {
        name: "Acute:Chronic Ratio",
        formula: "ATL / CTL",
        what_it_is: "Training load ratio",
        optimal_range: "0.8-1.3",
        interpretation: {
          "< 0.8": "Detraining - training too little",
          "0.8-1.3": "Optimal - sustainable training",
          "> 1.3": "High risk - injury/overtraining risk"
        }
      },
      
      ramp_rate: {
        name: "Training Load Ramp Rate",
        what_it_is: "Rate of training load increase",
        unit: "percent per week",
        safe_limit: "< 10% per week",
        danger_zone: "> 20% per week"
      },
      
      // Recovery Metrics
      recovery_score: {
        name: "Recovery Score",
        source: "Garmin",
        unit: "0-100",
        what_it_is: "Overall recovery quality from previous night",
        factors: ["Sleep quality", "HRV", "Stress", "Activity"],
        interpretation: {
          "0-25": "Poor recovery",
          "26-50": "Below average recovery",
          "51-75": "Good recovery",
          "76-100": "Excellent recovery"
        }
      },
      
      HRV: {
        name: "Heart Rate Variability",
        unit: "milliseconds",
        what_it_is: "Variation in time between heartbeats",
        significance: "Higher = better recovery, well-regulated nervous system",
        note: "Highly individual - compare to your own baseline, not others"
      },
      
      resting_hr: {
        name: "Resting Heart Rate",
        unit: "bpm",
        what_it_is: "Heart rate at complete rest",
        significance: "Lower = better aerobic fitness",
        warning: "Elevated RHR may indicate illness, overtraining, or dehydration"
      },
      
      // Readiness Metrics
      training_readiness: {
        name: "Training Readiness Score",
        unit: "0-100",
        what_it_is: "Composite score for workout planning",
        see: "/api/help/readiness for detailed explanation",
        components: ["Recovery (35%)", "ACR (25%)", "HRV (20%)", "TSB (20%)"]
      },
      
      // Sleep Metrics
      sleep_hours: {
        name: "Sleep Duration",
        unit: "hours",
        recommended: "7-9 hours for athletes",
        note: "Quality matters more than quantity"
      },
      
      sleep_score: {
        name: "Sleep Score",
        source: "Garmin",
        unit: "0-100",
        factors: ["Duration", "Deep sleep", "REM sleep", "Awakenings", "Timing"]
      },
      
      // Stress Metrics
      stress_level: {
        name: "Stress Level",
        source: "Garmin",
        unit: "0-100",
        based_on: "Heart rate variability throughout the day",
        interpretation: {
          "0-25": "Low stress / rest",
          "26-50": "Moderate stress",
          "51-75": "High stress",
          "76-100": "Very high stress"
        }
      }
    },
    
    training_principles: {
      progressive_overload: "Gradually increase training load over time for adaptation",
      supercompensation: "Rest allows body to rebuild stronger than before",
      polarized_training: "80% easy, 20% hard intensity distribution",
      recovery_is_training: "Adaptation happens during recovery, not during workouts",
      individuality: "Metrics are personal - compare to your own baseline"
    },
    
    note: "All metrics should be viewed as trends over time, not absolute day-to-day values"
  });
});

// GET /api/help/metrics - Quick reference for all metrics
router.get('/metrics', (req, res) => {
  res.json({
    load_metrics: [
      { name: "Training Load", abbr: null, unit: "AU", source: "Garmin" },
      { name: "Acute Load", abbr: "ATL", unit: "AU", source: "Calculated" },
      { name: "Chronic Load", abbr: "CTL", unit: "AU", source: "Calculated" },
      { name: "Training Stress Balance", abbr: "TSB", unit: "AU", source: "Calculated" },
      { name: "Acute:Chronic Ratio", abbr: "ACR", unit: "ratio", source: "Calculated" }
    ],
    recovery_metrics: [
      { name: "Recovery Score", abbr: null, unit: "0-100", source: "Garmin" },
      { name: "Heart Rate Variability", abbr: "HRV", unit: "ms", source: "Garmin" },
      { name: "Resting Heart Rate", abbr: "RHR", unit: "bpm", source: "Garmin" },
      { name: "Sleep Hours", abbr: null, unit: "hours", source: "Garmin" }
    ],
    readiness_metrics: [
      { name: "Training Readiness", abbr: null, unit: "0-100", source: "Calculated" }
    ],
    endpoints: {
      tsb_help: "/api/help/tsb",
      readiness_help: "/api/help/readiness",
      full_glossary: "/api/help/glossary",
      metrics_list: "/api/help/metrics"
    }
  });
});

export default router;
