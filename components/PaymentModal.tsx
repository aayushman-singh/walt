import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { WIcon } from './WIcon';
import styles from '../styles/PaymentModal.module.css';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthlyCostUSD: number;
  chargeAmountINR: number;
  freeTierLimitUSD: number; // Legacy
  pinnedSizeGB?: number;
  freeTierGB?: number;
  costPerGB?: number;
  billingPeriod?: {
    start: string;
    end: string;
  };
  nextBillingDate?: string;
  billingCycleDays?: number;
  onPaymentSuccess?: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  monthlyCostUSD,
  chargeAmountINR,
  freeTierLimitUSD,
  pinnedSizeGB,
  freeTierGB,
  costPerGB,
  billingPeriod,
  nextBillingDate,
  billingCycleDays = 30,
  onPaymentSuccess
}) => {
  const [phone, setPhone] = useState('');
  const [billingAddress, setBillingAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatBillingPeriod = () => {
    if (!billingPeriod?.start || !billingPeriod?.end) return null;
    const start = formatDate(billingPeriod.start);
    const end = formatDate(billingPeriod.end);
    if (!start || !end) return null;
    return `${start} - ${end}`;
  };

  const billingCycleLabel = billingCycleDays === 30 ? 'Monthly' : `${billingCycleDays}-Day Cycle`;
  const billingPeriodLabel = formatBillingPeriod();
  const nextBillingLabel = formatDate(nextBillingDate);

  useEffect(() => {
    if (isOpen) {
      setPhone('');
      setBillingAddress({
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      });
      setError(null);
      setPaymentLink(null);
      setPaymentSessionId(null);
      setOrderId(null);
    }
  }, [isOpen]);

  const cashfreeEnv = (process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT || process.env.CASHFREE_ENVIRONMENT || '').toUpperCase() === 'PRODUCTION'
    ? 'PRODUCTION'
    : 'SANDBOX';

  const loadCashfree = async (): Promise<any | null> => {
    if (typeof window === 'undefined') return null;
    
    // Check if SDK v3 is loaded (window.Cashfree is a function)
    const existing = (window as any).Cashfree;
    if (existing) {
      console.log('[Cashfree] SDK v3 already loaded');
      return existing;
    }
    
    // Load SDK v3
    const src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    console.log('[Cashfree] Loading SDK v3 from:', src);
    
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        const checkLoaded = setInterval(() => {
          if ((window as any).Cashfree) {
            clearInterval(checkLoaded);
            console.log('[Cashfree] SDK v3 loaded from existing script');
            resolve((window as any).Cashfree);
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkLoaded);
          if ((window as any).Cashfree) {
            resolve((window as any).Cashfree);
          } else {
            reject(new Error('Cashfree SDK v3 script exists but failed to load'));
          }
        }, 5000);
        return;
      }
      
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        setTimeout(() => {
          const cf = (window as any).Cashfree;
          if (cf) {
            console.log('[Cashfree] SDK v3 loaded successfully');
            resolve(cf);
          } else {
            console.error('[Cashfree] SDK v3 script loaded but Cashfree object not found');
            reject(new Error('Cashfree object not found after script load'));
          }
        }, 100);
      };
      script.onerror = () => {
        console.error('[Cashfree] Failed to load SDK v3 script');
        reject(new Error('Failed to load Cashfree SDK v3'));
      };
      document.head.appendChild(script);
    });
  };

  const startCheckout = async (sessionId: string, paymentLinkUrl?: string) => {
    try {
      console.log('[Cashfree] Starting checkout with session:', sessionId);
      console.log('[Cashfree] Payment link from backend:', paymentLinkUrl);
      
      // Load Cashfree SDK v3
      const Cashfree = await loadCashfree();
      
      if (!Cashfree || typeof Cashfree !== 'function') {
        throw new Error('Cashfree SDK v3 not available');
      }

      console.log('[Cashfree] SDK v3 loaded, type:', typeof Cashfree);
      
      // Initialize Cashfree SDK v3
      const mode = cashfreeEnv === 'PRODUCTION' ? 'production' : 'sandbox';
      console.log('[Cashfree] Initializing SDK v3 with mode:', mode);
      
      const cashfree = Cashfree({ mode });
      
      console.log('[Cashfree] Opening checkout with session ID:', sessionId);
      
      // Open checkout using SDK v3 method
      cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget: '_modal' // Options: '_self', '_blank', '_modal'
      });
      
      console.log('[Cashfree] Checkout opened successfully');
      
    } catch (error: any) {
      console.error('[Cashfree] Checkout error:', error);
      setError(`Unable to open payment page: ${error.message || 'Please try again.'}`);
    }
  };

  const handleCreateOrder = async () => {
    if (!phone || phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!billingAddress.line1 || !billingAddress.city || !billingAddress.state || !billingAddress.postalCode || !billingAddress.country) {
      setError('Please enter your full billing address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        setError('Please log in to continue');
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://api-walt.aayushman.dev'}/api/payment/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone, billingAddress })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment order');
      }

      if (data.orderId) setOrderId(data.orderId);
      if (data.paymentSessionId) setPaymentSessionId(data.paymentSessionId);
      if (data.paymentLink) setPaymentLink(data.paymentLink);

      // Prefer session-based checkout; if missing, surface error
      if (data.paymentSessionId) {
        startCheckout(data.paymentSessionId, data.paymentLink);
      } else {
        setError('Payment session not received');
      }

      if (data.orderId) {
        pollPaymentStatus(data.orderId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create payment order');
    } finally {
      setLoading(false);
    }
  };

  const pollPaymentStatus = async (orderId: string) => {
    const maxAttempts = 60; // Poll for up to 5 minutes (5 second intervals)
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const token = await user.getIdToken();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://api-walt.aayushman.dev'}/api/payment/order/${orderId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.ok) return;

        const order = await response.json();
        
        if (order.order_status === 'PAID') {
          // Payment successful
          if (onPaymentSuccess) {
            onPaymentSuccess();
          }
          onClose();
          return;
        }

        attempts++;
        if (attempts < maxAttempts && order.order_status === 'PENDING') {
          setTimeout(checkStatus, 5000); // Check again in 5 seconds
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
      }
    };

    setTimeout(checkStatus, 5000); // Start checking after 5 seconds
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Payment Required</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close"><WIcon name="close" size={18} /></button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.warning}>
            {pinnedSizeGB && freeTierGB ? (
              <>
                <p><WIcon name="warning" size={16} /> Your storage usage ({pinnedSizeGB.toFixed(2)} GB) exceeds the free tier limit ({freeTierGB} GB).</p>
                <p>To continue using our services, please add payment information.</p>
              </>
            ) : (
              <>
            <p><WIcon name="warning" size={16} /> Your estimated pin cost (${monthlyCostUSD.toFixed(2)}/month) exceeds the free tier limit of ${freeTierLimitUSD.toFixed(2)}/month.</p>
            <p>To continue using our services, please add payment information.</p>
              </>
            )}
          </div>

          <div className={styles.billingInfo}>
            {pinnedSizeGB && freeTierGB && costPerGB ? (
              <>
                <div className={styles.infoRow}>
                  <span>Your Storage:</span>
                  <span className={styles.amount}>{pinnedSizeGB.toFixed(2)} GB</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Free Tier:</span>
                  <span>{freeTierGB} GB</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Overage:</span>
                  <span>{(pinnedSizeGB - freeTierGB).toFixed(2)} GB × ${costPerGB}/GB</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Monthly Cost:</span>
                  <span className={styles.amount}>${monthlyCostUSD.toFixed(2)}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Amount to Pay:</span>
                  <span className={styles.chargeAmount}>₹{chargeAmountINR.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
            <div className={styles.infoRow}>
              <span>Monthly Cost:</span>
              <span className={styles.amount}>${monthlyCostUSD.toFixed(2)}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Free Tier:</span>
              <span>${freeTierLimitUSD.toFixed(2)}/month</span>
            </div>
            <div className={styles.infoRow}>
              <span>Amount to Pay:</span>
              <span className={styles.chargeAmount}>₹{chargeAmountINR.toFixed(2)}</span>
            </div>
              </>
            )}
            <div className={styles.infoRow}>
              <span>Billing Cycle:</span>
              <span>{billingCycleLabel}</span>
            </div>
            {billingPeriodLabel && (
              <div className={styles.infoRow}>
                <span>Current Period:</span>
                <span>{billingPeriodLabel}</span>
              </div>
            )}
            {nextBillingLabel && (
              <div className={styles.infoRow}>
                <span>Next Billing:</span>
                <span>{nextBillingLabel}</span>
              </div>
            )}
            <div className={styles.note}>
              {freeTierGB ? (
                <small>You will only be charged for storage above {freeTierGB} GB. Charges are calculated on a monthly cycle.</small>
              ) : (
              <small>You will only be charged for the amount over ${freeTierLimitUSD.toFixed(2)}. Charges are calculated on a monthly cycle.</small>
              )}
            </div>
          </div>

          {!paymentLink ? (
            <div className={styles.form}>
              <label htmlFor="phone">Phone Number (required for payment)</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
                disabled={loading}
              />

              <label>Billing Address</label>
              <div className={styles.addressGrid}>
                <input
                  id="address-line1"
                  type="text"
                  value={billingAddress.line1}
                  onChange={(e) => setBillingAddress({ ...billingAddress, line1: e.target.value })}
                  placeholder="Address line 1"
                  disabled={loading}
                  aria-label="Address line 1"
                />
                <input
                  id="address-line2"
                  type="text"
                  value={billingAddress.line2}
                  onChange={(e) => setBillingAddress({ ...billingAddress, line2: e.target.value })}
                  placeholder="Address line 2 (optional)"
                  disabled={loading}
                  aria-label="Address line 2"
                />
                <input
                  id="address-city"
                  type="text"
                  value={billingAddress.city}
                  onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                  placeholder="City"
                  disabled={loading}
                  aria-label="City"
                />
                <input
                  id="address-state"
                  type="text"
                  value={billingAddress.state}
                  onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                  placeholder="State / Province"
                  disabled={loading}
                  aria-label="State or Province"
                />
                <input
                  id="address-postal"
                  type="text"
                  value={billingAddress.postalCode}
                  onChange={(e) => setBillingAddress({ ...billingAddress, postalCode: e.target.value })}
                  placeholder="Postal code"
                  disabled={loading}
                  aria-label="Postal code"
                />
                <input
                  id="address-country"
                  type="text"
                  value={billingAddress.country}
                  onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })}
                  placeholder="Country"
                  disabled={loading}
                  aria-label="Country"
                />
              </div>
              
              {error && <div className={styles.error}>{error}</div>}
              
              <button
                className={styles.payButton}
                onClick={handleCreateOrder}
                disabled={loading || !phone}
              >
                {loading ? 'Processing...' : 'Proceed to Payment'}
              </button>
            </div>
          ) : (
            <div className={styles.paymentLink}>
              <p>Payment window opened. If it didn&apos;t open, click the link below:</p>
              <a href={paymentLink} target="_blank" rel="noopener noreferrer" className={styles.linkButton}>
                Open Payment Page
              </a>
              <p className={styles.waiting}>Waiting for payment confirmation...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
