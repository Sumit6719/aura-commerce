const crypto = require('crypto');

// In-memory store for prototype
const orders = [];
let orderCounter = 1000;

function generateOrderId() {
    orderCounter++;
    return `AURA-2026-${orderCounter}`;
}

function createOrder(orderData) {
    const order = {
        id: generateOrderId(),
        sessionId: orderData.sessionId || null,
        transactionId: orderData.transactionId || null,
        items: orderData.items || [],
        totalAmount: orderData.totalAmount || 0, // In INR
        customer: {
            name: orderData.customerName || 'Customer',
            email: orderData.customerEmail || 'customer@example.com'
        },
        paymentLinkId: orderData.paymentLinkId, // plink_xxx
        shortUrl: orderData.shortUrl, // https://rzp.io/i/xxx
        status: 'PENDING_PAYMENT', // PENDING_PAYMENT, PAID, FAILED, SUPERSEDED, CANCELLED
        verifiedPaymentId: null,
        verifiedPaymentMethod: null,
        verifiedTimestamp: null,
        failureReason: null,
        paymentVerified: false,
        ebill: null,
        createdAt: new Date().toISOString()
    };
    
    orders.push(order);
    return order;
}

function getOrderByUrl(shortUrl) {
    return orders.find(o => o.shortUrl === shortUrl);
}

function getOrderByPaymentLinkId(paymentLinkId) {
    return orders.find(o => o.paymentLinkId === paymentLinkId);
}

function getActiveOrderBySessionId(sessionId) {
    if (!sessionId) return null;
    // Find the most recent active order for this session
    const sessionOrders = orders.filter(o => o.sessionId === sessionId && o.status === 'PENDING_PAYMENT');
    // Sort descending by ID or createdAt to get the newest (since IDs are sequential)
    return sessionOrders.sort((a, b) => b.id.localeCompare(a.id))[0] || null;
}

function getLatestOrderBySessionId(sessionId) {
    if (!sessionId) return null;
    // Find the most recent order for this session regardless of status
    const sessionOrders = orders.filter(o => o.sessionId === sessionId);
    return sessionOrders.sort((a, b) => b.id.localeCompare(a.id))[0] || null;
}

function updateOrder(orderId, updateData) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
        Object.assign(order, updateData);
        return order;
    }
    return null;
}

module.exports = {
    createOrder,
    getOrderByUrl,
    getOrderByPaymentLinkId,
    getActiveOrderBySessionId,
    getLatestOrderBySessionId,
    updateOrder
};
