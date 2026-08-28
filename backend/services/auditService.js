let auditLogs = [];

function logEvent(action, actor, description, status = 'SUCCESS', data = {}) {
    const entry = {
        id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        action,
        actor,
        description,
        status,
        ...data
    };
    auditLogs.unshift(entry); // Prepend so newest is first
    console.log(`[AUDIT] ${action}: ${description} (${status})`);
    return entry;
}

function getRecentLogs(limit = 20) {
    return auditLogs.slice(0, limit);
}

module.exports = {
    logEvent,
    getRecentLogs
};
