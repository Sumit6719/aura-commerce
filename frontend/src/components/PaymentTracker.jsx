import React, { useState, useEffect } from 'react';
import { voiceService } from '../utils/voiceService';

export default function PaymentTracker({ url }) {
    const [orderState, setOrderState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastSpokenState, setLastSpokenState] = useState(null);

    useEffect(() => {
        let isMounted = true;
        
        const fetchStatus = async () => {
            try {
                const response = await fetch(`http://localhost:3005/api/order/status?url=${encodeURIComponent(url)}`);
                if (!isMounted) return;
                
                const data = await response.json();
                
                if (data.order) {
                    setOrderState({ 
                        ...data.order, 
                        paymentVerified: data.paymentVerified, 
                        ebill: data.ebill 
                    });
                    setLoading(false);
                    
                    if (data.order.status === 'PAID' || data.order.status === 'FAILED') {
                        if (isMounted) handleTerminalStateVoice(data.order);
                        return true; // terminal state reached
                    } else if (data.order.status === 'PENDING_PAYMENT' && data.order.paymentAttemptFailed) {
                        if (isMounted) handleTerminalStateVoice(data.order);
                        // Do NOT return true; we want to keep polling so they can retry
                    }
                }
            } catch (err) {
                console.error("Failed to fetch order status:", err);
            }
            return false;
        };

        const handleTerminalStateVoice = (order) => {
            const currentState = order.status === 'PAID' ? 'PAID' : (order.status === 'FAILED' ? 'FAILED' : 'ATTEMPT_FAILED');
            if (lastSpokenState === currentState) return;

            if (order.status === 'PAID') {
                voiceService.speak("Payment successful. Your order is confirmed, and your invoice is ready.");
                setLastSpokenState('PAID');
            } else if (order.status === 'FAILED') {
                voiceService.speak("The payment wasn't completed, so the order hasn't been confirmed.");
                setLastSpokenState('FAILED');
            } else if (order.status === 'PENDING_PAYMENT' && order.paymentAttemptFailed) {
                voiceService.speak("Your payment wasn't completed. You can retry the payment.");
                setLastSpokenState('ATTEMPT_FAILED');
            }
        };

        // Initial fetch
        fetchStatus().then((isTerminal) => {
            if (!isTerminal && isMounted) {
                // Poll every 3 seconds if not terminal
                const interval = setInterval(async () => {
                    const terminal = await fetchStatus();
                    if (terminal) clearInterval(interval);
                }, 3000);
                
                return () => clearInterval(interval);
            }
        });

        return () => { isMounted = false; };
    }, [url, lastSpokenState]);

    const handlePrint = () => {
        window.print();
    };

    if (loading || !orderState) {
        return (
            <div className="payment-tracker pending">
                <div className="spinner"></div>
                <p>Waiting for payment confirmation...</p>
            </div>
        );
    }

    if (orderState.status === 'PENDING_PAYMENT') {
        if (orderState.paymentAttemptFailed) {
            return (
                <div className="payment-tracker failed">
                    <h4>✕ PAYMENT NOT COMPLETED</h4>
                    <p>Your payment could not be completed.</p>
                    <p>The payment attempt was declined by your bank or payment method.</p>
                    {orderState.failureReason && (
                        <div className="failure-reason">
                            <strong>Reason:</strong> {orderState.failureReason}
                        </div>
                    )}
                    <p className="no-confirm">Your order has NOT been charged.</p>
                    <button className="btn-retry" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                        ↻ RETRY PAYMENT
                    </button>
                </div>
            );
        }
        
        return (
            <div className="payment-tracker pending">
                <div className="spinner"></div>
                <p>Your payment was submitted successfully. I'm securely confirming it with Razorpay. Please wait a moment.</p>
                <button className="btn-payment-link" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                    OPEN PAYMENT LINK
                </button>
            </div>
        );
    }

    if (orderState.status === 'FAILED') {
        return (
            <div className="payment-tracker failed premium-fail">
                <div className="fail-header">
                    <h4>PAYMENT NOT COMPLETED</h4>
                    <p>Your payment could not be completed.</p>
                </div>
                
                <div className="fail-details">
                    <div className="fail-row">
                        <span className="label">Reason:</span>
                        <span className="val">{orderState.failureReason || 'Declined by bank or gateway'}</span>
                    </div>
                    <div className="fail-row">
                        <span className="label">Order Status:</span>
                        <span className="val status-red">Not confirmed</span>
                    </div>
                </div>

                <button className="btn-retry" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                    RETRY PAYMENT
                </button>
            </div>
        );
    }

    // Success State
    if (orderState.status === 'PAID' && orderState.paymentVerified && orderState.ebill) {
        return (
        <div className="payment-tracker success">
            <div className="success-header">
                <div className="success-icon">✓</div>
                <h4>PAYMENT RECEIVED SUCCESSFULLY</h4>
                <p>Your order is confirmed, {orderState.customer?.name || 'Customer'}.</p>
            </div>
            
            <div className="invoice-actions no-print">
                <button className="btn-print" onClick={handlePrint}>PRINT / SAVE PDF</button>
            </div>

            {/* Premium Invoice specifically for printing / display */}
            <div className="premium-invoice-container">
                <div className="premium-invoice">
                    <div className="invoice-header">
                        <div className="brand">
                            <h2>AURA</h2>
                            <p>AUTONOMOUS COMMERCE</p>
                        </div>
                    </div>
                    
                    <div className="invoice-info-split">
                        <div className="info-col">
                            <h4>TAX INVOICE</h4>
                            <div className="info-row">
                                <span className="label">BILL NUMBER</span>
                                <span className="val">{orderState.ebill.billId}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">ORDER ID</span>
                                <span className="val">{orderState.ebill.orderId}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">VERIFIED AT</span>
                                <span className="val">{new Date(orderState.ebill.verifiedAt).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="info-col right">
                            <div className="info-row">
                                <span className="label">PAYMENT STATUS</span>
                                <span className="val verified-green">VERIFIED PAID</span>
                            </div>
                            <div className="info-row">
                                <span className="label">PAYMENT ID</span>
                                <span className="val">{orderState.ebill.paymentId}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">PAYMENT METHOD</span>
                                <span className="val">{orderState.verifiedPaymentMethod || 'Not provided'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="invoice-parties">
                        <div className="party billed-to">
                            <h4>BILLED TO</h4>
                            <p>{orderState.customer?.name || 'Not provided'}</p>
                            <p>{orderState.customer?.email || 'Not provided'}</p>
                        </div>
                        <div className="party merchant-info">
                            <h4>MERCHANT</h4>
                            <p>Aura Pro Electronics</p>
                            <p>Address: Not provided</p>
                        </div>
                    </div>

                    <div className="invoice-order">
                        <table className="order-table">
                            <thead>
                                <tr>
                                    <th>ITEM</th>
                                    <th>QTY</th>
                                    <th>UNIT PRICE</th>
                                    <th>AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderState.items.map((item, i) => (
                                    <tr key={i}>
                                        <td>{item.name}</td>
                                        <td>1</td>
                                        <td>₹{item.agreed_price.toLocaleString()}</td>
                                        <td>₹{item.agreed_price.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="invoice-totals">
                        <div className="totals-row">
                            <span>Subtotal</span>
                            <span>₹{orderState.totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="totals-row">
                            <span>Discount</span>
                            <span>₹0</span>
                        </div>
                        <div className="totals-row">
                            <span>Tax</span>
                            <span>₹0</span>
                        </div>
                        <div className="totals-row grand-total">
                            <span>TOTAL</span>
                            <span>₹{orderState.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="invoice-footer">
                        <div className="confirmation-block">
                            <div className="confirm-item">
                                <span className="check">✓</span>
                                <div className="text">
                                    <strong>PAYMENT SUCCESSFULLY RECEIVED</strong>
                                    <p>Your payment has been verified successfully.</p>
                                </div>
                            </div>
                            <div className="confirm-item">
                                <span className="check">✓</span>
                                <div className="text">
                                    <strong>ORDER CONFIRMED</strong>
                                    <p>Thank you for shopping with Aura Commerce.</p>
                                </div>
                            </div>
                        </div>
                        <div className="bottom-meta">
                            <p className="rzp-verify">Payment verified through Razorpay</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        );
    }
    
    // If it claims to be PAID but hasn't passed verification
    return (
        <div className="payment-tracker pending">
            <div className="spinner"></div>
            <p>Your payment was submitted successfully. I'm securely confirming it with Razorpay. Please wait a moment.</p>
        </div>
    );
}
