import { Router } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import * as paymentService from '../paymentService.js';
import * as billingUtils from '../billingUtils.js';
import logger from '../logger.js';

const router = Router();

// Get billing status for user
router.get('/api/billing/status', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);

    // Get user's pinned files total size
    const pinnedFiles = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total_pinned_size
      FROM files
      WHERE user_id = ? AND is_pinned = 1 AND is_deleted = 0
    `).get(user.id);

    const pinnedSizeBytes = pinnedFiles?.total_pinned_size || 0;
    const pinnedSizeGB = billingUtils.bytesToGB(pinnedSizeBytes);
    const freeTierGB = billingUtils.getFreeTierGB();
    const costPerGB = billingUtils.getCostPerGB();
    const monthlyCostUSD = billingUtils.calculateMonthlyPinCost(pinnedSizeBytes);
    const exceedsLimit = billingUtils.exceedsFreeTierLimit(pinnedSizeBytes);
    const chargeAmountINR = billingUtils.calculateChargeAmount(pinnedSizeBytes);

    // Get billing info
    let billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE user_id = ?').get(user.id));
    if (!billingInfo) {
      // Create billing info record
      const billingId = uuidv4();
      db.prepare(`
        INSERT INTO billing_info (id, user_id)
        VALUES (?, ?)
      `).run(billingId, user.id);
      billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE id = ?').get(billingId));
    }

    // Get subscription
    let subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id));
    if (!subscription) {
      // Create subscription with billing day from account creation
      const billingDay = billingUtils.getBillingDay(user.created_at);
      const subId = uuidv4();
      const nextBilling = billingUtils.getNextBillingDate(billingDay);
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, billing_day, next_billing_at)
        VALUES (?, ?, ?, ?)
      `).run(subId, user.id, billingDay, nextBilling.toISOString());
      subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId));
    }

    const isBillingDay = billingUtils.isBillingDay(subscription.billing_day);

    // If we previously blocked services but it's no longer the billing day, unblock
    if (billingInfo.services_blocked === 1 && !isBillingDay) {
      db.prepare(`
        UPDATE billing_info
        SET services_blocked = 0,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(user.id);
      billingInfo.services_blocked = 0;
    }

    const servicesBlocked = billingInfo.services_blocked === 1 && isBillingDay;
    const paymentInfoReceived = billingInfo.payment_method_added === 1;

    res.json({
      pinnedSizeBytes,
      pinnedSizeGB: parseFloat(pinnedSizeGB.toFixed(2)),
      freeTierGB,
      costPerGB,
      monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
      exceedsLimit,
      chargeAmountINR: parseFloat(chargeAmountINR.toFixed(2)),
      freeTierLimitUSD: billingUtils.getFreeTierLimitUSD(), // Legacy support
      servicesBlocked,
      paymentInfoReceived,
      billingDay: subscription.billing_day,
      nextBillingDate: subscription.next_billing_at,
      billingPeriod: billingUtils.getBillingPeriod(subscription.billing_day)
    });
  } catch (error) {
    logger.error({ err: error }, 'Billing status error');
    res.status(500).json({ error: 'Failed to get billing status', message: error.message });
  }
});

// Check if services should be blocked (called before file operations)
router.get('/api/billing/check-access', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);

    // Get user's pinned files total size
    const pinnedFiles = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total_pinned_size
      FROM files
      WHERE user_id = ? AND is_pinned = 1 AND is_deleted = 0
    `).get(user.id);

    const pinnedSizeBytes = pinnedFiles?.total_pinned_size || 0;
    const exceedsLimit = billingUtils.exceedsFreeTierLimit(pinnedSizeBytes);
    const monthlyCostUSD = billingUtils.calculateMonthlyPinCost(pinnedSizeBytes);
    const chargeAmountINR = billingUtils.calculateChargeAmount(pinnedSizeBytes);

    if (!exceedsLimit) {
      return res.json({
        allowed: true,
        reason: null
      });
    }

    // Check billing info
    let billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE user_id = ?').get(user.id));
    if (!billingInfo) {
      const billingId = uuidv4();
      db.prepare(`
        INSERT INTO billing_info (id, user_id)
        VALUES (?, ?)
      `).run(billingId, user.id);
      billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE id = ?').get(billingId));
    }

    // Get subscription (needed for billing day checks)
    let subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id));
    if (!subscription) {
      const billingDay = billingUtils.getBillingDay(user.created_at);
      const subId = uuidv4();
      const nextBilling = billingUtils.getNextBillingDate(billingDay);
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, billing_day, next_billing_at)
        VALUES (?, ?, ?, ?)
      `).run(subId, user.id, billingDay, nextBilling.toISOString());
      subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId));
    }

    const paymentInfoReceived = billingInfo.payment_method_added === 1;
    const isBillingDay = billingUtils.isBillingDay(subscription.billing_day);

    // If we exceeded the free tier but it's not billing day yet, show a warning and allow access
    if (!paymentInfoReceived && !isBillingDay) {
      if (billingInfo.services_blocked === 1) {
        db.prepare(`
          UPDATE billing_info
          SET services_blocked = 0,
              updated_at = datetime('now')
          WHERE user_id = ?
        `).run(user.id);
      }

      return res.json({
        allowed: true,
        reason: 'FREE_TIER_EXCEEDED',
        monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
        chargeAmountINR: parseFloat(chargeAmountINR.toFixed(2)),
        freeTierLimitUSD: billingUtils.getFreeTierLimitUSD(),
        paymentInfoReceived,
        billingDay: subscription.billing_day,
        nextBillingDate: subscription.next_billing_at
      });
    }

    // If payment info already exists, allow access even on billing day
    if (paymentInfoReceived) {
      return res.json({
        allowed: true,
        reason: null,
        monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
        chargeAmountINR: parseFloat(chargeAmountINR.toFixed(2)),
        freeTierLimitUSD: billingUtils.getFreeTierLimitUSD(),
        paymentInfoReceived,
        billingDay: subscription.billing_day,
        nextBillingDate: subscription.next_billing_at
      });
    }

    // Billing day without payment info: block and require payment
    if (billingInfo.services_blocked === 0) {
      db.prepare(`
        UPDATE billing_info
        SET services_blocked = 1,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(user.id);
    }

    res.json({
      allowed: false,
      reason: 'BILLING_DAY_PAYMENT_REQUIRED',
      monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
      chargeAmountINR: parseFloat(chargeAmountINR.toFixed(2)),
      freeTierLimitUSD: billingUtils.getFreeTierLimitUSD(),
      paymentInfoReceived,
      billingDay: subscription.billing_day,
      nextBillingDate: subscription.next_billing_at
    });
  } catch (error) {
    logger.error({ err: error }, 'Check access error');
    res.status(500).json({ error: 'Failed to check access', message: error.message });
  }
});

router.post('/api/billing/test-billing', verifyAuth, async (req, res) => {
  try {
    // Only in dev/sandbox to avoid accidental charges
    if (process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION' && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Test endpoint not available in production' });
    }

    const { userId, simulateDate } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = rowToObject(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's pinned files total size
    const pinnedFiles = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total_pinned_size
      FROM files
      WHERE user_id = ? AND is_pinned = 1 AND is_deleted = 0
    `).get(user.id);

    const pinnedSizeBytes = pinnedFiles?.total_pinned_size || 0;
    const monthlyCostUSD = billingUtils.calculateMonthlyPinCost(pinnedSizeBytes);
    const chargeAmountINR = billingUtils.calculateChargeAmount(pinnedSizeBytes);

    if (chargeAmountINR <= 0) {
      return res.json({
        message: 'No chargeable amount. User is within free tier limit.',
        monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
        chargeAmountINR: 0,
        freeTierLimitUSD: billingUtils.getFreeTierLimitUSD()
      });
    }

    // Get or create subscription
    let subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id));
    if (!subscription) {
      const billingDay = billingUtils.getBillingDay(user.created_at);
      const subId = uuidv4();
      const nextBilling = billingUtils.getNextBillingDate(billingDay);
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, billing_day, next_billing_at)
        VALUES (?, ?, ?, ?)
      `).run(subId, user.id, billingDay, nextBilling.toISOString());
      subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId));
    }

    const billingPeriod = billingUtils.getBillingPeriod(subscription.billing_day);

    // Create payment order
    const customerDetails = {
      customer_id: user.id,
      customer_email: user.email,
      customer_phone: "9999999999",
      customer_name: user.display_name || user.email
    };

    const result = await paymentService.createOrder(
      user.id,
      chargeAmountINR,
      "INR",
      customerDetails,
      {
        returnUrl: `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/payment/callback?order_id={order_id}`,
        notifyUrl: `${process.env.BACKEND_URL || 'https://api-walt.aayushman.dev'}/api/payment/webhook`
      }
    );

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to create payment order', message: result.error });
    }

    // Save order to database
    const orderId = uuidv4();
    db.prepare(`
      INSERT INTO orders (
        id, user_id, cashfree_order_id, order_amount, order_currency,
        order_status, payment_session_id, payment_link,
        billing_period_start, billing_period_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      user.id,
      result.cashfreeOrderId,
      chargeAmountINR,
      "INR",
      "PENDING",
      result.paymentSessionId,
      result.paymentLink,
      billingPeriod.start,
      billingPeriod.end
    );

    res.json({
      success: true,
      message: 'Test billing order created successfully',
      orderId,
      cashfreeOrderId: result.cashfreeOrderId,
      paymentLink: result.paymentLink,
      amount: chargeAmountINR,
      currency: "INR",
      monthlyCostUSD: parseFloat(monthlyCostUSD.toFixed(2)),
      chargeAmountINR: parseFloat(chargeAmountINR.toFixed(2)),
      freeTierLimitUSD: billingUtils.getFreeTierLimitUSD(),
      billingPeriod
    });
  } catch (error) {
    logger.error({ err: error }, 'Test billing error');
    res.status(500).json({ error: 'Failed to create test billing order', message: error.message });
  }
});

export default router;
