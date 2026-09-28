const path = require('path');
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const { GoogleGenAI } = require(path.join(__dirname, '..', 'server', 'node_modules', '@google', 'genai'));

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing Gemini API with key prefix:', apiKey ? apiKey.substring(0, 8) + '...' : 'NONE');

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const ai = new GoogleGenAI({ apiKey });

  for (const m of modelsToTry) {
    try {
      console.log(`Trying model: ${m}...`);
      const response = await ai.models.generateContent({
        model: m,
        contents: 'Respond with exactly: {"status": "ok"}'
      });
      console.log(`Success with ${m}! Response:`, response.text);
      return;
    } catch (err) {
      console.warn(`Model ${m} error:`, err.message);
    }
  }
}

testGemini();
