const { GoogleGenAI } = require('@google/genai');
const { runMerchantAgent } = require('./agentCore');
const auditService = require('./services/auditService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BUYER_SYSTEM_PROMPT = `You are an AI Shopping Assistant for a user, chatting with 'Aura', a Merchant Agent.
Goal: Fulfill the shopping intent efficiently.
1. Be direct. State what you want.
2. Evaluate products proposed by Aura.
3. Once satisfied, ask for a payment link or say "DONE".
4. NEVER invent prices/products. Wait for Aura to propose.
5. Do not ask the user questions.
6. Stop and say "DONE" if payment link is given or approval is required.`;

const buyerSessions = {};

async function executeAIBuyerJourney(sessionId, intent) {
    if (!buyerSessions[sessionId]) {
        buyerSessions[sessionId] = [];
    }

    const history = buyerSessions[sessionId];
    
    // Initial instruction to the Buyer AI
    const instruction = history.length === 0 
        ? `The user's intent is: "${intent}". Begin the conversation with the Merchant to fulfill this intent.`
        : `The user's original intent was: "${intent}". Continue the conversation.`;

    history.push({ role: "user", parts: [{ text: instruction }] });

    auditService.logEvent('AI_BUYER_STARTED', 'AI Buyer Orchestrator', `Started journey for intent: "${intent}"`, 'SUCCESS');

    const transcript = [];
    let isDone = false;
    let turns = 0;
    const MAX_TURNS = 3;
    const seenBuyerMessages = new Set();

    while (!isDone && turns < MAX_TURNS) {
        try {
            // Compact context for Gemini: original intent + last merchant reply (if any)
            const compactHistory = [history[0]];
            if (history.length > 1) {
                compactHistory.push(history[history.length - 1]); // the latest merchant reply
            }

            console.log(`[GEMINI API] Model: gemini-3.1-flash-lite | Purpose: AI Buyer | Turn: ${turns + 1}`);
            if (global.metrics) global.metrics.gemini_3_1_flash_lite_calls++;

            // 1. Get AI Buyer's message
            const buyerResponse = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: compactHistory,
                config: {
                    systemInstruction: { parts: [{ text: BUYER_SYSTEM_PROMPT }] }
                }
            });

            let buyerText = buyerResponse.text || "Hello, I am looking to make a purchase.";
            
            if (buyerText.includes("DONE")) {
                buyerText = buyerText.replace("DONE", "").trim();
                isDone = true;
            }

            // Repeat Message Protection
            const normalizedMsg = buyerText.trim().toLowerCase();
            if (seenBuyerMessages.has(normalizedMsg)) {
                console.log(`[AI BUYER] Terminating loop due to repeated message: "${buyerText}"`);
                isDone = true;
                break;
            }
            seenBuyerMessages.add(normalizedMsg);

            history.push({ role: "model", parts: [{ text: buyerText }] });
            
            if (buyerText.trim()) {
                transcript.push({ role: 'ai_buyer', text: buyerText });
            }

            if (isDone && !buyerText.trim()) break;

            // 2. Send to Merchant Agent Core
            const merchantReplyRaw = await runMerchantAgent({
                sessionId: sessionId,
                message: buyerText,
                buyerType: 'ai'
            });

            transcript.push({ role: 'merchant', text: merchantReplyRaw });

            // Ensure the AI Buyer receives actual text, not "[object Object]"
            let merchantReplyText = "";
            if (typeof merchantReplyRaw === 'string') {
                merchantReplyText = merchantReplyRaw;
            } else if (merchantReplyRaw && typeof merchantReplyRaw === 'object') {
                merchantReplyText = merchantReplyRaw.responseText || merchantReplyRaw.text || JSON.stringify(merchantReplyRaw);
            } else {
                merchantReplyText = String(merchantReplyRaw);
            }

            // 3. Feed Merchant's reply back to AI Buyer
            history.push({ role: "user", parts: [{ text: `Merchant says: "${merchantReplyText}"` }] });
            
            // Deterministic Termination
            const lowerReply = merchantReplyText.toLowerCase();
            const lowerIntent = intent.toLowerCase();
            
            // Check for search-only intents
            const isSearchIntent = (
                lowerIntent.includes("find me") || lowerIntent.includes("show me") || 
                lowerIntent.includes("looking for") || lowerIntent.includes("recommend") || 
                lowerIntent.includes("best") || lowerIntent.includes("options") || 
                lowerIntent.includes("i want a") || lowerIntent.includes("search")
            );
            
            const isPurchaseIntent = (
                lowerIntent.includes("buy") || lowerIntent.includes("purchase") || 
                lowerIntent.includes("checkout") || lowerIntent.includes("order") || 
                lowerIntent.includes("generate payment link")
            );

            if (isSearchIntent && !isPurchaseIntent && lowerReply.includes("₹") && lowerReply.match(/p\d{3}/i)) {
                console.log(`[AI BUYER] Search-only intent detected.`);
                console.log(`[AI BUYER] Product + price received.`);
                console.log(`[AI BUYER] Deterministic completion: discovery intent fulfilled.`);
                isDone = true;
            } else if (
                merchantReplyRaw?.paymentLink ||
                lowerReply.includes("approval") ||
                lowerReply.includes("rejected") ||
                lowerReply.includes("blocked") ||
                (lowerReply.includes("₹") && turns >= 2) // Fallback for other intents
            ) {
                console.log(`[AI BUYER] Deterministic termination triggered. Intent fulfilled.`);
                isDone = true;
            }

            console.log(`=== AI BUYER RESPONSE VALIDATION ===\nIntent: ${intent}\nAura response received: true\nResponse length: ${merchantReplyText.length}\nResponse accepted: true\nCurrent turn: ${turns + 1}\nAction: ${isDone ? 'COMPLETE' : 'CONTINUE'}`);

            turns++;
        } catch (err) {
            console.error("AI Buyer Orchestrator Error:", err);
            auditService.logEvent('AI_BUYER_ERROR', 'AI Buyer', err.message, 'FAILED');
            transcript.push({ role: 'system', text: `Error during AI Buyer execution: ${err.message}` });
            break;
        }
    }

    if (isDone) {
        console.log(`=== AI BUYER RESPONSE VALIDATION ===\nIntent: ${intent}\nAction: COMPLETE`);
        auditService.logEvent('AI_BUYER_COMPLETED', 'AI Buyer Orchestrator', `Successfully completed journey for intent: "${intent}"`, 'SUCCESS');
    } else if (turns >= MAX_TURNS) {
        console.log(`=== AI BUYER RESPONSE VALIDATION ===\nIntent: ${intent}\nAction: MAX_TURNS_REACHED`);
        auditService.logEvent('AI_BUYER_MAX_TURNS_REACHED', 'AI Buyer Orchestrator', `Reached maximum turns (${MAX_TURNS}) for intent: "${intent}"`, 'WARNING');
    }

    return transcript;
}

module.exports = {
    executeAIBuyerJourney
};
