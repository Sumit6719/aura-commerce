const catalogService = require('./catalogService');

const POLICIES = {
    AUTONOMOUS_TRANSACTION_LIMIT: 10000,
    NEGOTIATION_ENABLED: true,
    UPSELL_ENABLED: true
};

function validateOffer(productId, proposedPrice) {
    if (!POLICIES.NEGOTIATION_ENABLED) {
        return { valid: false, reason: "Negotiation is currently disabled by merchant." };
    }

    const product = catalogService.getProductById(productId);
    if (!product) {
        return { valid: false, reason: "Product not found." };
    }
    
    if (product.availability !== 'in_stock' || product.stock <= 0) {
        return { valid: false, reason: "Product is out of stock." };
    }

    if (!product.purchase_allowed) {
        return { valid: false, reason: "Product is not allowed for purchase." };
    }

    if (proposedPrice < product.minimum_price) {
        return { 
            valid: false, 
            reason: `Proposed price ₹${proposedPrice} is below the allowed minimum of ₹${product.minimum_price}.` 
        };
    }

    return { valid: true };
}

function validateCartOffer(items, proposedTotal) {
    if (!POLICIES.NEGOTIATION_ENABLED) {
        return { valid: false, reason: "Negotiation is currently disabled by merchant." };
    }

    let totalMinimumAllowed = 0;

    for (const item of items) {
        const product = catalogService.getProductById(item.id);
        if (!product) {
            return { valid: false, reason: `Product ${item.id} not found.` };
        }
        
        if (product.availability !== 'in_stock' || product.stock <= 0) {
            return { valid: false, reason: `Product ${product.name} is out of stock.` };
        }

        if (!product.purchase_allowed) {
            return { valid: false, reason: `Product ${product.name} is not allowed for purchase.` };
        }
        
        const qty = item.quantity || 1;
        totalMinimumAllowed += (product.minimum_price * qty);
    }

    if (proposedTotal < totalMinimumAllowed) {
        return { 
            valid: false, 
            reason: `Proposed total ₹${proposedTotal} is below the allowed bundle minimum of ₹${totalMinimumAllowed}.` 
        };
    }

    return { valid: true };
}

function evaluateTransaction(totalAmount, lineItems) {
    // 1. Check stock for all items
    for (const item of lineItems) {
        const product = catalogService.getProductById(item.id);
        if (!product || product.availability !== 'in_stock' || product.stock <= 0) {
            return { allowed: false, reason: `Product ${product ? product.name : item.id} is out of stock.` };
        }
    }

    // 2. Check limits
    if (totalAmount <= POLICIES.AUTONOMOUS_TRANSACTION_LIMIT) {
        return { allowed: true, status: 'approved' };
    } else {
        return { 
            allowed: false, 
            status: 'pending_approval', 
            reason: `Transaction amount ₹${totalAmount} exceeds the autonomous limit of ₹${POLICIES.AUTONOMOUS_TRANSACTION_LIMIT}. Manual approval required.` 
        };
    }
}

function getPolicies() {
    return POLICIES;
}

const pendingApprovalsStore = [];

function addPendingApproval(transaction) {
    transaction.status = 'pending';
    pendingApprovalsStore.push(transaction);
}

function getPendingApprovals() {
    return pendingApprovalsStore.filter(t => t.status === 'pending');
}

function getTransaction(transactionId) {
    return pendingApprovalsStore.find(t => t.id === transactionId);
}

function getTransactionBySessionId(sessionId) {
    // Return the most recent one for a given session
    return pendingApprovalsStore.slice().reverse().find(t => t.sessionId === sessionId);
}

function processApproval(transactionId, action) {
    const transaction = getTransaction(transactionId);
    if (!transaction) {
        return { success: false, reason: "Transaction not found." };
    }
    
    if (transaction.status !== 'pending') {
        return { success: false, reason: `Transaction is already ${transaction.status}.` };
    }

    if (action === 'reject') {
        transaction.status = 'rejected';
        return { success: true, status: 'rejected' };
    }

    if (action === 'approve') {
        let revalidatedTotalAmount = 0;

        for (const item of transaction.items) {
            const product = catalogService.getProductById(item.id);
            if (!product) {
                return { success: false, reason: `Product ${item.id} not found.` };
            }
            if (product.availability !== 'in_stock' || product.stock <= 0) {
                return { success: false, reason: `Product ${product.name} is out of stock.` };
            }
            if (!product.purchase_allowed) {
                return { success: false, reason: `Product ${product.name} is not allowed for purchase.` };
            }
            const qty = item.quantity || 1;
            if (item.agreed_price < product.minimum_price) {
                return { success: false, reason: `Agreed price for ${product.name} is below minimum allowed.` };
            }
            revalidatedTotalAmount += (item.agreed_price * qty);
        }
        
        transaction.status = 'approved_for_payment';
        return { 
            success: true, 
            status: 'approved_for_payment', 
            totalAmount: revalidatedTotalAmount, 
            items: transaction.items, 
            customer: transaction.customer,
            sessionId: transaction.sessionId
        };
    }
    
    return { success: false, reason: "Invalid action." };
}

function updateTransactionStatus(transactionId, newStatus) {
    const transaction = getTransaction(transactionId);
    if (transaction) {
        transaction.status = newStatus;
        return true;
    }
    return false;
}

function resetPolicies() {
    pendingApprovalsStore.length = 0;
}

module.exports = {
    validateOffer,
    validateCartOffer,
    evaluateTransaction,
    getPolicies,
    addPendingApproval,
    getPendingApprovals,
    getTransaction,
    getTransactionBySessionId,
    processApproval,
    updateTransactionStatus,
    resetPolicies
};
