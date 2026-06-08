/**
 * Billing status, payment-modal gating, and the dismissable free-tier warning
 * banner (with a 14-day per-user snooze). Extracted verbatim from
 * pages/dashboard.tsx — same backend calls, same localStorage keys, same gating.
 */

import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { checkAccess, getBillingStatus, BillingStatus } from '../../../lib/billingClient';
import { BILLING_WARNING_SNOOZE_MS, isTodayBillingDay } from '../utils';

interface UseBillingParams {
  user: User | null;
}

export function useBilling({ user }: UseBillingParams) {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingWarning, setShowBillingWarning] = useState(false);

  const getBillingWarningStorageKey = () => {
    return user ? `billing_warning_dismissed_until_${user.uid}` : null;
  };

  const dismissBillingWarning = () => {
    const key = getBillingWarningStorageKey();
    if (!key) return;
    const snoozeUntil = Date.now() + BILLING_WARNING_SNOOZE_MS;
    localStorage.setItem(key, snoozeUntil.toString());
    setShowBillingWarning(false);
  };

  // Load billing status
  const loadBillingStatus = useCallback(async () => {
    const status = await getBillingStatus();
    if (!status) {
      setShowBillingWarning(false);
      return;
    }

    setBillingStatus(status);

    const billingDayToday = isTodayBillingDay(status.billingDay);
    // Only force payment if user exceeds limit AND doesn't have payment info AND (it's billing day OR services are blocked)
    const shouldForcePayment = status.exceedsLimit && !status.paymentInfoReceived && (billingDayToday || status.servicesBlocked);

    if (shouldForcePayment) {
      setShowPaymentModal(true);
      setShowBillingWarning(false);
      return;
    }

    // Get billing warning dismissed until inside callback
    const getBillingWarningDismissedUntil = (): number | null => {
      if (typeof window === 'undefined') return null;
      const key = user ? `billing_warning_dismissed_until_${user.uid}` : null;
      if (!key) return null;
      const raw = localStorage.getItem(key);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };

    const dismissedUntil = getBillingWarningDismissedUntil();
    const now = Date.now();
    const shouldShowWarning = status.exceedsLimit && !billingDayToday && (!dismissedUntil || now >= dismissedUntil);
    setShowBillingWarning(shouldShowWarning);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setShowBillingWarning(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadBillingStatus();
    }
  }, [user, loadBillingStatus]);

  const checkBillingAccess = async (): Promise<boolean> => {
    const access = await checkAccess();
    if (!access) {
      return true; // If check fails, allow access (fail open)
    }
    await loadBillingStatus(); // Keep sidebar/modal limits in sync with backend

    if (!access.allowed) {
      // Show payment modal
      setShowPaymentModal(true);
      return false;
    }

    return true;
  };

  const shouldShowBillingCTA = () => {
    if (!billingStatus) return false;

    // Only show Pay Now button if:
    // 1. User exceeds the free tier limit
    // 2. There's an actual amount to pay
    // 3. Payment info hasn't been received yet
    // 4. It's billing day OR services are blocked
    const hasAmountToPay = billingStatus.chargeAmountINR > 0 || billingStatus.exceedsLimit;
    const needsPayment = !billingStatus.paymentInfoReceived && hasAmountToPay;
    const isBillingDay = isTodayBillingDay(billingStatus.billingDay);

    return needsPayment && (isBillingDay || billingStatus.servicesBlocked);
  };

  return {
    billingStatus,
    showPaymentModal,
    setShowPaymentModal,
    showBillingWarning,
    dismissBillingWarning,
    loadBillingStatus,
    checkBillingAccess,
    shouldShowBillingCTA,
  };
}
