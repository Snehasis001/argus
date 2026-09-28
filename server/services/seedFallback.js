const fs = require('fs');
const path = require('path');

let cachedTransactions = null;

function getFallbackTransactions() {
  if (cachedTransactions) return cachedTransactions;

  const csvPath = path.join(__dirname, '..', '..', 'data', 'seed', 'transactions.csv');
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  try {
    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 14) continue;

      result.push({
        _id: parts[0].trim(),
        transaction_id: parts[0].trim(),
        timestamp: new Date(parts[1].trim()),
        fromAccount: parts[2].trim(),
        toAccount: parts[3].trim(),
        amountUSD: parseFloat(parts[10].trim()) || 0.0,
        paymentFormat: parts[11].trim(),
        isLaundering: parseInt(parts[12].trim()) || 0,
        narration: parts.slice(13).join(',').replace(/^"|"$/g, '').trim()
      });
    }
    cachedTransactions = result;
    return cachedTransactions;
  } catch (err) {
    console.error('Failed to load fallback seed transactions:', err.message);
    return [];
  }
}

module.exports = {
  getFallbackTransactions
};
