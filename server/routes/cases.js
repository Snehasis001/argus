const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CaseFile = require('../models/CaseFile');
const Transaction = require('../models/Transaction');
const AgentRunLog = require('../models/AgentRunLog');
const { buildSubgraph, tarjanSCC, degreeCentrality } = require('../services/graphTools');
const { investigate } = require('../services/agent');
const { getFallbackTransactions } = require('../services/seedFallback');

// In-memory case cache that can be refreshed dynamically
let currentCases = null;

function generateDiverseCaseBatch(forceRefresh = false) {
  if (currentCases && !forceRefresh) return currentCases;

  const txns = getFallbackTransactions();
  if (!txns || txns.length === 0) return [];

  // 1. Genuine Laundering Cases with verified cycles and structuring
  const flagshipLaundering = txns.find((t) => t.transaction_id === 'TX_029834') || {
    _id: 'TX_029834',
    transaction_id: 'TX_029834',
    timestamp: new Date('2022-09-10T17:47:00.000Z'),
    fromAccount: '119_811C597B0',
    toAccount: '119_811C597B0',
    amountUSD: 3819097.94,
    paymentFormat: 'ACH',
    isLaundering: 1,
    narration: 'Payment as discussed'
  };

  const structuringLaundering = txns.find((t) => t.transaction_id === 'TX_000140') || {
    _id: 'TX_000140',
    transaction_id: 'TX_000140',
    timestamp: new Date('2022-08-31T18:34:00.000Z'),
    fromAccount: '119_811C597B0',
    toAccount: '48309_811C599A0',
    amountUSD: 9248.76,
    paymentFormat: 'ACH',
    isLaundering: 1,
    narration: 'Settlement per agreement'
  };

  const cycleLaundering = txns.find((t) => t.transaction_id === 'TX_029884') || {
    _id: 'TX_029884',
    transaction_id: 'TX_029884',
    timestamp: new Date('2022-09-10T23:51:00.000Z'),
    fromAccount: '119_812A09CF0',
    toAccount: '49365_812A09D40',
    amountUSD: 14726.19,
    paymentFormat: 'Cheque',
    isLaundering: 1,
    narration: 'Balance reconciliation'
  };

  const otherLaunderingPool = txns.filter(
    (t) => t.isLaundering === 1 && t.transaction_id !== 'TX_029834' && t.transaction_id !== 'TX_000140' && t.transaction_id !== 'TX_029884'
  );

  // 2. Medium Outliers (benign commercial)
  const mediumPool = txns.filter(
    (t) => t.isLaundering === 0 && t.amountUSD >= 15000 && t.amountUSD <= 30000
  );

  // 3. Benign Retail & Utility
  const benignPool = txns.filter(
    (t) => t.isLaundering === 0 && (t.narration.includes('Salary') || t.narration.includes('Rent') || t.narration.includes('Utility'))
  );

  const pick = (arr, count) => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  let selectedTxns;
  if (!forceRefresh) {
    selectedTxns = [
      flagshipLaundering,
      structuringLaundering,
      cycleLaundering,
      ...pick(mediumPool, 2),
      ...pick(benignPool, 3)
    ];
  } else {
    selectedTxns = [
      flagshipLaundering,
      ...pick(otherLaunderingPool, 2),
      ...pick(mediumPool, 2),
      ...pick(benignPool, 3)
    ];
  }

  currentCases = selectedTxns.map((tx, idx) => {
    let initialRisk;
    const isLaunderingTx = tx.isLaundering === 1 || tx.transaction_id === 'TX_029834' || tx.transaction_id === 'TX_000140';

    if (isLaunderingTx) {
      initialRisk = tx.transaction_id === 'TX_029834' ? 94 : tx.transaction_id === 'TX_000140' ? 90 : 88;
    } else if (tx.amountUSD >= 15000) {
      initialRisk = 48;
    } else {
      initialRisk = 22;
    }

    return {
      _id: `CASE_${tx.transaction_id || tx._id || idx + 1}`,
      transactionId: tx,
      riskScore: initialRisk,
      evidence: [], // Evidence is empty until investigation is performed
      reasoningTrace: [], // Conclusion report generates after running investigation
      verdict: 'pending',
      investigated: false,
      status: 'pending',
      reviewedBy: null,
      createdAt: tx.timestamp || new Date()
    };
  });

  // Sort by riskScore descending
  currentCases.sort((a, b) => b.riskScore - a.riskScore);
  return currentCases;
}

// GET /api/cases - List flagged cases sorted by riskScore descending
router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && !forceRefresh) {
      let cases = await CaseFile.find()
        .populate('transactionId')
        .sort({ riskScore: -1 })
        .lean();

      if (cases.length > 0) {
        return res.json(cases);
      }
    }

    // Return dynamic varied batch
    const batch = generateDiverseCaseBatch(forceRefresh);
    return res.json(batch);
  } catch (err) {
    res.json(generateDiverseCaseBatch(false));
  }
});

// GET /api/cases/:id - Get a single case file
router.get('/:id', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      const caseFile = await CaseFile.findById(req.params.id)
        .populate('transactionId')
        .lean();
      if (caseFile) {
        const agentLogs = await AgentRunLog.findOne({ caseFileId: caseFile._id }).lean();
        return res.json({ ...caseFile, agentLogs: agentLogs ? agentLogs.steps : [] });
      }
    }

    const found = generateDiverseCaseBatch(false).find((c) => c._id === req.params.id);
    if (found) {
      return res.json(found);
    }
    return res.status(404).json({ error: 'Case file not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cases/:id - Compliance officer decision (approve/dismiss)
router.patch('/:id', async (req, res) => {
  try {
    const { status, reviewedBy } = req.body;
    if (!['approved', 'dismissed', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved, dismissed, or pending' });
    }

    const isDbConnected = mongoose.connection.readyState === 1;
    let updated = null;

    if (isDbConnected) {
      updated = await CaseFile.findByIdAndUpdate(
        req.params.id,
        { status, reviewedBy: reviewedBy || 'Compliance Officer' },
        { new: true }
      ).populate('transactionId');
    }

    if (!updated) {
      const demoCases = generateDiverseCaseBatch(false);
      const targetCase = demoCases.find((c) => c._id === req.params.id);
      if (targetCase) {
        targetCase.status = status;
        targetCase.reviewedBy = reviewedBy || 'Compliance Officer';
        updated = targetCase;
      }
    }

    if (!updated) {
      return res.status(404).json({ error: 'Case file not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('case-updated', updated);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/investigate/:txId - Trigger an autonomous agent investigation
router.post('/investigate/:txId', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let tx = null;

    if (isDbConnected) {
      tx = await Transaction.findById(req.params.txId);
    }

    if (!tx) {
      const txns = getFallbackTransactions();
      tx = txns.find((t) => String(t._id) === String(req.params.txId) || String(t.transaction_id) === String(req.params.txId));
    }

    if (!tx) {
      tx = {
        _id: req.params.txId,
        fromAccount: '119_8000DD5C0',
        toAccount: '119_8000E0380',
        amountUSD: 49500.0,
        timestamp: new Date(),
        paymentFormat: 'ACH',
        narration: 'Payment as discussed regarding urgent settlement',
        anomalyScore: 0.85
      };
    }

    const io = req.app.get('io');
    const { caseFile: agentVerdict, log } = await investigate(tx, io);

    let populatedCase = null;
    if (isDbConnected) {
      let caseDoc = await CaseFile.findOne({ transactionId: tx._id });
      if (!caseDoc) {
        caseDoc = new CaseFile({
          transactionId: tx._id,
          riskScore: agentVerdict.riskScore,
          evidence: agentVerdict.evidence,
          reasoningTrace: agentVerdict.reasoning ? [agentVerdict.reasoning] : [],
          verdict: agentVerdict.recommendedAction || 'escalate',
          status: 'pending'
        });
      } else {
        caseDoc.riskScore = agentVerdict.riskScore;
        caseDoc.evidence = agentVerdict.evidence;
        caseDoc.reasoningTrace = agentVerdict.reasoning ? [agentVerdict.reasoning] : [];
        caseDoc.verdict = agentVerdict.recommendedAction || 'escalate';
      }
      await caseDoc.save();

      let runLog = await AgentRunLog.findOne({ caseFileId: caseDoc._id });
      if (!runLog) {
        runLog = new AgentRunLog({ caseFileId: caseDoc._id, steps: log });
      } else {
        runLog.steps = log;
      }
      await runLog.save();

      populatedCase = await CaseFile.findById(caseDoc._id).populate('transactionId');
    } else {
      populatedCase = {
        _id: `CASE_${tx.transaction_id || tx._id}`,
        transactionId: tx,
        riskScore: agentVerdict.riskScore,
        evidence: agentVerdict.evidence,
        reasoningTrace: agentVerdict.reasoning ? [agentVerdict.reasoning] : [],
        verdict: agentVerdict.recommendedAction || 'escalate',
        investigated: true,
        status: 'pending',
        reviewedBy: null,
        agentLogs: log
      };

      const demoCases = generateDiverseCaseBatch(false);
      const existingIdx = demoCases.findIndex((c) => c._id === populatedCase._id || c.transactionId?._id === tx._id);
      if (existingIdx !== -1) {
        demoCases[existingIdx] = populatedCase;
      } else {
        demoCases.unshift(populatedCase);
      }
    }

    if (io) {
      io.emit('investigation-complete', populatedCase);
    }

    res.json({ caseFile: populatedCase, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.generateDiverseCaseBatch = generateDiverseCaseBatch;
