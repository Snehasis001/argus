const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { getFallbackTransactions } = require('./seedFallback');

/**
 * Builds an ego-network subgraph around a seed account up to a specified number of hops.
 * Performs a Breadth-First Search (BFS) over transactions.
 * 
 * @param {string} accountId - Root seed account ID (e.g. "119_8000DD5C0")
 * @param {number} hops - Search depth (default 2)
 * @returns {Promise<{ nodes: string[], edges: Array<{ from: string, to: string, amount: number, timestamp: Date, txId: string }> }>}
 */
async function buildSubgraph(accountId, hops = 2) {
  const visited = new Set([accountId]);
  let frontier = [accountId];
  const edges = [];
  const seenTxIds = new Set();
  const isDbConnected = mongoose.connection.readyState === 1;

  for (let h = 0; h < hops; h++) {
    if (frontier.length === 0) break;

    let txns = [];
    if (isDbConnected) {
      // Find transactions involving any account in the current frontier via MongoDB
      txns = await Transaction.find({
        $or: [
          { fromAccount: { $in: frontier } },
          { toAccount: { $in: frontier } }
        ]
      }).select('-isLaunderingLabel').lean();
    } else {
      // Offline fallback: query seeded in-memory dataset
      const frontierSet = new Set(frontier);
      txns = getFallbackTransactions().filter(
        (t) => frontierSet.has(t.fromAccount) || frontierSet.has(t.toAccount)
      );
    }

    const nextFrontier = [];

    for (const t of txns) {
      const txIdStr = t._id.toString();
      if (!seenTxIds.has(txIdStr)) {
        seenTxIds.add(txIdStr);
        edges.push({
          txId: txIdStr,
          from: t.fromAccount,
          to: t.toAccount,
          amount: t.amountUSD,
          timestamp: t.timestamp,
          paymentFormat: t.paymentFormat,
          narration: t.narration
        });
      }

      for (const acct of [t.fromAccount, t.toAccount]) {
        if (!visited.has(acct)) {
          visited.add(acct);
          nextFrontier.push(acct);
        }
      }
    }

    frontier = nextFrontier;
  }

  return {
    nodes: Array.from(visited),
    edges
  };
}

/**
 * Tarjan's Strongly Connected Components (SCC) Algorithm.
 * 
 * Identifies circular money flows (round-trip laundering cycles: A -> B -> C -> A)
 * in linear time O(V + E) in a single DFS pass.
 * 
 * @param {string[]} nodes - List of unique account IDs
 * @param {Array<{ from: string, to: string }>} edges - List of directed edges
 * @returns {Array<string[]>} Array of strongly connected components with length > 1 (cycles)
 */
function tarjanSCC(nodes, edges) {
  let index = 0;
  const stack = [];
  const indices = {};
  const lowlink = {};
  const onStack = {};
  const sccs = [];
  const adj = {};

  // Initialize adjacency list for all known nodes
  nodes.forEach((n) => {
    adj[n] = [];
  });

  // Populate directed edges
  edges.forEach((e) => {
    const from = e.from || e.source;
    const to = e.to || e.target;
    if (from && to) {
      if (!adj[from]) adj[from] = [];
      if (!adj[to]) adj[to] = [];
      adj[from].push(to);
    }
  });

  function strongconnect(v) {
    indices[v] = lowlink[v] = index++;
    stack.push(v);
    onStack[v] = true;

    const neighbors = adj[v] || [];
    for (const w of neighbors) {
      if (indices[w] === undefined) {
        // Successor w has not yet been visited; recurse on it
        strongconnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        // Successor w is in stack and hence in the current SCC
        lowlink[v] = Math.min(lowlink[v], indices[w]);
      }
    }

    // If v is a root node, pop the stack and generate an SCC
    if (lowlink[v] === indices[v]) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        component.push(w);
      } while (w !== v);

      // Only retain true cycles (components of size > 1), ignoring self-contained singletons
      if (component.length > 1) {
        sccs.push(component);
      }
    }
  }

  // Iterate over all nodes in case the graph has multiple disconnected components
  const allNodes = Object.keys(adj);
  allNodes.forEach((n) => {
    if (indices[n] === undefined) {
      strongconnect(n);
    }
  });

  return sccs; // each entry is a set of accounts forming a circular money loop
}

/**
 * Computes degree centrality (in-degree and out-degree) across a subgraph.
 * Essential for detecting Fan-In (gather) and Fan-Out (scatter) structuring patterns.
 * 
 * @param {string[]} nodes
 * @param {Array<{ from: string, to: string }>} edges
 * @returns {Record<string, { inDegree: number, outDegree: number, totalDegree: number }>}
 */
function degreeCentrality(nodes, edges) {
  const centrality = {};
  nodes.forEach((n) => {
    centrality[n] = { inDegree: 0, outDegree: 0, totalDegree: 0 };
  });

  edges.forEach((e) => {
    if (!centrality[e.from]) centrality[e.from] = { inDegree: 0, outDegree: 0, totalDegree: 0 };
    if (!centrality[e.to]) centrality[e.to] = { inDegree: 0, outDegree: 0, totalDegree: 0 };

    centrality[e.from].outDegree += 1;
    centrality[e.to].inDegree += 1;
    centrality[e.from].totalDegree += 1;
    centrality[e.to].totalDegree += 1;
  });

  return centrality;
}

module.exports = {
  buildSubgraph,
  tarjanSCC,
  degreeCentrality
};
