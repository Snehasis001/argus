/**
 * DP Structuring / Smurfing Detector
 * 
 * Money launderers frequently split large transfers into multiple smaller transactions
 * designed to evade mandatory regulatory reporting thresholds (e.g., $10,000 in the US,
 * ₹50,000 / ₹10,00,000 in India).
 * 
 * This tool answers: "Does any subset of this account's recent transactions sum to
 * just under the reporting threshold [target - tolerance, target]?"
 * 
 * Implemented as a 0/1 pseudo-polynomial Subset-Sum Dynamic Programming algorithm:
 * - Time Complexity: O(N * target), where N <= 30
 * - Space Complexity: O(target)
 * 
 * @param {number[]} amounts - List of recent transaction amounts
 * @param {number} target - Regulatory threshold (default: $50,000 / ₹50,000)
 * @param {number} tolerance - Allowed proximity below target (default: $2,000)
 * @returns {{ structuringDetected: boolean, matchedSum?: number, matchedAmounts?: number[] }}
 */
function detectStructuring(amounts, target = 50000, tolerance = 2000) {
  if (!amounts || amounts.length === 0) {
    return { structuringDetected: false };
  }

  // Cap input to the account's last ~30 transactions to keep memory and computation bounded
  const recentAmounts = amounts.slice(-30).map((a) => Math.round(Number(a) || 0)).filter((a) => a > 0 && a <= target);

  if (recentAmounts.length === 0) {
    return { structuringDetected: false };
  }

  // dp[s] tracks whether sum s is reachable using a subset of transactions seen so far
  const dp = new Array(target + 1).fill(false);
  dp[0] = true;

  // parent[s] tracks the item index that achieved sum s for back-tracking the exact evidence subset
  const parent = new Array(target + 1).fill(null);

  for (let i = 0; i < recentAmounts.length; i++) {
    const a = recentAmounts[i];
    // Traverse backwards to ensure each transaction is used at most once (0/1 subset sum)
    for (let s = target; s >= a; s--) {
      if (dp[s - a] && !dp[s]) {
        dp[s] = true;
        parent[s] = { prevSum: s - a, amount: a, index: i };
      }
    }
  }

  // Check window [target - tolerance, target] for an evasion match
  for (let s = target; s >= target - tolerance; s--) {
    if (dp[s]) {
      // Reconstruct the exact transactions that formed the structured sum
      const matchedAmounts = [];
      let curr = s;
      while (curr > 0 && parent[curr]) {
        matchedAmounts.push(parent[curr].amount);
        curr = parent[curr].prevSum;
      }

      return {
        structuringDetected: true,
        matchedSum: s,
        target,
        tolerance,
        matchedAmounts: matchedAmounts.reverse(),
        count: matchedAmounts.length
      };
    }
  }

  return { structuringDetected: false };
}

module.exports = {
  detectStructuring
};
