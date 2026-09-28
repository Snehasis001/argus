const { detectStructuring } = require('../server/services/dpTools');

console.log('Testing DP Structuring Detection...');

// Test 1: Classic smurfing/structuring - five transactions of ~$9,900 summing to 49,500 (evading $50,000 threshold)
const smurfingAmounts = [9900, 9850, 9950, 9900, 9900, 1500, 300];
const r1 = detectStructuring(smurfingAmounts, 50000, 2000);
console.log('Test 1 (Smurfing pattern):', r1);

if (!r1.structuringDetected || r1.matchedSum < 48000 || r1.matchedSum > 50000) {
  console.error('Test 1 failed!');
  process.exit(1);
}

// Test 2: Normal transactions that never approach 50,000
const normalAmounts = [250, 110, 85, 420, 1200, 500];
const r2 = detectStructuring(normalAmounts, 50000, 2000);
console.log('Test 2 (Normal legitimate pattern):', r2);

if (r2.structuringDetected !== false) {
  console.error('Test 2 failed!');
  process.exit(1);
}

// Test 3: Threshold $10,000 (US CTR limit) with tolerance $500
const usSmurfing = [3000, 3200, 3700]; // 9,900
const r3 = detectStructuring(usSmurfing, 10000, 500);
console.log('Test 3 (US $10,000 CTR Smurfing):', r3);

if (!r3.structuringDetected || r3.matchedSum !== 9900) {
  console.error('Test 3 failed!');
  process.exit(1);
}

console.log('All DP Structuring tests passed successfully!');
