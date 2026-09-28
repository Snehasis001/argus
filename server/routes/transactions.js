const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const CaseFile = require('../models/CaseFile');
const AgentRunLog = require('../models/AgentRunLog');
const { buildSubgraph, tarjanSCC, degreeCentrality } = require('../services/graphTools');
const { investigate } = require('../services/agent');
const { getFallbackTransactions } = require('../services/seedFallback');

// GET /api/transactions/:id - Fetch single transaction
router.get('/:id', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let tx = null;
    if (isDbConnected) {
      tx = await Transaction.findById(req.params.id).lean();
    }
    if (!tx) {
      tx = getFallbackTransactions().find((t) => String(t._id) === req.params.id || String(t.transaction_id) === req.params.id);
    }
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:id/graph - Get 2-hop transaction network around transaction's fromAccount
router.get('/:id/graph', async (req, res) => {
  try {
    const hops = parseInt(req.query.hops) || 2;
    const accountId = req.params.id; // supports accountId directly

    const subgraph = await buildSubgraph(accountId, hops);
    const cycles = tarjanSCC(subgraph.nodes, subgraph.edges);
    const centrality = degreeCentrality(subgraph.nodes, subgraph.edges);
    const cycleNodeSet = new Set(cycles.flat());

    const graphData = {
      nodes: subgraph.nodes.map((nodeId) => ({
        id: nodeId,
        inCycle: cycleNodeSet.has(nodeId),
        centrality: centrality[nodeId] || { inDegree: 0, outDegree: 0, totalDegree: 0 },
        isRoot: nodeId === accountId
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

// POST /api/transactions/:id/investigate - Trigger LLM Agent Investigation
router.post('/:id/investigate', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let tx = null;

    if (isDbConnected) {
      tx = await Transaction.findById(req.params.id);
    }
    if (!tx) {
      const txns = getFallbackTransactions();
      tx = txns.find((t) => String(t._id) === req.params.id || String(t.transaction_id) === req.params.id);
    }
    if (!tx) {
      tx = {
        _id: req.params.id,
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
        status: 'pending',
        reviewedBy: null,
        agentLogs: log
      };
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
