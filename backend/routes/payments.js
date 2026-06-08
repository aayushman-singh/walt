import { Router } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import * as paymentService from '../paymentService.js';
import * as billingUtils from '../billingUtils.js';
import logger from '../logger.js';

const router = Router();

router.post('/api/payment/create-order', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);

    // Get user's pinned files total size
    const pinnedFiles = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total_pinned_size
      FROM files
      WHERE user_id = ? AND is_pinned = 1 AND is_deleted = 0
    `).get(user.id);

    const pinnedSizeBytes = pinnedFiles?.total_pinned_size || 0;
    const chargeAmountINR = billingUtils.calculateChargeAmount(pinnedSizeBytes);

    if (chargeAmountINR <= 0) {
      return res.status(400).json({ error: 'No chargeable amount. You are within the free tier limit.' });
    }

    // Get subscription for billing period
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

    // Create order with Cashfree
    const customerDetails = {
      customer_id: user.id,
      customer_email: user.email,
      customer_phone: req.body.phone || "9999999999",
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

    // Hosted checkout links are deprecated for prod; rely on session-based checkout
    const paymentLink = result.paymentLink || null;

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
      paymentLink,
      billingPeriod.start,
      billingPeriod.end
    );

    res.json({
      success: true,
      orderId, // internal UUID
      cashfreeOrderId: result.cashfreeOrderId,
      paymentSessionId: result.paymentSessionId,
      paymentLink,
      amount: chargeAmountINR,
      currency: "INR"
    });
  } catch (error) {
    logger.error({ err: error }, 'Create order error');
    res.status(500).json({ error: 'Failed to create order', message: error.message });
  }
});

router.get('/api/payment/order/:orderId', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { orderId } = req.params;

    // Get order from database
    let order = rowToObject(db.prepare(`
      SELECT * FROM orders WHERE id = ? AND user_id = ?
    `).get(orderId, user.id));

    // Fallback: allow lookup by Cashfree order ID (used by return_url/callback)
    if (!order) {
      order = rowToObject(db.prepare(`
        SELECT * FROM orders WHERE cashfree_order_id = ? AND user_id = ?
      `).get(orderId, user.id));
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch latest status from Cashfree
    if (order.cashfree_order_id) {
      const cashfreeResult = await paymentService.fetchOrder(order.cashfree_order_id);
      if (cashfreeResult.success) {
        // Update order status
        const orderStatus = cashfreeResult.data?.order_status || order.order_status;
        db.prepare(`
          UPDATE orders SET order_status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(orderStatus, order.id);

        // If payment successful, update billing info
        if (orderStatus === 'PAID') {
          // Mark payment info as received and unblock services
          let billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE user_id = ?').get(user.id));
          if (!billingInfo) {
            const billingId = uuidv4();
            db.prepare(`INSERT INTO billing_info (id, user_id) VALUES (?, ?)`).run(billingId, user.id);
            billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE id = ?').get(billingId));
          }

          db.prepare(`
            UPDATE billing_info
            SET payment_method_added = 1,
                payment_info_received_at = datetime('now'),
                services_blocked = 0,
                updated_at = datetime('now')
            WHERE user_id = ?
          `).run(user.id);

          // Update subscription next billing date
          const subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id));
          if (subscription) {
            const nextBilling = billingUtils.getNextBillingDate(subscription.billing_day);
            db.prepare(`
              UPDATE subscriptions
              SET next_billing_at = ?, updated_at = datetime('now')
              WHERE user_id = ?
            `).run(nextBilling.toISOString(), user.id);
          }
        }
      }
    }

    const updatedOrder = rowToObject(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id));
    res.json(updatedOrder);
  } catch (error) {
    logger.error({ err: error }, 'Get order error');
    res.status(500).json({ error: 'Failed to get order', message: error.message });
  }
});

router.post('/api/payment/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const rawBody = req.body;

    if (!signature || !timestamp) {
      return res.status(400).json({ error: 'Missing webhook signature or timestamp' });
    }
    const verification = paymentService.verifyWebhookSignature(signature, rawBody, timestamp);
    if (!verification.success) {
      return res.status(401).json({ error: 'Invalid webhook signature', message: verification.error });
    }

    const webhookData = JSON.parse(rawBody.toString());
    const { orderId, orderStatus, paymentStatus } = webhookData;

    // Find order by Cashfree order ID
    const order = rowToObject(db.prepare('SELECT * FROM orders WHERE cashfree_order_id = ?').get(orderId));
    if (!order) {
      logger.warn({ orderId }, 'Order not found for webhook');
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order status
    db.prepare(`
      UPDATE orders SET order_status = ?, updated_at = datetime('now')
      WHERE cashfree_order_id = ?
    `).run(orderStatus, orderId);

    // If payment successful, update billing info
    if (orderStatus === 'PAID' && paymentStatus === 'SUCCESS') {
      const user = rowToObject(db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id));
      if (user) {
        // Mark payment info as received and unblock services
        let billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE user_id = ?').get(user.id));
        if (!billingInfo) {
          const billingId = uuidv4();
          db.prepare(`INSERT INTO billing_info (id, user_id) VALUES (?, ?)`).run(billingId, user.id);
          billingInfo = rowToObject(db.prepare('SELECT * FROM billing_info WHERE id = ?').get(billingId));
        }

        db.prepare(`
          UPDATE billing_info
          SET payment_method_added = 1,
              payment_info_received_at = datetime('now'),
              services_blocked = 0,
              updated_at = datetime('now')
          WHERE user_id = ?
        `).run(user.id);

        // Update subscription next billing date
        const subscription = rowToObject(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id));
        if (subscription) {
          const nextBilling = billingUtils.getNextBillingDate(subscription.billing_day);
          db.prepare(`
            UPDATE subscriptions
            SET next_billing_at = ?, updated_at = datetime('now')
            WHERE user_id = ?
          `).run(nextBilling.toISOString(), user.id);
        }
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    logger.error({ err: error }, 'Webhook error');
    res.status(500).json({ error: 'Webhook processing failed', message: error.message });
  }
});

export default router;
