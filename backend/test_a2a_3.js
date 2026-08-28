require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');
const { toolDeclarations } = require('./tools/geminiTools.js');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
    try {
        const history = [
            {role: 'user', parts: [{text: 'I want to buy some headphones'}]},
            {role: 'model', parts: [{text: "I'd be happy to help you find the right pair of headphones! Let me search our catalog for available options."}]},
            {role: 'user', parts: [{text: 'okay search and tell me'}]}
        ];
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: history,
            tools: [{ functionDeclarations: toolDeclarations }]
        });
        console.log(JSON.stringify(response, null, 2));
    } catch(e) {
        console.error('ERROR:', e.message);
    }
}
test();
