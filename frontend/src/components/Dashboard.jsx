import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

export default function Dashboard() {
    const [metrics, setMetrics] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [approvals, setApprovals] = useState([]);
    const [policies, setPolicies] = useState(null);
    const [approvalMessage, setApprovalMessage] = useState(null);
    const [salesData, setSalesData] = useState(null);

    const fetchData = async () => {
        try {
            const [mRes, aRes, apRes, pRes, sRes] = await Promise.all([
                fetch(`${API_URL}/api/dashboard/metrics`),
                fetch(`${API_URL}/api/dashboard/audit`),
                fetch(`${API_URL}/api/dashboard/approvals`),
                fetch(`${API_URL}/api/dashboard/policies`),
                fetch(`${API_URL}/api/dashboard/sales`)
            ]);
            setMetrics(await mRes.json());
            setAuditLogs(await aRes.json());
            setApprovals(await apRes.json());
            setPolicies(await pRes.json());
            setSalesData(await sRes.json());
        } catch (e) {
            console.error("Dashboard error", e);
        }
    };

    const handleProcessApproval = async (transactionId, action) => {
        try {
            setApprovalMessage(null);
            const response = await fetch(`${API_URL}/api/dashboard/approvals/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId, action })
            });
            const result = await response.json();
            if (result.success) {
                if (action === 'approve') {
                    setApprovalMessage({
                        type: 'success',
                        text: '✓ Transaction approved successfully. Payment link generated.',
                        link: result.link
                    });
                } else {
                    setApprovalMessage({
                        type: 'success',
                        text: '✓ Transaction rejected.',
                        link: null
                    });
                }
                fetchData();
            } else {
                setApprovalMessage({
                    type: 'error',
                    text: '✕ Approval failed: ' + (result.error || result.reason),
                    link: null
                });
            }
        } catch (e) {
            console.error("Error processing approval", e);
            setApprovalMessage({
                type: 'error',
                text: '✕ Approval failed: An error occurred connecting to server.',
                link: null
            });
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    if (!metrics || !policies) return <div className="dashboard-loading">Loading Dashboard...</div>;

    const autonomousLimit = policies.AUTONOMOUS_TRANSACTION_LIMIT || 10000;

    return (
        <div className="dashboard-container">
            <div className="dashboard-header-premium">
                <h2 className="dash-title">AURA <span className="subtitle">THE AUTONOMOUS AI MERCHANT</span></h2>
                <div className="dash-status"><span className="status-dot"></span> ONLINE</div>
            </div>

            <div className="dashboard-grid">
                {/* Left Column */}
                <div className="dashboard-col-left">
                    <section className="dash-section">
                        <h3 className="section-title">AURA TRUST CENTER</h3>
                        <div className="trust-center-card">
                            <div className="trust-header">
                                <span>Autonomous Transaction Limit</span>
                                <strong>₹{autonomousLimit.toLocaleString()}</strong>
                            </div>
                            <div className="trust-visualizer">
                                <span className="label">Conservative</span>
                                <div className="slider-track">
                                    <div className="slider-fill" style={{ width: '40%' }}></div>
                                    <div className="slider-thumb" style={{ left: '40%' }}></div>
                                </div>
                                <span className="label">Autonomous</span>
                            </div>
                            <p className="trust-desc">Aura independently completes transactions within this authority. Amounts exceeding this require your approval.</p>
                        </div>
                    </section>

                    <section className="dash-section">
                        <h3 className="section-title">PENDING APPROVALS</h3>
                        {approvalMessage && (
                            <div className={`approval-message ${approvalMessage.type}`}>
                                <p>{approvalMessage.text}</p>
                                {approvalMessage.link && (
                                    <button className="btn-payment-link" onClick={() => window.open(approvalMessage.link, "_blank", "noopener,noreferrer")}>
                                        Open Payment Link
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="approvals-list">
                            {approvals.length === 0 ? <p className="text-muted">No pending approvals.</p> : approvals.map(app => (
                                <div key={app.id} className="approval-card premium-approval">
                                    <div className="approval-header-row">
                                        <div className="approval-info">
                                            <span className="customer-name">{app.customer || 'Customer'}</span>
                                            <p className="approval-amount">₹{app.amount}</p>
                                        </div>
                                        <span className="badge pending">PENDING</span>
                                    </div>
                                    <div className="trust-checks">
                                        <div className="check-item passed"><span>✓</span> Product verified</div>
                                        <div className="check-item passed"><span>✓</span> Stock verified</div>
                                        <div className="check-item passed"><span>✓</span> Purchase allowed</div>
                                        <div className="check-item passed"><span>✓</span> Price policy valid</div>
                                        <div className="check-item failed"><span>✕</span> Autonomous authority exceeded</div>
                                    </div>
                                    <div className="approval-reason-box">
                                        <strong>Reason:</strong> Transaction amount ₹{app.amount} exceeds Aura's ₹{autonomousLimit} limit.
                                    </div>
                                    <div className="approval-actions">
                                        <button className="btn-approve" onClick={() => handleProcessApproval(app.id, 'approve')}>✓ APPROVE</button>
                                        <button className="btn-reject" onClick={() => handleProcessApproval(app.id, 'reject')}>✕ REJECT</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="dash-section">
                        <h3 className="section-title">SALES & INVENTORY TRACKER</h3>
                        {salesData && (
                            <div className="trust-center-card" style={{ marginBottom: '20px' }}>
                                <div className="trust-header">
                                    <span>Total Products Sold</span>
                                    <strong>{salesData.totalUnitsSold}</strong>
                                </div>
                                <div className="trust-header" style={{ marginTop: '5px' }}>
                                    <span>Total Revenue</span>
                                    <strong>₹{salesData.totalRevenue ? salesData.totalRevenue.toLocaleString() : '0'}</strong>
                                </div>
                                <div className="approvals-list" style={{ marginTop: '15px' }}>
                                    {salesData.productWise.map(prod => (
                                        <div key={prod.productId} className="approval-card premium-approval" style={{ padding: '12px' }}>
                                            <div className="approval-header-row" style={{ marginBottom: '5px' }}>
                                                <div className="approval-info">
                                                    <span className="customer-name">{prod.productName}</span>
                                                    <p className="approval-amount" style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.7)' }}>ID: {prod.productId}</p>
                                                </div>
                                                <span className={`badge ${prod.currentStock > 0 ? 'passed' : 'failed'}`}>
                                                    {prod.currentStock > 0 ? `Stock: ${prod.currentStock}` : 'OUT OF STOCK'}
                                                </span>
                                            </div>
                                            <div className="trust-checks" style={{ marginTop: '5px' }}>
                                                <div className="check-item passed">
                                                    Sold: <strong>{prod.quantitySold}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="dash-section">
                        <h3 className="section-title">AI INTELLIGENCE</h3>
                        <div className="metrics-grid">
                            <div className="metric-card">
                                <h4>Total Revenue</h4>
                                <p>₹{metrics.totalRevenue.toLocaleString()}</p>
                            </div>
                            <div className="metric-card highlight">
                                <h4>AI Attributed</h4>
                                <p>₹{metrics.aiAttributedRevenue.toLocaleString()}</p>
                            </div>
                            <div className="metric-card">
                                <h4>Upsell Revenue</h4>
                                <p>₹{metrics.upsellRevenue.toLocaleString()}</p>
                            </div>
                            <div className="metric-card">
                                <h4>Conv. Rate</h4>
                                <p>{metrics.conversionRate}%</p>
                            </div>
                        </div>
                        {metrics.upsellRevenue > 0 && (
                            <div className="ai-insight-card">
                                <h4>✨ AI Insight</h4>
                                <p>Aura successfully generated <strong>₹{metrics.upsellRevenue.toLocaleString()}</strong> in additional revenue through intelligent accessory cross-selling.</p>
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Column */}
                <div className="dashboard-col-right">
                    <section className="dash-section fill-height">
                        <h3 className="section-title">AURA ACTIVITY (LIVE)</h3>
                        <div className="live-activity-feed">
                            {auditLogs.slice(0, 15).map(log => (
                                <div key={log.id} className="activity-step">
                                    <div className="step-icon">
                                        {log.status === 'SUCCESS' ? '✓' : (log.status === 'FAILED' ? '✕' : '•')}
                                    </div>
                                    <div className="step-content">
                                        <div className="step-actor">{log.actor === 'External AI' ? '🤖 AI Buyer' : log.actor}</div>
                                        <div className="step-action">{log.action.replace(/_/g, ' ')}</div>
                                        <div className="step-desc">{log.description}</div>
                                        <div className="step-time">{new Date(log.timestamp).toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
