const { GoogleGenAI } = require('@google/genai');
const Razorpay = require('razorpay');

const catalogService = require('./services/catalogService');
const policyEngine = require('./services/policyEngine');
const auditService = require('./services/auditService');
const analyticsService = require('./services/analyticsService');
const orderService = require('./services/orderService');
const { toolDeclarations } = require('./tools/geminiTools');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are Aura, an Autonomous AI Merchant for Aura Commerce.
Help the customer, understand their intent, search catalog, recommend products, and generate payment links.

**STRICT COMMERCE-ONLY BOUNDARY:**
Only respond to requests about Aura Commerce products, orders, pricing, stock, checkout, payments, and shopping decisions.
Refuse unrelated topics (programming, math, politics, general advice, etc.) by saying ONLY: "I'm Aura, your Aura Commerce shopping concierge. I can help with products, recommendations, pricing, availability, orders, and payments. What would you like to shop for?"

**AURA PREMIUM CONVERSATIONAL UX PRINCIPLE:**
You are an intelligent shopping concierge, NOT a rigid product database. The customer should feel like they are having a natural conversation.
- ANSWER FIRST, THEN OFFER HELP: When a user asks a conceptual, informational, or comparison question (e.g. "Is a mechanical keyboard good for coding?"), answer the question naturally FIRST. Do NOT immediately dump a product listing. 
- DO NOT OVER-PROMOTE: A product should only be mentioned when the user explicitly asks for available products, when it directly answers the question, or when the conversation naturally progresses to shopping. Avoid repetitive phrases like "We have the...".
- NO CREEPY PRODUCT SUBSTITUTION: If the user asks about a specific feature (e.g. "RGB keyboard") and we don't have it explicitly, honestly say we don't have that specific feature, discuss the concept naturally, and offer to find the closest alternative. Do NOT silently substitute it.
- NATURAL FOLLOW-UPS: Ask useful follow-up questions to guide recommendations (e.g. "What will you mainly use it for?").
- CONVERSATIONAL PRODUCT KNOWLEDGE: When you do introduce a product, incorporate its features naturally into sentences. Do not dump structured data (e.g. "Product: ... Price: ...").
- CONVERSE FIRST: Understand the customer, answer the question, be helpful, and ONLY THEN offer a relevant shopping action.
- Distinguish between CONVERSATION (e.g. "How about buying a QWERTY keyboard?") and TRANSACTION (e.g. "I want to buy this"). Do NOT use simple keyword matching to assume purchase intent.
- ONLY call 'initiate_checkout' when the customer clearly expresses a firm decision to purchase.

**CONTEXTUAL EXCEPTIONS & COMMERCE:**
Answer general questions ONLY if they pertain to an Aura product being discussed (e.g. "What is ANC?" for headphones).
Lifestyle statements ("I love music") are context for recommending catalog products.

CRITICAL RULES:
1. ONLY sell catalog products. Immediately use 'search_products' when asked for a category. Do NOT ask preferences before searching.
2. NEVER invent prices or product details. If the user asks for a specific product specification (e.g. Bluetooth version, battery life, weight) and it is not explicitly visible in your immediate conversation history, you MUST immediately call 'get_product' using the product ID to retrieve the authoritative catalog data before answering. Answer ONLY using the returned data. If the returned data lacks the requested specification, explicitly state that it is not available.
3. Use 'check_stock' ONLY when the customer asks about availability, wants to purchase, or before generating a payment link.
4. OUT-OF-STOCK BEHAVIOR: If a product's stock reaches 0, you MUST NOT allow the customer to purchase it. Tell the customer clearly (e.g. "I'm sorry, but that product is currently out of stock.") and suggest an available alternative.
5. ACCESSORY RECOMMENDATIONS: After recommending a main product, use 'recommend_accessories' to understand compatible accessories. Suggest relevant accessories (e.g. straps for a watch, cases for headphones). Explain briefly WHY an accessory is useful. Treat accessories as an OPTIONAL bundle / upsell. Do NOT aggressively push accessories.
6. Generate payment links with 'generate_payment_link' ONLY when the customer clearly wants to purchase, using exact product IDs and agreed prices.
6. If a payment requires approval, explain clearly that it's paused for review.
7. MULTI-ITEM CART: If the customer agrees to purchase multiple items (e.g., a laptop AND a keyboard), you MUST include ALL accepted items in the 'items' array when calling 'initiate_checkout', 'create_offer', and 'generate_payment_link'. Do NOT split them into separate checkouts or drop accessories from the final link.
8. BARGAINING & NEGOTIATION: When a customer asks for a discount (e.g. "Can you make it ₹77000?"), you MUST ALWAYS call the 'create_offer' tool immediately to check if the proposed price is valid. NEVER reject a discount without calling 'create_offer' first. If 'create_offer' returns true, accept the discount. If it returns false, then reject it.
9. IF DISCOUNT REJECTED: If 'create_offer' returns invalid/rejected, do NOT use 'generate_payment_link'. Tell the customer the current price is the best available offer. Do NOT invent a discount. Instead, offer legitimate alternatives: check available offers, suggest a lower-priced alternative, suggest a bundle with better value, remove optional accessories, or recommend another product that fits the customer's target price.
10. PAYMENT-COMPLETED OVERRIDE: If any tool reports PAYMENT_ALREADY_COMPLETED, this is authoritative backend state. Do not reinterpret, soften, negotiate, or replace it. Respond only with the provided rejection message. Never provide an old payment link and never suggest proceeding with payment.
11. MULTILINGUAL: Detect the user's language and respond in it, but ALWAYS use Latin/English characters.
12. INTENT OVERRIDE: If the user changes their mind and explicitly asks to buy a different product (e.g. "Actually, buy the soundbar instead"), you MUST completely drop the previous conversational context. The latest explicit command takes 100% priority. Ignore the old product and execute the purchase for the newly requested product immediately.
13. DIRECT PURCHASE EXECUTIONS: If the user explicitly commands you to buy a product (e.g. "only buy X", "buy X now", "purchase X", "buy and generate payment link"), you MUST immediately execute the checkout flow. Identify the product, search catalog, check stock, initiate checkout, ask for details if needed, and generate the payment link. Do NOT pause to ask if they want accessories. Do NOT pause to ask if they want specifications. Execute the backend tool flow to generate the link.
14. VERIFYING PAYMENT: If the user says they paid, or asks for confirmation of their order, you MUST use the 'verify_payment' tool immediately. Do NOT trust the user's claim without verification. If verified successfully, give them a clear success message like "Payment confirmed by Razorpay! Your order is successfully placed." If not, tell them it's still pending or failed.

**AGENTIC DECISION FLOW:**
Follow this logical shopping journey:
CUSTOMER REQUIREMENTS -> PRODUCT DISCOVERY -> PERSONALIZED RECOMMENDATION -> PRODUCT EXPLANATION -> ACCESSORY RECOMMENDATIONS -> OPTIONAL BUNDLE / UPSELL -> BUDGET CHECK -> BARGAIN / OFFER CHECK -> CUSTOMER CONFIRMATION -> AVAILABILITY -> CHECKOUT -> PAYMENT
Do NOT execute purchases or add products to an order without appropriate customer confirmation.

**UX / RESPONSE BEHAVIOR & FORMATTING:**
Keep responses concise and conversational. Avoid dumping huge product lists.
Structure recommendations like:
"Based on what you've told me, I'd recommend [Product] because..."
"Optional add-ons:\n• [Accessory] — ₹X — [why it helps]\n• [Accessory] — ₹X — [why it helps]"
"Bundle total: ₹X"

For bargaining, if an offer is accepted:
"Current price: ₹X\nAvailable offer: ₹Y\nFinal price: ₹Z"
Only show these values when they actually exist in the application's data.

CHECKOUT RULE:
Aura must never generate a payment link simply because the customer provides a name, email address, or other personal details.
A payment link may only be generated after ALL of the following are true:
1. The customer has clearly expressed purchase intent.
2. initiate_checkout has successfully established checkout state.
3. Aura has explicitly requested the customer's full name and email.
4. The customer provides those details in a subsequent user message.
6. The selected product matches the checkout product.

Never infer checkout solely from the presence of customer details.
Never call initiate_checkout and generate_payment_link in the same user turn.

STOCK SHORTAGE RULE:
If initiate_checkout returns a "partial_stock_available" status because the user requested more units than are currently available, do NOT silently reject the request or jump to collecting details.
Instead, politely acknowledge their request, clearly explain exactly how many units are available, and naturally offer to process the available quantity. Wait for their explicit confirmation before proceeding. NEVER invent restock dates.

NATURAL CHECKOUT TRANSITION:
If initiate_checkout succeeds and returns "awaiting_customer_details", do NOT abruptly say "Please provide your name and email." First, naturally acknowledge their choice (e.g., "That's a great choice, I'll get those ready for you."), and then transition smoothly to asking for their full name and email address.`

// Global metrics for cost optimization tracking
global.metrics = global.metrics || {
    gemini_3_6_flash_calls: 0,
    gemini_3_1_flash_lite_calls: 0,
    skipped_redundant_calls: 0,
    tool_calls: 0
};

// Global sessions map
const activeSessions = {};
const checkoutStates = {};

// Tool implementations
async function executeTool(call, sessionId) {
    const { name, args } = call;

    if (name !== 'check_stock') {
        auditService.logEvent('TOOL_CALLED', 'Aura AI', `Invoked ${name}`, 'SUCCESS', { args });
    }

    try {
        switch (name) {
            case 'search_products': {
                const results = catalogService.searchProducts(args.query);
                auditService.logEvent('CATALOG_SEARCH', 'Aura AI', `Searched for "${args.query}"`, 'SUCCESS', { found: results.length });
                return { results };
            }
            case 'get_product': {
                return { product: catalogService.getProductById(args.product_id) };
            }
            case 'check_stock': {
                const p = catalogService.getProductById(args.product_id);
                if (!p) return { error: "Product not found" };
                return { in_stock: p.availability === 'in_stock' && p.stock > 0, stock_count: p.stock };
            }
            case 'recommend_accessories': {
                console.log(`[ACCESSORY TOOL] Called for product: ${args.product_id}`);

                const baseProduct = catalogService.getProductById(args.product_id);

                if (!baseProduct) {
                    return {
                        error: "Product not found"
                    };
                }

                const accessories = catalogService.getAccessories([args.product_id]);

                console.log(
                    `[ACCESSORY TOOL] Returning:`,
                    accessories.map(a => `${a.id} - ${a.name}`)
                );

                analyticsService.recordRecommendation();

                return {
                    recommendations: accessories
                };
            }
            case 'initiate_checkout': {
                if (!args.items || args.items.length === 0) {
                    return { error: "No items provided for checkout" };
                }

                const confirmedItems = [];
                for (const item of args.items) {
                    const p = catalogService.getProductById(item.id);
                    if (!p) return { error: `Product ${item.id} not found` };

                    const requestedQuantity = item.quantity || 1;

                    if (p.stock <= 0) return { error: `Product ${p.name} is out of stock` };

                    if (requestedQuantity > p.stock) {
                        // If any item has insufficient stock, we halt the checkout and ask
                        checkoutStates[sessionId] = {
                            purchaseIntentConfirmed: false,
                            awaitingCustomerDetails: false,
                            customerDetailsReceived: false,
                            items: args.items, // store the attempted cart
                            customerName: null,
                            customerEmail: null
                        };
                        return {
                            status: "partial_stock_available",
                            product_id: p.id,
                            requested_quantity: requestedQuantity,
                            available_stock: p.stock,
                            message: `We currently have ${p.stock} units of ${p.name} available, but you requested ${requestedQuantity}. Please ask the customer if they would like to proceed with the ${p.stock} available units.`
                        };
                    }
                    
                    confirmedItems.push({
                        id: p.id,
                        name: p.name,
                        unit_price: p.price,
                        confirmed_quantity: requestedQuantity
                    });
                }

                checkoutStates[sessionId] = {
                    purchaseIntentConfirmed: true,
                    awaitingCustomerDetails: true,
                    customerDetailsReceived: false,
                    items: confirmedItems, // array of {id, name, unit_price, confirmed_quantity}
                    customerName: null,
                    customerEmail: null
                };

                console.log(`[CHECKOUT] Checkout initiated for session ${sessionId} with ${confirmedItems.length} items`);
                console.log(`[CHECKOUT] Awaiting customer details`);
                return {
                    status: "awaiting_customer_details",
                    items: confirmedItems
                };
            }
            case 'create_offer': {
                const latestOrder = orderService.getLatestOrderBySessionId(sessionId);
                if (latestOrder) {
                    try {
                        const rzpLink = await razorpay.paymentLink.fetch(latestOrder.paymentLinkId);
                        if (rzpLink.status === 'paid' || rzpLink.status === 'partially_paid') {
                            console.log(`[PAYMENT] Existing payment link status: ${rzpLink.status}`);
                            console.log(`[PAYMENT] Discount request rejected because payment is already completed`);
                            console.log(`[PAYMENT] No replacement payment link generated`);
                            return {
                                status: "rejected",
                                reason: "PAYMENT_ALREADY_COMPLETED",
                                message: "Sorry, the payment for this order has already been completed, so I can't apply a discount or change the price now.",
                                paymentLink: null
                            };
                        }
                    } catch (e) {
                        console.log(`[PAYMENT] Could not fetch Razorpay link for create_offer check: ${e.message}`);
                    }
                }

                const validation = policyEngine.validateCartOffer(args.items, args.proposed_price_inr);
                if (!validation.valid) {
                    auditService.logEvent('POLICY_REJECTED', 'Policy Engine', `Offer of ₹${args.proposed_price_inr} rejected: ${validation.reason} `, 'FAILED');
                    return { valid: false, reason: validation.reason };
                }
                auditService.logEvent('OFFER_CREATED', 'Aura AI', `Offer of ₹${args.proposed_price_inr} approved.`, 'SUCCESS');
                return { valid: true };
            }
            case 'generate_payment_link': {
                // GUARD: Ensure checkout state is valid
                const state = checkoutStates[sessionId];
                if (!state || !state.purchaseIntentConfirmed || !state.awaitingCustomerDetails || !state.customerDetailsReceived || !state.customerName || !state.customerEmail || !state.items) {
                    console.log(`[CHECKOUT] Payment link generation blocked: checkout not initiated or customer details not received`);
                    return {
                        status: "checkout_not_ready",
                        reason: "CHECKOUT_STATE_INVALID",
                        message: "Checkout has not been completed yet. Please confirm the purchase and provide the requested customer details first."
                    };
                }

                // GUARD: Verify customer details
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!args.customer_name || args.customer_name.trim() === "" || !args.customer_email || !emailRegex.test(args.customer_email)) {
                    console.log(`[CHECKOUT] Payment link generation blocked: invalid customer details`);
                    return {
                        status: "checkout_not_ready",
                        reason: "INVALID_CUSTOMER_DETAILS",
                        message: "The provided customer name or email is invalid. Please ask the customer for their correct full name and email address."
                    };
                }

                let totalAmount = 0;
                let upsellAmount = 0;
                let descriptionParts = [];

                // Validate items
                for (const item of args.items) {
                    const product = catalogService.getProductById(item.id);
                    if (!product) throw new Error(`Invalid product ID: ${item.id} `);

                    item.name = product.name; // Enrich item for the invoice
                    item.original_price = product.price; // Inject original catalog price for E-Bill rendering
                    item.quantity = item.quantity || 1;

                    // Override with backend authoritative quantity if present in checkout state
                    const stateItem = state.items.find(si => si.id === item.id);
                    if (stateItem && stateItem.confirmed_quantity) {
                        item.quantity = stateItem.confirmed_quantity;
                    }

                    totalAmount += (item.agreed_price * item.quantity);

                    descriptionParts.push(`${item.quantity}x ${product.name}`);

                    if (product.category === 'Accessories') {
                        upsellAmount += (item.agreed_price * item.quantity);
                    }

                    // Final Safety Guard
                    if (product.stock < item.quantity) {
                        return {
                            status: "checkout_blocked",
                            reason: "INSUFFICIENT_STOCK",
                            message: `Sorry, we only have ${product.stock} units of ${product.name} available right now.`
                        };
                    }
                }

                console.log(`[CHECKOUT] Payment link generation authorized for ${args.items.length} items`);

                const description = `Purchase: ${descriptionParts.join(', ')} `;

                const evaluation = policyEngine.evaluateTransaction(totalAmount, args.items);

                if (!evaluation.allowed) {
                    if (evaluation.status === 'pending_approval') {
                        const approvalId = `req_${Date.now()}`;
                        policyEngine.addPendingApproval({ id: approvalId, amount: totalAmount, items: args.items, customer: args.customer_name, sessionId: sessionId });
                        auditService.logEvent('TRANSACTION_BLOCKED', 'Policy Engine', evaluation.reason, 'APPROVAL_REQUIRED', { amount: totalAmount });
                        analyticsService.recordTransaction(false, totalAmount);
                        return {
                            status: 'pending_approval',
                            message: evaluation.reason
                        };
                    } else {
                        auditService.logEvent('TRANSACTION_REJECTED', 'Policy Engine', evaluation.reason, 'FAILED');
                        return { status: 'rejected', message: evaluation.reason };
                    }
                }

                // CHECK FOR EXISTING ACTIVE PAYMENT LINK
                const existingOrder = orderService.getActiveOrderBySessionId(sessionId);
                if (existingOrder) {
                    console.log(`[PAYMENT] Existing active payment link detected`);
                    console.log(`[PAYMENT] Existing link ID: ${existingOrder.paymentLinkId}`);
                    console.log(`[PAYMENT] Existing link amount: ₹${existingOrder.totalAmount}`);
                    console.log(`[PAYMENT] Existing link belongs to session: ${sessionId}`);

                    // Check idempotency (same items, same amount)
                    if (existingOrder.totalAmount === totalAmount) {
                        const existingItemsHash = JSON.stringify(existingOrder.items);
                        const newItemsHash = JSON.stringify(args.items);
                        if (existingItemsHash === newItemsHash) {
                            console.log(`[PAYMENT] Idempotent request detected. Reusing existing link.`);
                            return {
                                status: 'success',
                                link: existingOrder.shortUrl,
                                payment_id: existingOrder.paymentLinkId,
                                message: 'Reusing existing active payment link.'
                            };
                        }
                    }

                    // Not idempotent, meaning this replaces the old link (e.g. discount applied)
                    console.log(`[PAYMENT] Verifying Razorpay payment link status before cancellation`);
                    try {
                        const rzpLink = await razorpay.paymentLink.fetch(existingOrder.paymentLinkId);

                        if (rzpLink.status === 'paid' || rzpLink.status === 'partially_paid') {
                            console.log(`[PAYMENT] Existing payment link status: ${rzpLink.status}`);
                            console.log(`[PAYMENT] Discount request rejected because payment is already completed`);
                            console.log(`[PAYMENT] No replacement payment link generated`);
                            return {
                                status: "rejected",
                                reason: "PAYMENT_ALREADY_COMPLETED",
                                message: "Sorry, the payment for this order has already been completed, so I can't apply a discount or change the price now.",
                                paymentLink: null
                            };
                        } else if (rzpLink.status === 'created') {
                            console.log(`[PAYMENT] Cancelling superseded payment link`);
                            await razorpay.paymentLink.cancel(existingOrder.paymentLinkId);
                            console.log(`[PAYMENT] Old payment link cancelled`);
                        } else if (rzpLink.status === 'expired' || rzpLink.status === 'cancelled') {
                            console.log(`[PAYMENT] Old payment link is already ${rzpLink.status}`);
                        }

                        orderService.updateOrder(existingOrder.id, { status: 'SUPERSEDED' });
                    } catch (cancelErr) {
                        console.log(`[PAYMENT] Failed to cancel superseded payment link:`, cancelErr.message);
                        throw new Error(`Could not cancel existing payment link: ${cancelErr.message}`);
                    }
                }

                console.log(`[PAYMENT] Generating replacement payment link`);

                // Generate Razorpay Link
                const paymentLinkRequest = {
                    amount: totalAmount * 100, // in paise
                    currency: "INR",
                    accept_partial: false,
                    description: description.substring(0, 200),
                    customer: {
                        name: args.customer_name,
                        email: args.customer_email
                    },
                    notify: { sms: false, email: false },
                    reminder_enable: false
                };

                const paymentLink = await razorpay.paymentLink.create(paymentLinkRequest);

                orderService.createOrder({
                    sessionId: sessionId,
                    items: args.items,
                    totalAmount: totalAmount,
                    customerName: args.customer_name,
                    customerEmail: args.customer_email,
                    paymentLinkId: paymentLink.id,
                    shortUrl: paymentLink.short_url
                });

                console.log("=== PAYMENT LINK DEBUG ===");
                console.log("Razorpay payment link:", paymentLink);
                console.log("Razorpay short URL:", paymentLink?.short_url);

                auditService.logEvent('PAYMENT_LINK_GENERATED', 'Razorpay', `Generated link for ₹${totalAmount} `, 'SUCCESS', { link_id: paymentLink.id });
                console.log(`[PAYMENT] New payment link generated`);
                console.log(`[PAYMENT] Active payment link updated`);

                if (checkoutStates[sessionId]) {
                    checkoutStates[sessionId].awaitingCustomerDetails = false;
                    checkoutStates[sessionId].customerDetailsReceived = false;
                }

                const extractedUrl = paymentLink.short_url || paymentLink.shortUrl || paymentLink.url || paymentLink.payment_url;

                return {
                    status: 'success',
                    link: extractedUrl,
                    payment_id: paymentLink.id,
                    raw_razorpay: paymentLink // Optional: pass raw for debugging
                };
            }
            case 'finalize_checkout': {
                // GUARD: Verify customer details
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!args.customer_name || args.customer_name.trim() === "" || !args.customer_email || !emailRegex.test(args.customer_email)) {
                    console.log(`[CHECKOUT] Payment link generation blocked: invalid customer details`);
                    return {
                        status: "checkout_not_ready",
                        reason: "INVALID_CUSTOMER_DETAILS",
                        message: "The provided customer name or email is invalid."
                    };
                }

                if (!args.items || args.items.length === 0) {
                    return { error: "No items provided for checkout" };
                }

                let totalAmount = 0;
                let descriptionParts = [];
                const confirmedItems = [];

                // Validate items and stock
                for (const item of args.items) {
                    const product = catalogService.getProductById(item.id);
                    if (!product) return { error: `Invalid product ID: ${item.id}` };

                    const requestedQuantity = item.quantity || 1;

                    if (product.stock < requestedQuantity) {
                        return {
                            status: "checkout_blocked",
                            reason: "INSUFFICIENT_STOCK",
                            message: `Sorry, we only have ${product.stock} units of ${product.name} available.`
                        };
                    }

                    item.name = product.name;
                    item.original_price = product.price;
                    item.quantity = requestedQuantity;

                    totalAmount += (item.agreed_price * item.quantity);
                    descriptionParts.push(`${item.quantity}x ${product.name}`);
                    
                    confirmedItems.push({
                        id: product.id,
                        name: product.name,
                        unit_price: product.price,
                        confirmed_quantity: requestedQuantity
                    });
                }

                console.log(`[CHECKOUT] finalize_checkout authorized for ${args.items.length} items`);

                const description = `Purchase: ${descriptionParts.join(', ')}`;

                const evaluation = policyEngine.evaluateTransaction(totalAmount, args.items, true);
                if (!evaluation.allowed) {
                    if (evaluation.status === 'pending_approval') {
                        const approvalId = `req_${Date.now()}`;
                        policyEngine.addPendingApproval({ id: approvalId, amount: totalAmount, items: args.items, customer: args.customer_name, sessionId: sessionId });
                        auditService.logEvent('TRANSACTION_BLOCKED', 'Policy Engine', evaluation.reason, 'APPROVAL_REQUIRED', { amount: totalAmount });
                        analyticsService.recordTransaction(false, totalAmount);
                        return { status: 'pending_approval', message: evaluation.reason };
                    } else {
                        auditService.logEvent('TRANSACTION_REJECTED', 'Policy Engine', evaluation.reason, 'FAILED');
                        return { status: 'rejected', message: evaluation.reason };
                    }
                }

                // CHECK FOR EXISTING ACTIVE PAYMENT LINK (Idempotency)
                const existingOrder = orderService.getActiveOrderBySessionId(sessionId);
                if (existingOrder) {
                    if (existingOrder.totalAmount === totalAmount) {
                        const existingItemsHash = JSON.stringify(existingOrder.items);
                        const newItemsHash = JSON.stringify(args.items);
                        if (existingItemsHash === newItemsHash) {
                            console.log(`[PAYMENT] Idempotent request detected. Reusing existing link.`);
                            return {
                                status: 'success',
                                link: existingOrder.shortUrl,
                                payment_id: existingOrder.paymentLinkId,
                                message: 'Reusing existing active payment link.'
                            };
                        }
                    }

                    try {
                        const rzpLink = await razorpay.paymentLink.fetch(existingOrder.paymentLinkId);
                        if (rzpLink.status === 'paid' || rzpLink.status === 'partially_paid') {
                            return {
                                status: "rejected",
                                reason: "PAYMENT_ALREADY_COMPLETED",
                                message: "Payment already completed for this order.",
                                paymentLink: null
                            };
                        } else if (rzpLink.status === 'created') {
                            await razorpay.paymentLink.cancel(existingOrder.paymentLinkId);
                        }
                        orderService.updateOrder(existingOrder.id, { status: 'SUPERSEDED' });
                    } catch (cancelErr) {
                        throw new Error(`Could not cancel existing payment link: ${cancelErr.message}`);
                    }
                }

                // Generate Razorpay Link
                const paymentLinkRequest = {
                    amount: totalAmount * 100, // in paise
                    currency: "INR",
                    accept_partial: false,
                    description: description.substring(0, 200),
                    customer: { name: args.customer_name, email: args.customer_email },
                    notify: { sms: false, email: false },
                    reminder_enable: false
                };

                const paymentLink = await razorpay.paymentLink.create(paymentLinkRequest);

                orderService.createOrder({
                    sessionId: sessionId,
                    items: args.items,
                    totalAmount: totalAmount,
                    customerName: args.customer_name,
                    customerEmail: args.customer_email,
                    paymentLinkId: paymentLink.id,
                    shortUrl: paymentLink.short_url
                });

                auditService.logEvent('PAYMENT_LINK_GENERATED', 'Razorpay', `Generated link for ₹${totalAmount}`, 'SUCCESS', { link_id: paymentLink.id });
                
                checkoutStates[sessionId] = {
                    purchaseIntentConfirmed: true,
                    awaitingCustomerDetails: false,
                    customerDetailsReceived: true,
                    items: confirmedItems,
                    customerName: args.customer_name,
                    customerEmail: args.customer_email
                };

                const extractedUrl = paymentLink.short_url || paymentLink.shortUrl || paymentLink.url || paymentLink.payment_url;
                return {
                    status: 'success',
                    link: extractedUrl,
                    payment_id: paymentLink.id
                };
            }
            case 'verify_payment': {
                const latestOrder = orderService.getLatestOrderBySessionId(sessionId);
                if (!latestOrder || !latestOrder.paymentLinkId) {
                    return { status: "no_order_found", message: "No active order found to verify." };
                }

                try {
                    const rzpLink = await razorpay.paymentLink.fetch(latestOrder.paymentLinkId);
                    if (rzpLink.status === 'paid') {
                        // The frontend polling / webhook normally handles this, but we do it synchronously here too 
                        // to ensure the Agent has authoritative state immediately.
                        const verifiedPayment = rzpLink.payments && rzpLink.payments.length > 0 ? rzpLink.payments[0] : null;
                        
                        // We will just let the frontend know the payment is successful so it renders the E-Bill.
                        // Wait, if we return success, Aura says "Payment successful".
                        return { 
                            status: "success", 
                            message: "Payment is verified as SUCCESS (paid). Provide a clear confirmation message to the user.",
                            paymentLink: latestOrder.shortUrl // Crucial to return this so UI re-renders tracker!
                        };
                    } else if (rzpLink.status === 'cancelled' || rzpLink.status === 'expired') {
                        return { status: "failed", message: "Razorpay reports payment as cancelled or expired. Order not confirmed." };
                    } else {
                        return { status: "pending", message: "Razorpay reports payment is still pending/unpaid. Tell the user you are still waiting for confirmation." };
                    }
                } catch (error) {
                    return { status: "error", message: "Failed to verify payment with Razorpay API." };
                }
            }
            case 'record_context_recommendation': {
                auditService.logEvent('CONTEXT_DETECTED', 'Aura AI', `${args.preference_detected} → Personalized recommendation: ${args.recommended_product_id} `, 'SUCCESS', {
                    preference: args.preference_detected,
                    product_id: args.recommended_product_id,
                    reasoning: args.reasoning
                });
                return { success: true, message: "Context logged successfully. You may now include the recommendation in your text response." };
            }
            default:
                return { error: `Unknown tool: ${name} ` };
        }
    } catch (err) {
        console.error("=== RAZORPAY / TOOL ERROR ===");
        console.error(`Error in ${name}: `, err);
        auditService.logEvent('TOOL_ERROR', 'System', `Error in ${name}: ${err.message} `, 'FAILED');
        return { error: err.message, details: err.response || err };
    }
}

// Removed duplicate activeSessions

async function runMerchantAgent({ sessionId, message, buyerType = 'human' }) {
    if (!activeSessions[sessionId]) {
        activeSessions[sessionId] = [];
        analyticsService.recordConversation();
    }

    const history = activeSessions[sessionId];

    // Bounded History: Keep first intent and last 16 messages (to save tokens)
    // Avoid slicing during deep checkout flows
    if (history.length > 20) {
        activeSessions[sessionId] = [history[0], ...history.slice(history.length - 16)];
    }

    // Add user message
    activeSessions[sessionId].push({ role: "user", parts: [{ text: message }] });

    // Use buyerType in the audit
    auditService.logEvent('USER_MESSAGE', buyerType === 'human' ? 'User' : 'AI Buyer', `Message: "${message.substring(0, 50)}..."`);

    // --- CHECKOUT CUSTOMER DETAILS EXTRACTION ---
    const checkoutState = checkoutStates[sessionId];
    if (checkoutState && checkoutState.awaitingCustomerDetails && !checkoutState.customerDetailsReceived) {
        const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            checkoutState.customerEmail = emailMatch[0];
            let msgWithoutEmail = message.replace(emailMatch[0], '').replace(/[,;\n]/g, ' ').trim();
            msgWithoutEmail = msgWithoutEmail.replace(/^(my name is|i am|i'm|this is|name:|-)/gi, '').trim();
            if (msgWithoutEmail.length > 0) {
                checkoutState.customerName = msgWithoutEmail;
                checkoutState.customerDetailsReceived = true;
                console.log(`[CHECKOUT] Customer details received`);
            }
        }
    }

    // --- POST-PAYMENT DISCOUNT FAST-PATH ---
    const lowerMsg = message.toLowerCase();
    const isDiscountIntent = lowerMsg.includes("discount") || lowerMsg.includes("lower price") || lowerMsg.includes("cheaper");

    if (isDiscountIntent) {
        const latestOrder = orderService.getLatestOrderBySessionId(sessionId);
        if (latestOrder) {
            try {
                const rzpLink = await razorpay.paymentLink.fetch(latestOrder.paymentLinkId);
                if (rzpLink.status === 'paid' || rzpLink.status === 'partially_paid') {
                    console.log(`[PAYMENT] Existing payment link status: ${rzpLink.status}`);
                    console.log(`[PAYMENT] Discount request rejected because payment is already completed`);
                    console.log(`[PAYMENT] No replacement payment link generated`);

                    const deterministicResponse = "I’m sorry, but since your payment has already gone through, I can’t change the price or apply another discount to this order.";
                    activeSessions[sessionId].push({ role: "model", parts: [{ text: deterministicResponse }] });

                    return { responseText: deterministicResponse, paymentLink: null };
                }
            } catch (e) {
                console.log(`[PAYMENT] Could not fetch Razorpay link for early discount check: ${e.message}`);
            }
        }
    }

    let responseText = "";
    let generatedLink = null;
    let functionCallsHandled = 0;
    const toolCache = new Map();
    let hasSuccessfulSearch = false;

    while (functionCallsHandled < 6) {
        console.log(`[GEMINI API] Model: gemini-3.6-flash | Purpose: Merchant Tool Loop | Session: ${sessionId} | History: ${activeSessions[sessionId].length}`);
        if (global.metrics) global.metrics.gemini_3_6_flash_calls++;
        let availableTools = toolDeclarations;

        const purchaseIntentConfirmed = checkoutStates[sessionId]?.purchaseIntentConfirmed === true;
        const customerDetailsReceived = checkoutStates[sessionId]?.customerDetailsReceived === true;

        if (buyerType === 'ai') {
            // For AI Buyer, use the atomic finalize_checkout and hide the human-centric two-step checkout
            availableTools = toolDeclarations.filter(t => t.name !== 'initiate_checkout' && t.name !== 'generate_payment_link');
        } else {
            // For Normal Human, use two-step checkout and hide the AI atomic tool
            availableTools = toolDeclarations.filter(t => t.name !== 'finalize_checkout');
            if (!purchaseIntentConfirmed) {
                console.log("[GEMINI ROUTER] Pre-checkout tools enabled");
                if (global.metrics) global.metrics.preCheckoutToolSetCalls = (global.metrics.preCheckoutToolSetCalls || 0) + 1;
                availableTools = availableTools.filter(t => !['generate_payment_link'].includes(t.name));
            } else {
                console.log("[GEMINI ROUTER] Transaction tools enabled");
                if (global.metrics) global.metrics.transactionToolSetCalls = (global.metrics.transactionToolSetCalls || 0) + 1;
                if (!customerDetailsReceived) {
                    availableTools = availableTools.filter(t => t.name !== 'generate_payment_link');
                }
            }
        }

        // Optimize historical tool payloads before sending to Gemini
        const optimizedHistory = activeSessions[sessionId].map(message => {
            if (message.role === 'user' && message.parts) {
                // Deep clone to prevent mutating activeSessions
                const partsCopy = JSON.parse(JSON.stringify(message.parts));
                let optimized = false;

                partsCopy.forEach(part => {
                    const funcRes = part.functionResponse;
                    if (funcRes && funcRes.name === 'search_products' && funcRes.response && Array.isArray(funcRes.response.results)) {
                        funcRes.response.results = funcRes.response.results.map(product => ({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            stock_status: product.availability || product.stock_status || 'unknown'
                        }));
                        optimized = true;
                    }
                });

                if (optimized) {
                    if (global.metrics) global.metrics.historical_payloads_truncated = (global.metrics.historical_payloads_truncated || 0) + 1;
                    console.log("[GEMINI OPTIMIZATION] Truncated historical search_products payload for token savings");
                }

                return { role: message.role, parts: partsCopy };
            }
            return message;
        });

        const finalSystemPrompt = buyerType === 'ai'
            ? SYSTEM_PROMPT + `\n\n**AI-TO-AI INTERNAL CHANNEL (COMPACT MODE):**\nYou are responding to an internal AI Buyer, NOT a human. You MUST respond ONLY with a raw, compact JSON object summarizing your results. Do NOT use natural language filler. Do NOT wrap in markdown code blocks.
Example formats:
{"type": "product_result", "productId": "P101", "price": 75000, "stock": 10}
{"type": "accessories", "items": [{"id": "A101", "price": 5000}]}
{"type": "offer", "originalTotal": 80000, "finalTotal": 77000, "approved": true}
{"type": "checkout", "paymentLink": "https://rzp.io/..."}`
            : SYSTEM_PROMPT;

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: optimizedHistory,
            config: {
                tools: [{ functionDeclarations: availableTools }],
                systemInstruction: { parts: [{ text: finalSystemPrompt }] }
            }
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
            console.log(
                "[GEMINI API] Function calls:",
                JSON.stringify(response.functionCalls, null, 2)
            );
            console.log(`[GEMINI API] Tools called: ${response.functionCalls.length}`);

            let onlyDiscoveryTools = true;
            const discoveryToolNames = ['search_products', 'get_product', 'check_stock', 'recommend_accessories', 'record_context_recommendation'];

            const toolResponses = [];
            for (const call of response.functionCalls) {
                if (global.metrics) global.metrics.tool_calls++;

                if (!discoveryToolNames.includes(call.name)) {
                    onlyDiscoveryTools = false;
                }

                if (call.name === 'search_products' && hasSuccessfulSearch) {
                    console.log("[AURA] Skipping redundant tool call");
                    toolResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { message: "Search already performed in this request. Please use the previous results." }
                        }
                    });
                    continue;
                }

                const cacheKey = `${call.name}:${JSON.stringify(call.args)} `;
                let result;
                if (toolCache.has(cacheKey)) {
                    result = toolCache.get(cacheKey);
                } else {
                    result = await executeTool(call, sessionId);

                    if (result && result.status === 'rejected' && result.reason === 'PAYMENT_ALREADY_COMPLETED') {
                        console.log("[PAYMENT] PAYMENT_ALREADY_COMPLETED intercepted in runMerchantAgent. Terminating loop.");

                        const syntheticModelParts = [{ functionCall: { name: call.name, args: call.args } }];
                        activeSessions[sessionId].push({ role: "model", parts: syntheticModelParts });
                        activeSessions[sessionId].push({ role: "user", parts: [{ functionResponse: { name: call.name, response: result } }] });
                        activeSessions[sessionId].push({ role: "model", parts: [{ text: result.message }] });

                        return { responseText: result.message, paymentLink: null };
                    }

                    toolCache.set(cacheKey, result);

                    if (call.name === 'search_products' && result.results && result.results.length > 0) {
                        hasSuccessfulSearch = true;
                    }
                }

                if (call.name === 'generate_payment_link') {
                    if (result.link) {
                        generatedLink = result.link;
                    }
                    console.log("=== GENERATE PAYMENT LINK TRACE ===");
                    console.log("Tool response:", JSON.stringify(result, null, 2));
                    console.log("Extracted payment URL:", generatedLink);
                }
                toolResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: result
                    }
                });
            }

            const modelParts = response.candidates[0].content.parts;
            activeSessions[sessionId].push({ role: "model", parts: modelParts });
            activeSessions[sessionId].push({ role: "user", parts: toolResponses });

            const lowerMessage = message.toLowerCase();
            const isDiscoveryFastPath = (
                lowerMessage.includes("find me") || lowerMessage.includes("show me") ||
                lowerMessage.includes("looking for") || lowerMessage.includes("recommend") ||
                lowerMessage.includes("best") || lowerMessage.includes("options") ||
                lowerMessage.includes("what") || lowerMessage.includes("i want to see") || lowerMessage.includes("search")
            ) && !(
                lowerMessage.includes("buy") || lowerMessage.includes("purchase") ||
                lowerMessage.includes("checkout") || lowerMessage.includes("order") ||
                lowerMessage.includes("generate payment link") || lowerMessage.includes("stock") || lowerMessage.includes("discount") || lowerMessage.includes("offer")
            );

            // Optimization: If only discovery tools were called and they succeeded, we don't need another expensive 3.6-flash reasoning call
            const shouldSkipReasoning = (isDiscoveryFastPath && hasSuccessfulSearch) || (onlyDiscoveryTools && hasSuccessfulSearch);

            if (shouldSkipReasoning) {
                console.log("[GEMINI OPTIMIZATION] Skipping redundant merchant reasoning call");
                if (global.metrics) global.metrics.skipped_redundant_calls++;
                functionCallsHandled = 3; // Force early loop exit
            } else {
                functionCallsHandled++;
            }
        } else {
            let extractedText = "";
            if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
                const textParts = response.candidates[0].content.parts.filter(p => p.text).map(p => p.text);
                if (textParts.length > 0) extractedText = textParts.join("\n");
            }
            try {
                responseText = extractedText || response.text;
            } catch (e) {
                responseText = extractedText;
            }
            responseText = responseText || "I'm sorry, I couldn't process that. Please try again.";

            // Intercept hallucinated success: if the agent claims to have generated a link but didn't actually generate one
            const lowerText = responseText.toLowerCase();
            const hallucinatedLink =
                lowerText.includes('here is your payment link') ||
                lowerText.includes('here is the payment link') ||
                lowerText.includes('payment link is ready') ||
                lowerText.includes('have generated your payment link') ||
                lowerText.includes('have generated the payment link') ||
                lowerText.includes("'ve generated your payment link") ||
                lowerText.includes("'ve generated the payment link");
            if (hallucinatedLink && !generatedLink) {
                console.log("=== HALLUCINATION INTERCEPTED ===");
                responseText = "I'm sorry, but I encountered an internal error and could not generate the Razorpay link. Please try again or contact support.";
            }
            break;
        }
    }

    if (!responseText && functionCallsHandled >= 6) {
        console.log("[GEMINI API] Model: gemini-3.1-flash-lite | Purpose: Final Discovery Response");
        if (global.metrics) global.metrics.gemini_3_1_flash_lite_calls++;

        const finalResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: activeSessions[sessionId],
            config: {
                tools: [], // Force text output, no tools
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
            }
        });

        let extractedText = "";
        if (finalResponse.candidates && finalResponse.candidates[0] && finalResponse.candidates[0].content && finalResponse.candidates[0].content.parts) {
            const textParts = finalResponse.candidates[0].content.parts.filter(p => p.text).map(p => p.text);
            if (textParts.length > 0) extractedText = textParts.join("\n");
        }

        try {
            responseText = extractedText || finalResponse.text;
        } catch (e) {
            responseText = extractedText;
        }
        responseText = responseText || "I found some information, but encountered an error displaying it.";

        console.log("[AURA] Discovery response returned");
    }

    activeSessions[sessionId].push({ role: "model", parts: [{ text: responseText }] });

    return { responseText, paymentLink: generatedLink };
}

function resetAgentState() {
    for (const key in activeSessions) delete activeSessions[key];
    for (const key in checkoutStates) delete checkoutStates[key];
}

module.exports = {
    runMerchantAgent,
    activeSessions,
    razorpay,
    ai,
    resetAgentState
};
