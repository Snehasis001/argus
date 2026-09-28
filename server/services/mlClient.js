const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

/**
 * Calls the FastAPI ML anomaly detection service to score a transaction.
 * @param {Object} features - { amount_zscore, velocity, is_new_counterparty, hour_of_day, amount_to_balance_ratio }
 * @returns {Promise<{ risk_score: number, raw_decision_score: number, flagged: boolean }>}
 */
async function scoreTransaction(features) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/score`, features, {
      timeout: 3000,
    });
    return response.data;
  } catch (error) {
    console.error('Error invoking ML anomaly scoring service:', error.message);
    // Fallback: If ML service is temporarily down, calculate a rule-based fallback heuristic
    const isSuspiciousHour = features.hour_of_day >= 1 && features.hour_of_day <= 4;
    const isHighVelocity = features.velocity > 10;
    const isHighAmount = features.amount_zscore > 3.0;

    let fallbackScore = 0.2;
    if (isHighAmount) fallbackScore += 0.3;
    if (isHighVelocity) fallbackScore += 0.25;
    if (isSuspiciousHour) fallbackScore += 0.15;

    return {
      risk_score: Math.min(1.0, fallbackScore),
      raw_decision_score: 0.0,
      flagged: fallbackScore >= 0.7,
      isFallback: true,
    };
  }
}

/**
 * Calls the FastAPI NLP service to extract named entities and detect vague language.
 * @param {string} narration - Transaction memo / description
 * @returns {Promise<{ entities: string[], is_vague_language: boolean }>}
 */
async function parseNarration(narration) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/parse-narration`,
      { narration },
      { timeout: 3000 }
    );
    return response.data;
  } catch (error) {
    console.error('Error invoking NLP narration parser:', error.message);
    // Simple heuristic fallback if ML service is unreachable
    const VAGUE_TERMS = ['misc', 'consulting fee', 'as discussed', 'gift', 'urgent settlement'];
    const isVague = VAGUE_TERMS.some((t) => (narration || '').toLowerCase().includes(t));
    return {
      entities: [],
      is_vague_language: isVague,
      isFallback: true,
    };
  }
}

module.exports = {
  scoreTransaction,
  parseNarration,
};

