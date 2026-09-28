const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

const Account = require('../server/models/Account');
const Transaction = require('../server/models/Transaction');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/argus';

const ACCOUNTS_CSV = path.join(__dirname, '..', 'data', 'seed', 'accounts.csv');
const TRANSACTIONS_CSV = path.join(__dirname, '..', 'data', 'seed', 'transactions.csv');

async function seed() {
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected successfully.');

    // Clear existing collections
    console.log('Clearing existing Account and Transaction collections...');
    await Account.deleteMany({});
    await Transaction.deleteMany({});

    // 1. Seed Accounts
    console.log(`Reading and seeding accounts from ${ACCOUNTS_CSV}...`);
    const accounts = [];
    const accStream = fs.createReadStream(ACCOUNTS_CSV);
    const rlAcc = readline.createInterface({ input: accStream, crlfDelay: Infinity });

    let isFirstLine = true;
    let accHeaders = [];

    for await (const line of rlAcc) {
      if (isFirstLine) {
        accHeaders = line.split(',');
        isFirstLine = false;
        continue;
      }
      const parts = line.split(',');
      if (parts.length < 2) continue;

      const accountId = parts[0].trim();
      const bankId = parts[1].trim();
      const firstSeen = parts[2] ? new Date(parts[2].trim()) : new Date();

      accounts.push({
        accountId,
        bankId,
        createdAt: firstSeen,
        riskFlags: [],
      });
    }

    if (accounts.length > 0) {
      console.log(`Inserting ${accounts.length.toLocaleString()} accounts in batches...`);
      const batchSize = 1000;
      for (let i = 0; i < accounts.length; i += batchSize) {
        await Account.insertMany(accounts.slice(i, i + batchSize));
      }
      console.log('Accounts inserted successfully.');
    }

    // 2. Seed Transactions
    console.log(`Reading and seeding transactions from ${TRANSACTIONS_CSV}...`);
    const txStream = fs.createReadStream(TRANSACTIONS_CSV);
    const rlTx = readline.createInterface({ input: txStream, crlfDelay: Infinity });

    isFirstLine = true;
    let txBatch = [];
    let totalTxCount = 0;
    const batchSize = 2000;

    for await (const line of rlTx) {
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      // Parse CSV line handling potential commas in narration if any
      const parts = line.split(',');
      if (parts.length < 14) continue;

      const timestamp = new Date(parts[1].trim());
      const fromAccount = parts[2].trim();
      const toAccount = parts[3].trim();
      const amountUSD = parseFloat(parts[10].trim()) || 0.0;
      const paymentFormat = parts[11].trim();
      const isLaunderingLabel = parts[12].trim() === '1';
      // Re-join remaining fields as narration in case of commas
      const narration = parts.slice(13).join(',').replace(/^"|"$/g, '').trim();

      txBatch.push({
        fromAccount,
        toAccount,
        amountUSD,
        timestamp,
        paymentFormat,
        narration,
        isLaunderingLabel,
        anomalyScore: 0.0,
        flagged: false,
      });

      if (txBatch.length >= batchSize) {
        await Transaction.insertMany(txBatch);
        totalTxCount += txBatch.length;
        process.stdout.write(`\rInserted ${totalTxCount.toLocaleString()} transactions...`);
        txBatch = [];
      }
    }

    if (txBatch.length > 0) {
      await Transaction.insertMany(txBatch);
      totalTxCount += txBatch.length;
    }
    console.log(`\nTransactions inserted successfully! Total: ${totalTxCount.toLocaleString()}`);

    console.log('\nDatabase seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
