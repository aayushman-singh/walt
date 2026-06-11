import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { getAuth } from 'firebase/auth';
import WIcon from '../../components/WIcon';
import styles from '../../styles/PaymentCallback.module.css';

const PaymentCallback: NextPage = () => {
  const router = useRouter();
  const { order_id } = router.query;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing payment...');

  useEffect(() => {
    if (!order_id || typeof order_id !== 'string') {
      setStatus('error');
      setMessage('Invalid order ID');
      return;
    }

    const checkPaymentStatus = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          setStatus('error');
          setMessage('Please log in to view payment status');
          return;
        }

        const token = await user.getIdToken();
        
        // Extract order ID from Cashfree format (order_xxx)
        const orderId = order_id;
        
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://api-walt.aayushman.dev'}/api/payment/order/${orderId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to check payment status');
        }

        const order = await response.json();

        if (order.order_status === 'PAID') {
          setStatus('success');
          setMessage('Payment successful! Your services have been activated.');
          
          // Redirect to dashboard after 3 seconds
          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
        } else if (order.order_status === 'FAILED' || order.order_status === 'CANCELLED') {
          setStatus('error');
          setMessage('Payment failed or was cancelled. Please try again.');
        } else {
          setStatus('loading');
          setMessage('Payment is being processed...');
          
          // Poll again after 2 seconds
          setTimeout(checkPaymentStatus, 2000);
        }
      } catch (error: any) {
        console.error('Payment status check error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to verify payment status');
      }
    };

    checkPaymentStatus();
  }, [order_id, router]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {status === 'loading' && (
          <>
            <div className={styles.spinner}></div>
            <h1>Processing Payment</h1>
            <p>{message}</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className={styles.successIcon}>
              <WIcon name="check" size={18} />
            </div>
            <h1>Payment Successful!</h1>
            <p>{message}</p>
            <p className={styles.redirect}>Redirecting to dashboard...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className={styles.errorIcon}>
              <WIcon name="close" size={18} />
            </div>
            <h1>Payment Error</h1>
            <p>{message}</p>
            <button 
              className={styles.button}
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;

