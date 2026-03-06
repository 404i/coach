/**
 * JSON Extractor Utility
 * 
 * Extracts clean JSON from LLM responses that may include markdown
 * code fences, conversational prefixes, or other non-JSON text.
 */

/**
 * Extract a JSON object from a potentially messy LLM response string.
 * @param {string} raw - Raw LLM response text
 * @returns {object} Parsed JSON object
 * @throws {SyntaxError} If no valid JSON can be extracted
 */
export function extractJSON(raw) {
  let text = raw.trim();

  // Strip conversational prefixes like "Certainly!", "Here's the...", etc.
  text = text.replace(/^(Certainly!?|Sure!?|Here's|Here is|Given the|Based on|Let me).*?[:\n]\s*/i, '');

  // Strip markdown code blocks
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Find the first { and last } to extract pure JSON
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

export default { extractJSON };
