require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');

const catalogService = require('./services/catalogService');
const policyEngine = require('./services/policyEngine');
const auditService = require('./services/auditService');
const analyticsService = require('./services/analyticsService');
const orderService = require('./services/orderService');
const dbService = require('./services/dbService');

const { runMerchantAgent, razorpay, ai } = require('./agentCore');
const { executeAIBuyerJourney } = require('./aiBuyerOrchestrator');

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// Initialize SQLite DB and sync in-memory stock
dbService.initDb(catalogService.getAllProducts());
dbService.getInventorySync().then(inventory => {
    inventory.forEach(item => {
        catalogService.updateStockInMemory(item.product_id, item.available_quantity);
    });
    console.log("Persistent inventory synchronized.");
}).catch(err => {
    console.error("Failed to sync inventory from DB:", err);
});

// Chat API (Human Customer)
app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body;
    try {
        const { responseText, paymentLink } = await runMerchantAgent({
            sessionId,
            message,
            buyerType: 'human'
        });

        console.log("=== PAYMENT LINK BACKEND DEBUG ===");
        console.log("sessionId:", sessionId);
        console.log("responseText:", responseText);
        console.log("paymentLink:", paymentLink);

        res.json({ reply: responseText, link: paymentLink || null });
    } catch (error) {
        console.error("Chat API Error:", error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// AI Buyer API (Triggers Autonomous Journey)
app.post('/api/ai-buyer', async (req, res) => {
    const { sessionId, intent } = req.body;
    try {
        const transcript = await executeAIBuyerJourney(sessionId, intent);
        res.json({ transcript });
    } catch (error) {
        console.error("AI Buyer API Error:", error);
        res.status(500).json({ error: 'Failed to execute AI Buyer journey' });
    }
});

// Voice Summary API (Non-blocking TTS Generation)
app.post('/api/voice-summary', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });
    try {
        const lowerText = text.toLowerCase();
        // Deterministic fast-paths to save Gemini cost
        if (text.length < 50) {
            return res.json({ voiceReply: text });
        }
        if (lowerText.includes('payment link is ready') || lowerText.includes('has been generated')) {
            return res.json({ voiceReply: "Your payment link is ready. Please open it to complete your purchase." });
        }
        if (lowerText.includes('payment verified') || lowerText.includes('payment successful')) {
            return res.json({ voiceReply: "Your payment has been successfully verified. Thank you for your order!" });
        }
        if (lowerText.includes('payment pending') || lowerText.includes('waiting for payment')) {
            return res.json({ voiceReply: "I'm securely confirming your payment. Please wait a moment." });
        }
        if (lowerText.includes('transaction rejected') || lowerText.includes('policy')) {
            return res.json({ voiceReply: "I'm sorry, but this transaction was not approved based on merchant policies." });
        }

        console.log("[GEMINI API] Model: gemini-3.1-flash-lite | Purpose: Voice Summary");
        if (global.metrics) global.metrics.gemini_3_1_flash_lite_calls++;
        const summaryResp = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: `You are Aura, a premium AI shopping concierge.

Your job is to convert the customer's detailed on-screen commerce response into a VERY SHORT spoken response.

STRICT OUTPUT RULES:
- Output ONLY 1 or 2 natural spoken sentences.
- Target approximately 20-35 words.
- NEVER read the entire screen.
- NEVER say "check the details on screen".
- NEVER say "your request has been processed" without explaining what was requested.
- Always mention the MAIN product when a product is present.
- Mention the price when available.
- Mention ONE important feature when available.
- Mention availability when relevant.
- If the customer needs to provide information, clearly tell them what is needed.
- If a Razorpay payment link has actually been generated, say that the payment link is ready. NEVER read the URL.
- If payment has NOT actually been generated, NEVER claim that a payment link is ready.
- Ignore product IDs, markdown, URLs, technical information, audit information and long lists.
- If accessories are present, ignore them unless they are the main subject.
- Sound like a warm, confident human shopping concierge.

Examples:

Input:
"Aura Pro Headphones are available for ₹4,499. Wireless active noise cancellation and 30-hour battery life. In stock."

Output:
"The Aura Pro Headphones are ₹4,499, with active noise cancellation and 30-hour battery life. They're currently in stock."

Input:
"Please provide your full name and email address to generate your payment link."

Output:
"You're all set to purchase the Aura Pro Headphones. Please provide your name and email so I can generate the payment link."

Input:
"Payment link has been generated for the Aura Pro Headphones at ₹4,499."

Output:
"Your Aura Pro Headphones order is ₹4,499, and your payment link is ready. Open it to complete your payment."

IMPORTANT MULTILINGUAL RULE:
Detect the language of the input. Respond in the SAME language, but always use Latin/English characters for that language. For example, Hindi should be Hinglish and Kannada should be Kanglish. Do not translate another language into English.

TEXT TO SUMMARIZE:
${text}`
        });
        res.json({ voiceReply: summaryResp.text || text });
    } catch (error) {
        console.error("Voice summary error:", error);
        res.status(500).json({ error: 'Failed to generate voice summary' });
    }
});

// Agent-readable APIs
app.get('/api/agent/catalog', (req, res) => {
    res.json({
        merchant: catalogService.getMerchantInfo(),
        products: catalogService.getAllProducts()
    });
});

app.post('/api/agent/commerce', (req, res) => {
    // Prototype AI-to-AI endpoint
    const { intent, category, budget } = req.body;
    let products = catalogService.getAllProducts();
    if (category) {
        products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    if (budget) {
        products = products.filter(p => p.price <= budget);
    }
    auditService.logEvent('AI_BUYER_REQUEST', 'External AI', `Intent: ${intent}`, 'SUCCESS');
    res.json({
        merchant: catalogService.getMerchantInfo(),
        products: products.map(p => ({ id: p.id, name: p.name, price: p.price, availability: p.availability }))
    });
});

// Admin Product Management APIs
app.get('/api/admin/products', async (req, res) => {
    try {
        const products = await dbService.getAllInventory();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

app.post('/api/admin/products', async (req, res) => {
    try {
        const { id, name, price, stock, ...rest } = req.body;
        if (!id || !name || price === undefined || stock === undefined) {
            return res.status(400).json({ error: "Missing required fields (id, name, price, stock)" });
        }
        if (price < 0) return res.status(400).json({ error: "Price cannot be negative" });
        if (stock < 0) return res.status(400).json({ error: "Stock cannot be negative" });

        const newProduct = await dbService.addProduct({ id, name, price, stock });
        
        // Build product object for memory sync (preserving extra fields if any were passed initially)
        catalogService.addProductToMemory({ id, name, price, stock, ...rest });
        
        auditService.logEvent('PRODUCT_CREATED', 'Admin', `Product ${id} created.`, 'SUCCESS');
        res.status(201).json(newProduct);
    } catch (err) {
        if (err.message.includes('Duplicate product ID')) {
            return res.status(400).json({ error: err.message });
        }
        console.error(err);
        res.status(500).json({ error: "Failed to create product" });
    }
});

app.put('/api/admin/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, price, stock } = req.body;
        
        if (price !== undefined && price < 0) return res.status(400).json({ error: "Price cannot be negative" });
        if (stock !== undefined && stock < 0) return res.status(400).json({ error: "Stock cannot be negative" });

        const updated = await dbService.updateProduct(productId, { name, price, stock });
        if (!updated) return res.status(404).json({ error: "Product not found or no valid updates provided" });

        catalogService.updateProductInMemory(productId, { name, price, stock });
        
        auditService.logEvent('PRODUCT_UPDATED', 'Admin', `Product ${productId} updated.`, 'SUCCESS');
        res.json({ success: true, message: "Product updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update product" });
    }
});

app.delete('/api/admin/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const deleted = await dbService.deleteProduct(productId);
        if (!deleted) return res.status(404).json({ error: "Product not found" });

        catalogService.removeProductFromMemory(productId);
        
        auditService.logEvent('PRODUCT_DELETED', 'Admin', `Product ${productId} soft-deleted.`, 'SUCCESS');
        res.json({ success: true, message: "Product deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete product" });
    }
});

// Dashboard APIs
app.get('/api/dashboard/audit', (req, res) => {
    res.json(auditService.getRecentLogs(50));
});

app.get('/api/dashboard/sales', async (req, res) => {
    try {
        const data = await dbService.getSalesDashboardData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch sales data" });
    }
});

app.get('/api/dashboard/metrics', (req, res) => {
    res.json(analyticsService.getMetrics());
});

app.get('/api/dashboard/approvals', (req, res) => {
    res.json(policyEngine.getPendingApprovals());
});

app.get('/api/dashboard/policies', (req, res) => {
    res.json(policyEngine.getPolicies());
});

app.post('/api/dashboard/approvals/process', async (req, res) => {
    const { transactionId, action } = req.body;

    if (!transactionId) {
        return res.status(400).json({ error: "transactionId is required" });
    }

    const processAction = action === 'reject' ? 'reject' : 'approve';
    const result = policyEngine.processApproval(transactionId, processAction);

    if (!result.success) {
        return res.status(400).json({ error: result.reason });
    }

    if (processAction === 'reject') {
        auditService.logEvent('TRANSACTION_REJECTED', 'Merchant Console', `Transaction ${transactionId} rejected manually.`, 'SUCCESS');
        return res.json({ success: true, message: "Transaction rejected." });
    }

    // If approved, create Razorpay link with revalidated data
    try {
        let descriptionParts = [];
        let upsellAmount = 0;

        for (const item of result.items) {
            const product = catalogService.getProductById(item.id);
            const qty = item.quantity || 1;
            descriptionParts.push(`${qty}x ${product.name}`);
            if (product.category === 'Accessories') {
                upsellAmount += (item.agreed_price * qty);
            }
        }

        const description = `Purchase: ${descriptionParts.join(', ')}`;

        const paymentLinkRequest = {
            amount: result.totalAmount * 100, // in paise
            currency: "INR",
            accept_partial: false,
            description: description.substring(0, 200),
            customer: {
                name: result.customer || "Customer",
                email: "customer@example.com"
            },
            notify: { sms: false, email: false },
            reminder_enable: false
        };

        const paymentLink = await razorpay.paymentLink.create(paymentLinkRequest);

        orderService.createOrder({
            sessionId: result.sessionId,
            transactionId: transactionId,
            items: result.items,
            totalAmount: result.totalAmount,
            customerName: result.customer || "Customer",
            customerEmail: "customer@example.com",
            paymentLinkId: paymentLink.id,
            shortUrl: paymentLink.short_url
        });

        auditService.logEvent('PAYMENT_LINK_GENERATED', 'Merchant Console', `Generated link for ₹${result.totalAmount} after approval`, 'SUCCESS', { link_id: paymentLink.id, transactionId });

        policyEngine.updateTransactionStatus(transactionId, 'payment_link_generated');

        return res.json({
            success: true,
            status: 'payment_link_generated',
            link: paymentLink.short_url,
            payment_id: paymentLink.id
        });
    } catch (error) {
        console.error("Razorpay Error:", error);
        return res.status(500).json({ error: "Failed to generate payment link after approval." });
    }
});

// Chat status endpoint to discover manually approved payment links
app.get('/api/chat/status', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
    }

    const order = orderService.getLatestOrderBySessionId(sessionId);
    if (!order || !order.paymentLinkId) {
        return res.json({ status: "pending_approval" });
    }

    return res.json({
        status: "payment_link_ready",
        paymentUrl: order.shortUrl,
        orderId: order.id,
        paymentLinkId: order.paymentLinkId
    });
});

// Order tracking endpoint for verified UI
app.get('/api/order/status', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url is required" });

    const order = orderService.getOrderByUrl(url);
    if (!order) {
        return res.status(404).json({ error: "Order not found for this payment link" });
    }

    // Skip hitting Razorpay if we already reached a terminal state in memory
    if (order.status === 'PAID' || order.status === 'FAILED') {
        return res.json({ 
            order,
            paymentVerified: order.paymentVerified || false,
            ebill: order.ebill || null
        });
    }

    try {
        // Fetch the live status directly from Razorpay
        const plink = await razorpay.paymentLink.fetch(order.paymentLinkId);

        if (plink.status === 'paid') {
            const paymentLinkMatches = plink.id === order.paymentLinkId;
            const amountMatches = plink.amount === order.totalAmount * 100;
            
            if (!paymentLinkMatches || !amountMatches) {
                auditService.logEvent('PAYMENT_VERIFICATION_FAILED', 'System', `Failed to verify payment for Order ${order.id}. LinkMatch: ${paymentLinkMatches}, AmountMatch: ${amountMatches}, ExpectedAmount: ${order.totalAmount * 100}, ActualAmount: ${plink.amount}`, 'FAILED');
                return res.json({ order, paymentVerified: false });
            }

            const verifiedPayment = plink.payments && plink.payments.length > 0 ? plink.payments[0] : null;
            orderService.updateOrder(order.id, {
                status: 'PAID',
                paymentVerified: true,
                verifiedPaymentId: verifiedPayment ? verifiedPayment.payment_id : null,
                verifiedPaymentMethod: verifiedPayment ? verifiedPayment.method : 'UPI',
                verifiedTimestamp: new Date().toISOString()
            });
            auditService.logEvent('PAYMENT_VERIFIED', 'Razorpay Webhook/Poll', `Verified payment for Order ${order.id}`, 'SUCCESS', { amount: order.totalAmount });
            
            const updatedOrderForDb = orderService.getOrderByUrl(url);
            try {
                await dbService.recordSale(updatedOrderForDb, updatedOrderForDb.items);
                console.log(`[DB] Successfully recorded sale and updated inventory for order ${updatedOrderForDb.id}`);
                // Sync in-memory catalog for AI agents immediately
                let upsellAmount = 0;
                updatedOrderForDb.items.forEach(item => {
                    const product = catalogService.getProductById(item.id);
                    if (product) {
                        catalogService.updateStockInMemory(item.id, product.stock - item.quantity);
                        if (product.category === 'Accessories') {
                            upsellAmount += (item.agreed_price * (item.quantity || 1));
                        }
                    }
                });
                
                // Record analytics transaction ONLY on verified successful payment
                analyticsService.recordTransaction(true, updatedOrderForDb.totalAmount, true, upsellAmount);
            } catch (err) {
                // If err is a SQLite constraint error, it means we already processed this sale (idempotency caught it)
                if (err.code === 'SQLITE_CONSTRAINT') {
                    console.log(`[DB] Idempotency check: Sale for order ${updatedOrderForDb.id} already recorded.`);
                } else {
                    console.error(`[DB] Failed to record sale for order ${updatedOrderForDb.id}:`, err.message);
                }
            }

            // Generate E-Bill Idempotently
            const updatedOrder = orderService.getOrderByUrl(url);
            if (!updatedOrder.ebill) {
                const ebill = {
                    billId: `EBILL-${Date.now()}-${updatedOrder.id}`,
                    orderId: updatedOrder.id,
                    items: updatedOrder.items,
                    amount: updatedOrder.totalAmount,
                    currency: "INR",
                    customerName: updatedOrder.customer.name,
                    customerEmail: updatedOrder.customer.email,
                    paymentStatus: "PAID",
                    paymentId: updatedOrder.verifiedPaymentId,
                    paymentLinkId: updatedOrder.paymentLinkId,
                    verifiedAt: updatedOrder.verifiedTimestamp
                };
                orderService.updateOrder(order.id, { ebill });
                auditService.logEvent('EBILL_GENERATED', 'System', `Generated E-Bill ${ebill.billId} for Order ${order.id}`, 'SUCCESS');
            }

        } else if (plink.status === 'cancelled') {
            orderService.updateOrder(order.id, {
                status: 'FAILED',
                failureReason: 'Payment link cancelled.'
            });
            auditService.logEvent('PAYMENT_FAILED', 'Razorpay Webhook/Poll', `Payment link cancelled for Order ${order.id}`, 'FAILED');
        } else if (plink.status === 'expired') {
            orderService.updateOrder(order.id, {
                status: 'FAILED',
                failureReason: 'Payment link expired.'
            });
        }

        const currentOrderState = orderService.getOrderByUrl(url);

        // If still pending, check for a failed individual payment attempt without failing the overall order
        if (currentOrderState.status === 'PENDING_PAYMENT' && plink.payments && plink.payments.length > 0) {
            // Sort to get the most recent payment attempt
            const sortedPayments = [...plink.payments].sort((a, b) => b.created_at - a.created_at);
            const latestPayment = sortedPayments[0];

            if (latestPayment.status === 'failed') {
                return res.json({
                    order: {
                        ...currentOrderState,
                        paymentAttemptFailed: true,
                        failureReason: latestPayment.error_description || 'Payment attempt was declined by the bank or payment method.'
                    },
                    paymentVerified: false
                });
            }
        }

        return res.json({ 
            order: currentOrderState,
            paymentVerified: currentOrderState.paymentVerified || false,
            ebill: currentOrderState.ebill || null
        });

    } catch (error) {
        console.error("Error fetching payment link status:", error);
        return res.status(500).json({ error: "Failed to verify payment status." });
    }
});

app.post('/api/admin/reset', (req, res) => {
    try {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(require('path').join(__dirname, 'aura.db'));
        const catalog = require('./catalog.json');
        
        db.serialize(() => {
            db.run('DELETE FROM sales');
            db.run('DELETE FROM inventory');
            
            const stmt = db.prepare('INSERT INTO inventory (product_id, product_name, price, available_quantity, sold_quantity, is_active) VALUES (?, ?, ?, ?, 0, 1)');
            catalog.products.forEach(p => {
                stmt.run(p.id, p.name, p.price, 10);
            });
            stmt.finalize();
        });

        catalogService.resetCatalogStock();
        analyticsService.resetMetrics();
        orderService.resetOrders();
        auditService.resetAudit();
        policyEngine.resetPolicies();
        require('./agentCore').resetAgentState();

        auditService.logEvent('DEMO_RESET', 'Admin', 'Reset all dashboard demo data successfully.', 'SUCCESS');
        res.json({ success: true, message: "Dashboard reset successfully" });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
