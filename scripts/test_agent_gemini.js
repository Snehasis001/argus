const path = require('path');
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const { investigate } = require(path.join(__dirname, '..', 'server', 'services', 'agent'));

async function testAgentLive() {
  console.log('Testing live Agent with Gemini API...');
  
  const sampleTx = {
    _id: '66e1f7a0c1d2e3f4a5b6c7d8',
    fromAccount: '119_8000DD5C0',
    toAccount: '119_8000E0380',
    amountUSD: 49500.00,
    timestamp: new Date(),
    paymentFormat: 'ACH',
    narration: 'Payment as discussed regarding urgent settlement',
    anomalyScore: 0.85,
    isLaunderingLabel: true // will be stripped
  };

  try {
    const { caseFile, log } = await investigate(sampleTx);
    console.log('\n====== AGENT INVESTIGATION SUCCESSFUL ======');
    console.log('Case File Verdict:');
    console.log(JSON.stringify(caseFile, null, 2));
    console.log(`\nExecuted ${log.length} tool calls during investigation.`);
    for (const step of log) {
      console.log(` - Step ${step.step}: ${step.tool} -> output received.`);
    }
    console.log('============================================\n');
  } catch (err) {
    console.error('Agent live test error:', err);
  }
}

testAgentLive();
