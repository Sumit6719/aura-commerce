const { GoogleGenAI } = require('@google/genai');
const { runMerchantAgent } = require('./agentCore');
const auditService = require('./services/auditService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BUYER_SYSTEM_PROMPT = `You are an Autonomous AI Shopping Concierge acting on behalf of a human user.
You are communicating with 'Aura', a Merchant Agent, via an internal API. Aura returns JSON responses.
Your goal is to fulfill the user's request completely autonomously up to the point of checkout.
The human user will NOT answer any questions. You MUST make all decisions.

CRITICAL RULES:
1. PROGRESS THE JOURNEY: Never repeat a previous command. If you searched, next evaluate accessories or add to cart.
2. ACCESSORIES: Ask Aura for relevant accessories if appropriate. Add them ONLY if they fit the budget and are highly useful.
3. NEGOTIATE: If the total is high, ask Aura to "create an offer" or give a "bundle discount".
4. BUDGET: You must respect the user's budget.
5. CHECKOUT: Once the optimal cart is decided, explicitly provide customer details ("Name: Test User, Email: test@example.com") and command Aura to "finalize checkout". This will generate the payment link in one atomic step.
6. DO NOT output "[TO_HUMAN]". Do NOT ask the human questions. Make the best decision yourself.
7. Stop outputting and say "DONE" ONLY after you have successfully received a payment link from Aura.

Your output is sent directly as a text command to Aura. Be direct. Example sequence:
- Turn 1: "Find me a laptop under 80000"
- Turn 2: "What compatible accessories do you have for product P101?"
- Turn 3: "Add P101 and the wireless mouse A101 to my cart. Can you give me your best bundle price?"
- Turn 4: "Accept the price. Please finalize checkout for P101 and A101. Name: Test User, Email: test@example.com"
`;

const buyerSessions = {};

async function executeAIBuyerJourney(sessionId, intent) {
    if (!buyerSessions[sessionId]) {
        buyerSessions[sessionId] = [];
    }

    const history = buyerSessions[sessionId];
    
    // Initial instruction to the Buyer AI
    const instruction = history.length === 0 
        ? `The user's intent is: "${intent}". Begin autonomous shopping.`
        : `The user's original intent was: "${intent}". Continue autonomous shopping.`;

    history.push({ role: "user", parts: [{ text: instruction }] });

    auditService.logEvent('AI_BUYER_STARTED', 'AI Buyer Orchestrator', `Started autonomous journey for intent: "${intent}"`, 'SUCCESS');

    const transcript = [];
    let isDone = false;
    let turns = 0;
    const MAX_TURNS = 12; // AUTONOMOUS MODE
    const seenBuyerMessages = new Set();
    
    // Maintain a compact state to save tokens. We won't send the entire history to the LLM, 
    // only a rolling window of the last 3 turns + the original intent.

    while (!isDone && turns < MAX_TURNS) {
        try {
            const compactHistory = [history[0]];
            if (history.length > 3) {
                compactHistory.push(...history.slice(history.length - 2));
            } else if (history.length > 1) {
                compactHistory.push(...history.slice(1));
            }

            console.log(`[GEMINI API] Model: gemini-3.1-flash-lite | Purpose: AI Buyer | Turn: ${turns + 1}`);
            if (global.metrics) global.metrics.gemini_3_1_flash_lite_calls++;

            const buyerResponse = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: compactHistory,
                config: {
                    systemInstruction: { parts: [{ text: BUYER_SYSTEM_PROMPT }] }
                }
            });

            let buyerText = buyerResponse.text || "I want to checkout now. Name: Test User, Email: test@example.com";
            
            if (buyerText.includes("DONE")) {
                buyerText = buyerText.replace("DONE", "").trim();
                if (!buyerText) isDone = true;
            }

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

            const merchantReplyRaw = await runMerchantAgent({
                sessionId: sessionId,
                message: buyerText,
                buyerType: 'ai'
            });

            const merchantTranscriptEntry = { 
                role: 'merchant', 
                text: typeof merchantReplyRaw === 'string' ? merchantReplyRaw : (merchantReplyRaw.responseText || merchantReplyRaw.text || JSON.stringify(merchantReplyRaw)) 
            };
            if (typeof merchantReplyRaw === 'object' && merchantReplyRaw.paymentLink) {
                merchantTranscriptEntry.paymentLink = merchantReplyRaw.paymentLink;
            } else if (typeof merchantReplyRaw === 'object' && merchantReplyRaw.link) {
                merchantTranscriptEntry.paymentLink = merchantReplyRaw.link;
            }
            transcript.push(merchantTranscriptEntry);

            let merchantReplyText = "";
            if (typeof merchantReplyRaw === 'string') {
                merchantReplyText = merchantReplyRaw;
            } else if (merchantReplyRaw && typeof merchantReplyRaw === 'object') {
                merchantReplyText = merchantReplyRaw.responseText || merchantReplyRaw.text || JSON.stringify(merchantReplyRaw);
            } else {
                merchantReplyText = String(merchantReplyRaw);
            }

            history.push({ role: "user", parts: [{ text: `Aura responded: ${merchantReplyText}` }] });
            
            const lowerReply = merchantReplyText.toLowerCase();
            if (
                merchantTranscriptEntry.paymentLink ||
                lowerReply.includes("paymentlink") ||
                lowerReply.includes("pay via") ||
                (merchantReplyRaw && merchantReplyRaw.status === 'success' && merchantReplyRaw.link)
            ) {
                console.log(`[AI BUYER] Checkout ready. Autonomous journey complete.`);
                isDone = true;
            }

            turns++;
        } catch (err) {
            console.error("AI Buyer Orchestrator Error:", err);
            auditService.logEvent('AI_BUYER_ERROR', 'AI Buyer', err.message, 'FAILED');
            transcript.push({ role: 'system', text: `Error during AI Buyer execution: ${err.message}` });
            break;
        }
    }

    if (isDone) {
        auditService.logEvent('AI_BUYER_COMPLETED', 'AI Buyer Orchestrator', `Successfully completed autonomous journey`, 'SUCCESS');
    } else if (turns >= MAX_TURNS) {
        auditService.logEvent('AI_BUYER_MAX_TURNS_REACHED', 'AI Buyer Orchestrator', `Reached maximum turns (${MAX_TURNS})`, 'WARNING');
    }

    let userFacingMessage = "Your autonomous shopping session is complete.";
    let paymentLink = null;
    let totalAmount = 0;

    for (const entry of transcript) {
        if (entry.paymentLink) paymentLink = entry.paymentLink;
        if (entry.role === 'merchant') {
            try {
                const parsed = JSON.parse(entry.text);
                if (parsed.type === 'offer' && parsed.finalTotal) totalAmount = parsed.finalTotal;
                if (parsed.type === 'checkout' && parsed.paymentLink) paymentLink = parsed.paymentLink;
                if (parsed.paymentLink) paymentLink = parsed.paymentLink;
                if (parsed.link) paymentLink = parsed.link;
            } catch (e) {}
        }
    }

    if (paymentLink) {
        if (totalAmount > 0) {
            userFacingMessage = `Perfect. I found the right products for you and successfully negotiated the bundle to ₹${totalAmount}. Your secure payment is ready.`;
        } else {
            userFacingMessage = "Perfect. I found the right products for you and finalized the bundle. Your secure payment is ready.";
        }
    } else {
        userFacingMessage = "I have completed the search, but I couldn't finalize a checkout for you. Please check the catalog directly.";
    }

    return {
        transcript,
        userFacingMessage,
        paymentLink
    };
}

module.exports = {
    executeAIBuyerJourney
};
