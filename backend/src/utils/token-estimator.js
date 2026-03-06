/**
 * Token Estimator Utility
 * 
 * Estimates token counts for LLM context management.
 * Uses the ~4 characters per token heuristic (accurate to ~10% for English text).
 * 
 * Used by the chunked context builder to decide when to split context across
 * multiple LLM calls.
 */

// Configurable via environment variable; default leaves room for system prompt
// (~1500 tokens) + response tokens (~2000) within a typical 8K-32K context window.
const TOKEN_BUDGET = parseInt(process.env.LLM_CONTEXT_TOKEN_BUDGET) || 6000;

// Average chars per token — 4 is the widely-accepted heuristic for English/JSON
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens in a text string.
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the number of tokens in a JSON-serializable object.
 * @param {any} obj - The object to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateObjectTokens(obj) {
  if (obj === null || obj === undefined) return 0;
  return estimateTokens(JSON.stringify(obj, null, 2));
}

/**
 * Check if a context object exceeds the token budget.
 * @param {any} context - The context object to check
 * @returns {{ withinBudget: boolean, estimatedTokens: number, budget: number }}
 */
export function checkBudget(context) {
  const estimated = estimateObjectTokens(context);
  return {
    withinBudget: estimated <= TOKEN_BUDGET,
    estimatedTokens: estimated,
    budget: TOKEN_BUDGET,
  };
}

export { TOKEN_BUDGET };

export default {
  estimateTokens,
  estimateObjectTokens,
  checkBudget,
  TOKEN_BUDGET,
};
