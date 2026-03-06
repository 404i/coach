import axios from 'axios';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { validateWorkoutResponse, validateWeeklyPlanResponse } from './validator.js';
import { extractJSON } from '../utils/json-extractor.js';
import { estimateTokens, TOKEN_BUDGET } from '../utils/token-estimator.js';
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
 * Multi-turn chunked LLM call.
 * Splits context across sequential calls, accumulating conversation history,
 * then sends the final task prompt with full context absorbed.
 *
 * @param {string} systemPrompt - System prompt
 * @param {object[]} chunks - Ordered array of context chunk objects
 * @param {string} taskPrompt - The actual task prompt (e.g., daily workout template)
 * @param {object} options - LLM options
 * @returns {{ content: string, tokensUsed: number, responseTime: number }}
 */
async function callLLMChunked(systemPrompt, chunks, taskPrompt, options = {}) {
  if (chunks.length <= 1) {
    // Single chunk — standard single-call path
    const contextStr = JSON.stringify(chunks[0] || {}, null, 2);
    const userPrompt = taskPrompt.replace('{{CONTEXT}}', contextStr);
    return callLLM(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      options
    );
  }

  logger.info(`Multi-turn LLM call: ${chunks.length} chunks`);
  let totalTokens = 0;
  let totalTime = 0;
  const messages = [{ role: 'system', content: systemPrompt }];

  // Passes 1..N-1: feed context chunks and accumulate acknowledgments
  for (let i = 0; i < chunks.length - 1; i++) {
    const chunkStr = JSON.stringify(chunks[i], null, 2);
    messages.push({
      role: 'user',
      content: `Absorb this training data (part ${i + 1}/${chunks.length}). Do NOT generate a workout yet — just acknowledge receipt and wait for more data.\n\n${chunkStr}`,
    });

    const ack = await callLLM(messages, { ...options, maxTokens: 100 });
    totalTokens += ack.tokensUsed || 0;
    totalTime += ack.responseTime || 0;
    messages.push({ role: 'assistant', content: ack.content });
  }

  // Final pass: last chunk + task prompt
  const lastChunkStr = JSON.stringify(chunks[chunks.length - 1], null, 2);
  const userPrompt = taskPrompt.replace(
    '{{CONTEXT}}',
    `${lastChunkStr}\n\n(All previous data chunks have been provided above in this conversation.)`
  );
  messages.push({ role: 'user', content: userPrompt });

  const finalResult = await callLLM(messages, options);
  totalTokens += finalResult.tokensUsed || 0;
  totalTime += finalResult.responseTime || 0;

  return {
    content: finalResult.content,
    tokensUsed: totalTokens,
    responseTime: totalTime,
    chunksUsed: chunks.length,
  };
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
  const profileId = context.profile_id || context[0]?.profile_id || 'unknown';
  const date = context.date || context[0]?.date;
  
  logger.info(`Generating daily workouts for ${profileId} on ${date}`);
  
  try {
    // Support both single-context and chunked-context
    const chunks = Array.isArray(context) ? context : [context];
    
    const { content, tokensUsed, responseTime, chunksUsed } = await callLLMChunked(
      SYSTEM_PROMPT, chunks, DAILY_WORKOUT_PROMPT, { json: true }
    );
    
    if (chunksUsed > 1) {
      logger.info(`Daily workout used ${chunksUsed} context chunks`);
    }
    
    // Extract clean JSON from LLM response
    const llmResponse = extractJSON(content);
    
    // Validate response
    const validation = validateWorkoutResponse(llmResponse, Array.isArray(context) ? context[0] : context);
    
    if (!validation.valid) {
      logger.warn('LLM workout response validation failed:', validation.errors);
      
      // Retry once
      if (validation.retryable) {
        logger.info('Retrying workout generation with feedback');
        const retryMessages = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: DAILY_WORKOUT_PROMPT.replace('{{CONTEXT}}', JSON.stringify(chunks[chunks.length - 1], null, 2)) },
          { role: 'assistant', content },
          { role: 'user', content: `Please fix these issues: ${validation.errors.join(', ')}` }
        ];
        
        const retry = await callLLM(retryMessages, { json: true });
        const retryResponse = extractJSON(retry.content);
        const retryValidation = validateWorkoutResponse(retryResponse, Array.isArray(context) ? context[0] : context);
        
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
  const profileId = context.profile_id || context[0]?.profile_id || 'unknown';
  const weekStart = context.week_start || context[0]?.week_start;
  
  logger.info(`Generating weekly plan for ${profileId} starting ${weekStart}`);
  
  try {
    const chunks = Array.isArray(context) ? context : [context];
    
    const { content, tokensUsed, responseTime, chunksUsed } = await callLLMChunked(
      SYSTEM_PROMPT, chunks, WEEKLY_PLAN_PROMPT, { json: true }
    );
    
    if (chunksUsed > 1) {
      logger.info(`Weekly plan used ${chunksUsed} context chunks`);
    }
    
    // Extract clean JSON from LLM response
    const llmResponse = extractJSON(content);
    
    const validation = validateWeeklyPlanResponse(llmResponse, Array.isArray(context) ? context[0] : context);
    
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
    return generateSafeWeeklyFallback(Array.isArray(context) ? context[0] : context);
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
    
    let url;
    if (config.provider === 'ollama') {
      url = `${config.ollamaUrl}/api/tags`;
    } else {
      url = `${config.lmStudioUrl}/models`;
    }
    
    const response = await axios.get(url, { 
      timeout: 5000,
      headers
    });
    return { available: true, models: response.data.data || response.data.models || [] };
  } catch (error) {
    const config = getLLMConfig();
    const url = config.provider === 'ollama' ? `${config.ollamaUrl}/api/tags` : `${config.lmStudioUrl}/models`;
    logger.warn('LLM health check failed:', {
      message: error.message,
      code: error.code,
      url
    });
    return { available: false, error: error.message };
  }
}
