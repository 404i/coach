import axios from 'axios';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { validateWorkoutResponse, validateWeeklyPlanResponse } from './validator.js';
import db from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPTS_DIR = join(__dirname, '../prompts');

// Helper to get LLM config (lazy evaluation so .env is loaded)
function getLLMConfig() {
  return {
    provider: process.env.LLM_PROVIDER || 'lmstudio',
    lmStudioUrl: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    apiKey: process.env.LM_STUDIO_API_KEY,
    timeout: parseInt(process.env.LLM_TIMEOUT_MS) || 120000,
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 2000,
    model: process.env.LLM_MODEL || 'local-model'
  };
}

// Load prompt templates
let SYSTEM_PROMPT, DAILY_WORKOUT_PROMPT, WEEKLY_PLAN_PROMPT, RECOVERY_ASSESSMENT_PROMPT;

try {
  SYSTEM_PROMPT = readFileSync(join(PROMPTS_DIR, 'coach-system.txt'), 'utf-8');
  DAILY_WORKOUT_PROMPT = readFileSync(join(PROMPTS_DIR, 'daily-workout.txt'), 'utf-8');
  WEEKLY_PLAN_PROMPT = readFileSync(join(PROMPTS_DIR, 'weekly-plan.txt'), 'utf-8');
  RECOVERY_ASSESSMENT_PROMPT = readFileSync(join(PROMPTS_DIR, 'recovery-assessment.txt'), 'utf-8');
} catch (error) {
  logger.warn('Could not load prompt templates:', error.message);
}

/**
 * Call LLM API (supports both LM Studio and Ollama)
 */
async function callLLM(messages, options = {}) {
  const startTime = Date.now();
  const config = getLLMConfig();
  
  logger.info(`Calling ${config.provider}: ${messages.length} messages`);
  
  try {
    let response, content, tokensUsed;
    
    if (config.provider === 'ollama') {
      // Ollama API format
      const requestBody = {
        model: options.model || config.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature || config.temperature,
          num_predict: options.maxTokens || config.maxTokens
        }
      };
      
      response = await axios.post(
        `${config.ollamaUrl}/api/chat`,
        requestBody,
        {
          timeout: config.timeout,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      content = response.data.message.content;
      tokensUsed = response.data.eval_count || null;
      
    } else {
      // LM Studio (OpenAI-compatible) API format
      const requestBody = {
        model: options.model || config.model,
        messages,
        temperature: options.temperature || config.temperature,
        max_tokens: options.maxTokens || config.maxTokens
      };
      
      response = await axios.post(
        `${config.lmStudioUrl}/chat/completions`,
        requestBody,
        {
          timeout: config.timeout,
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
          }
        }
      );
      
      content = response.data.choices[0].message.content;
      tokensUsed = response.data.usage?.total_tokens || null;
    }
    
    const responseTime = Date.now() - startTime;
    logger.info(`LLM response received in ${responseTime}ms, ${tokensUsed} tokens`);
    
    return {
      content,
      tokensUsed,
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error(`${config.provider} API call failed:`, error.message);
    
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`${config.provider} not reachable. Is it running?`);
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      throw new Error(`${config.provider} request timed out`);
    }
    
    throw new Error(`${config.provider} error: ${error.message}`);
  }
}

/**
 * Log LLM decision to database
 */
async function logDecision(profileId, date, decisionType, context, llmResponse, tokensUsed, responseTime, validationResult = null) {
  try {
    const profile = await db('athlete_profiles')
      .where({ profile_id: profileId })
      .first();
    
    if (!profile) return;
    
    await db('llm_decisions').insert({
      profile_id: profile.id,
      date,
      decision_type: decisionType,
      context_json: JSON.stringify(context),
      llm_response_json: JSON.stringify(llmResponse),
      reasoning_text: llmResponse.reasoning || llmResponse.explanation || null,
      tokens_used: tokensUsed,
      response_time_ms: responseTime,
      validation_passed: validationResult ? validationResult.valid : true,
      validation_errors: validationResult && !validationResult.valid 
        ? JSON.stringify(validationResult.errors) 
        : null
    });
  } catch (error) {
    logger.error('Failed to log LLM decision:', error);
  }
}

/**
 * Generate daily workout options (4 variants)
 */
export async function generateDailyWorkouts(context) {
  const profileId = context.profile_id || 'unknown';
  const date = context.date;
  
  logger.info(`Generating daily workouts for ${profileId} on ${date}`);
  
  try {
    // Build prompt with context
    const userPrompt = DAILY_WORKOUT_PROMPT
      .replace('{{CONTEXT}}', JSON.stringify(context, null, 2));
    
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    const { content, tokensUsed, responseTime } = await callLLM(messages, { json: true });
    
    // Clean up LLM response - strip conversational text and markdown
    let jsonContent = content.trim();
    
    // Strip conversational prefixes like "Certainly!", "Here's the...", etc.
    jsonContent = jsonContent.replace(/^(Certainly!?|Sure!?|Here's|Here is|Given the|Based on|Let me).*?[:\n]\s*/i, '');
    
    // Strip markdown code blocks
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*\n?/,'').replace(/\n?```\s*$/,'');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*\n?/,'').replace(/\n?```\s*$/,'');
    }
    
    // Find the first { and last } to extract pure JSON
    const firstBrace = jsonContent.indexOf('{');
    const lastBrace = jsonContent.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
    }
    
    // Parse JSON response
    const llmResponse = JSON.parse(jsonContent);
    
    // Validate response
    const validation = validateWorkoutResponse(llmResponse, context);
    
    if (!validation.valid) {
      logger.warn('LLM workout response validation failed:', validation.errors);
      
      // Retry once
      if (validation.retryable) {
        logger.info('Retrying workout generation with feedback');
        messages.push(
          { role: 'assistant', content },
          { role: 'user', content: `Please fix these issues: ${validation.errors.join(', ')}` }
        );
        
        const retry = await callLLM(messages, { json: true });
        const retryResponse = JSON.parse(retry.content);
        const retryValidation = validateWorkoutResponse(retryResponse, context);
        
        if (retryValidation.valid) {
          await logDecision(profileId, date, 'daily_workout', context, retryResponse, retry.tokensUsed, retry.responseTime, retryValidation);
          return retryResponse;
        }
      }
      
      // Fall back to safe default
      throw new Error('Validation failed: ' + validation.errors.join(', '));
    }
    
    await logDecision(profileId, date, 'daily_workout', context, llmResponse, tokensUsed, responseTime, validation);
    
    return llmResponse;
  } catch (error) {
    logger.error('Failed to generate daily workouts:', error);
    throw error;
  }
}

/**
 * Generate weekly training plan (7 days)
 */
export async function generateWeeklyPlan(context) {
  const profileId = context.profile_id || 'unknown';
  const weekStart = context.week_start;
  
  logger.info(`Generating weekly plan for ${profileId} starting ${weekStart}`);
  
  try {
    const userPrompt = WEEKLY_PLAN_PROMPT
      .replace('{{CONTEXT}}', JSON.stringify(context, null, 2));
    
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    const { content, tokensUsed, responseTime } = await callLLM(messages, { json: true });
    
    // Clean up LLM response - strip conversational text and markdown
    let jsonContent = content.trim();
    
    // Strip conversational prefixes
    jsonContent = jsonContent.replace(/^(Certainly!?|Sure!?|Here's|Here is|Given the|Based on|Let me).*?[:\n]\s*/i, '');
    
    // Strip markdown code blocks
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*\n?/,'').replace(/\n?```\s*$/,'');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*\n?/,'').replace(/\n?```\s*$/,'');
    }
    
    // Find the first { and last } to extract pure JSON
    const firstBrace = jsonContent.indexOf('{');
    const lastBrace = jsonContent.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
    }
    
    const llmResponse = JSON.parse(jsonContent);
    
    const validation = validateWeeklyPlanResponse(llmResponse, context);
    
    if (!validation.valid) {
      logger.warn('LLM weekly plan validation failed:', validation.errors);
      throw new Error('Validation failed: ' + validation.errors.join(', '));
    }
    
    await logDecision(profileId, weekStart, 'weekly_plan', context, llmResponse, tokensUsed, responseTime, validation);
    
    return llmResponse;
  } catch (error) {
    logger.error('Failed to generate weekly plan:', error);
    
    // Return fallback instead of throwing
    const { generateSafeWeeklyFallback } = await import('./validator.js');
    return generateSafeWeeklyFallback(context);
  }
}

/**
 * Assess recovery and check for guardrails
 */
export async function assessRecovery(context) {
  const profileId = context.profile_id || 'unknown';
  const date = context.date;
  
  logger.info(`Assessing recovery for ${profileId} on ${date}`);
  
  try {
    const userPrompt = RECOVERY_ASSESSMENT_PROMPT
      .replace('{{CONTEXT}}', JSON.stringify(context, null, 2));
    
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    const { content, tokensUsed, responseTime } = await callLLM(messages, { json: true });
    const llmResponse = JSON.parse(content);
    
    await logDecision(profileId, date, 'guardrail_check', context, llmResponse, tokensUsed, responseTime);
    
    return llmResponse;
  } catch (error) {
    logger.error('Failed to assess recovery:', error);
    throw error;
  }
}

/**
 * Chat interface for user questions
 */
export async function chatWithCoach(profileId, conversationHistory, userMessage) {
  logger.info(`Chat request from ${profileId}`);
  
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    
    const { content, tokensUsed, responseTime } = await callLLM(messages);
    
    await logDecision(profileId, new Date().toISOString().split('T')[0], 'chat_response', 
      { user_message: userMessage }, 
      { response: content }, 
      tokensUsed, 
      responseTime
    );
    
    return content;
  } catch (error) {
    logger.error('Chat failed:', error);
    throw error;
  }
}

/**
 * Check if LM Studio is available
 */
export async function checkLMStudioHealth() {
  try {
    const config = getLLMConfig();
    const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};
    const response = await axios.get(`${config.url}/models`, { 
      timeout: 5000,
      headers
    });
    return { available: true, models: response.data.data || [] };
  } catch (error) {
    const config = getLLMConfig();
    logger.warn('LM Studio health check failed:', {
      message: error.message,
      code: error.code,
      url: `${config.url}/models`
    });
    return { available: false, error: error.message };
  }
}
