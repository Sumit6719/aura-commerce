let metrics = {
    totalRevenue: 0,
    aiAttributedRevenue: 0,
    upsellRevenue: 0,
    transactions: 0,
    blockedTransactions: 0,
    recommendationsMade: 0,
    conversations: 0
};

function recordTransaction(isSuccessful, amount, isAiAttributed = true, upsellAmount = 0) {
    if (isSuccessful) {
        metrics.totalRevenue += amount;
        metrics.transactions += 1;
        if (isAiAttributed) metrics.aiAttributedRevenue += amount;
        if (upsellAmount > 0) metrics.upsellRevenue += upsellAmount;
    } else {
        metrics.blockedTransactions += 1;
    }
}

function recordConversation() {
    metrics.conversations += 1;
}

function recordRecommendation() {
    metrics.recommendationsMade += 1;
}

function getMetrics() {
    const avgOrderValue = metrics.transactions > 0 ? (metrics.totalRevenue / metrics.transactions) : 0;
    const conversionRate = metrics.conversations > 0 ? ((metrics.transactions / metrics.conversations) * 100).toFixed(1) : 0;
    return {
        ...metrics,
        averageOrderValue: Math.round(avgOrderValue),
        conversionRate: parseFloat(conversionRate)
    };
}
function resetMetrics() {
    metrics = {
        totalRevenue: 0,
        aiAttributedRevenue: 0,
        upsellRevenue: 0,
        transactions: 0,
        blockedTransactions: 0,
        recommendationsMade: 0,
        conversations: 0
    };
}

module.exports = {
    recordTransaction,
    recordConversation,
    recordRecommendation,
    getMetrics,
    resetMetrics
};
