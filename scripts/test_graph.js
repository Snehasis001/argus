const { tarjanSCC, degreeCentrality } = require('../server/services/graphTools');

console.log('Testing Graph Algorithms...');

// Test 1: Cycle A -> B -> C -> A, with D -> A
const nodes = ['A', 'B', 'C', 'D'];
const edges = [
  { from: 'A', to: 'B' },
  { from: 'B', to: 'C' },
  { from: 'C', to: 'A' },
  { from: 'D', to: 'A' }
];

const sccs = tarjanSCC(nodes, edges);
console.log('Detected cycles:', sccs);

const deg = degreeCentrality(nodes, edges);
console.log('Degree centrality:', deg);

// Test 2: DAG (no cycles)
const dagEdges = [
  { from: 'A', to: 'B' },
  { from: 'B', to: 'C' }
];
const dagSCCs = tarjanSCC(['A', 'B', 'C'], dagEdges);
console.log('DAG cycles (should be empty []):', dagSCCs);

if (sccs.length === 1 && sccs[0].length === 3 && dagSCCs.length === 0) {
  console.log('All graph unit tests passed successfully!');
} else {
  console.error('Test verification failed!');
  process.exit(1);
}
