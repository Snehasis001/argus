const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CaseFile = require('../models/CaseFile');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const AgentRunLog = require('../models/AgentRunLog');
const { buildSubgraph, tarjanSCC, degreeCentrality } = require('../services/graphTools');
const { investigate } = require('../services/agent');
const { getFallbackTransactions } = require('../services/seedFallback');

const { generateDiverseCaseBatch } = require('./cases');

function getInitialDemoCases() {
  return generateDiverseCaseBatch(false);
}

// GET /api/cases - List flagged cases sorted by riskScore descending
router.get('/cases', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      let cases = await CaseFile.find()
        .populate('transactionId')
        .sort({ riskScore: -1 })
        .lean();

      if (cases.length === 0) {
        // Automatically provide demo cases if DB is empty
        cases = getInitialDemoCases();
      }
      return res.json(cases);
    } else {
      // Offline DB mode: return initial demo cases
      return res.json(getInitialDemoCases());
    }
  } catch (err) {
    res.json(getInitialDemoCases());
  }
});

// GET /api/cases/:id - Get a single case file
router.get('/cases/:id', async (req, res) => {
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

    // In-memory fallback
    const found = getInitialDemoCases().find((c) => c._id === req.params.id);
    if (found) {
      return res.json(found);
    }
    return res.status(404).json({ error: 'Case file not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cases/:id - Compliance officer decision (approve/dismiss)
router.patch('/cases/:id', async (req, res) => {
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
      const demoCases = getInitialDemoCases();
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

    // Broadcast update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('case-updated', updated);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/:accountId - Get 2-hop transaction network around an account with cycles highlighted
router.get('/graph/:accountId', async (req, res) => {
  try {
    const hops = parseInt(req.query.hops) || 2;
    const subgraph = await buildSubgraph(req.params.accountId, hops);
    const cycles = tarjanSCC(subgraph.nodes, subgraph.edges);
    const centrality = degreeCentrality(subgraph.nodes, subgraph.edges);

    // Identify which nodes and edges participate in cycles
    const cycleNodeSet = new Set(cycles.flat());

    const graphData = {
      nodes: subgraph.nodes.map((nodeId) => ({
        id: nodeId,
        inCycle: cycleNodeSet.has(nodeId),
        centrality: centrality[nodeId] || { inDegree: 0, outDegree: 0, totalDegree: 0 },
        isRoot: nodeId === req.params.accountId
      })),
      links: subgraph.edges.map((e) => ({
        source: e.from,
        target: e.to,
        amount: e.amount,
        txId: e.txId,
        inCycle: cycleNodeSet.has(e.from) && cycleNodeSet.has(e.to),
        narration: e.narration
      })),
      cycles
    };

    res.json(graphData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/investigate/:txId - Trigger an autonomous agent investigation on a transaction
router.post('/investigate/:txId', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let tx = null;

    if (isDbConnected) {
      tx = await Transaction.findById(req.params.txId);
    }

    if (!tx) {
      // Look up in fallback transactions
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

    // Launch agent investigation (streams live steps via io)
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
      // In-memory update
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

      const demoCases = getInitialDemoCases();
      const existingIdx = demoCases.findIndex(
        (c) =>
          c._id === populatedCase._id ||
          c.transactionId?._id === tx._id ||
          c.transactionId?.transaction_id === tx.transaction_id
      );
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
