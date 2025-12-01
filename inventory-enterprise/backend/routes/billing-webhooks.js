/**
 * Stripe Webhook Handler
 * NeuroPilot AI Enterprise Phase 2
 *
 * Handles Stripe webhook events:
 * - Subscription lifecycle
 * - Invoice events
 * - Payment events
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');

// Lazy-load pool
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = require('../db/postgres').pool;
  }
  return pool;
};

// Stripe client (lazy-loaded)
let stripe = null;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// ============================================
// POST /webhooks/stripe
// Handle all Stripe webhook events
// ============================================
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    const pool = getPool();

    // Log event
    try {
      await pool.query(
        `INSERT INTO billing_events (stripe_event_id, event_type, api_version, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (stripe_event_id) DO NOTHING`,
        [event.id, event.type, event.api_version, event]
      );
    } catch (err) {
      logger.error('Failed to log billing event:', err);
    }

    // Handle specific events
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.paid':
          await handleInvoicePaid(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        case 'customer.created':
        case 'customer.updated':
          await handleCustomerUpdate(event.data.object);
          break;

        default:
          logger.debug(`Unhandled Stripe event: ${event.type}`);
      }

      // Mark event as processed
      await pool.query(
        `UPDATE billing_events SET processed = TRUE, processed_at = NOW()
         WHERE stripe_event_id = $1`,
        [event.id]
      );
    } catch (err) {
      logger.error(`Error handling ${event.type}:`, err);

      // Record error
      await pool.query(
        `UPDATE billing_events
         SET process_attempts = process_attempts + 1, process_error = $2
         WHERE stripe_event_id = $1`,
        [event.id, err.message]
      );
    }

    res.json({ received: true });
  }
);

// ============================================
// Event Handlers
// ============================================

async function handleSubscriptionUpdate(subscription) {
  const pool = getPool();

  // Get org_id from customer metadata
  const customer = await getStripe().customers.retrieve(subscription.customer);
  const orgId = customer.metadata?.org_id;

  if (!orgId) {
    logger.warn('Subscription update without org_id:', subscription.id);
    return;
  }

  // Get plan name from product
  const planName = await getPlanNameFromPrice(subscription.items.data[0]?.price?.id);

  // Upsert subscription
  await pool.query(
    `INSERT INTO billing_subscriptions (
      org_id,
      customer_id,
      stripe_subscription_id,
      stripe_price_id,
      stripe_product_id,
      plan_name,
      plan_interval,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      trial_start,
      trial_end,
      canceled_at,
      last_synced_at
    )
    SELECT
      $1,
      bc.id,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      NOW()
    FROM billing_customers bc
    WHERE bc.org_id = $1
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = EXCLUDED.status,
      plan_name = EXCLUDED.plan_name,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      canceled_at = EXCLUDED.canceled_at,
      last_synced_at = NOW(),
      updated_at = NOW()`,
    [
      orgId,
      subscription.customer,
      subscription.id,
      subscription.items.data[0]?.price?.id,
      subscription.items.data[0]?.price?.product,
      planName,
      subscription.items.data[0]?.price?.recurring?.interval || 'month',
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      subscription.cancel_at_period_end,
      subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
    ]
  );

  // Update organization billing info
  await pool.query(
    `UPDATE organizations
     SET billing_plan = $2,
         billing_status = $3,
         stripe_subscription_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [orgId, planName, subscription.status, subscription.id]
  );

  // Update limits based on plan
  await updateOrgLimits(orgId, planName);

  logger.info('Subscription updated:', {
    orgId,
    subscriptionId: subscription.id,
    status: subscription.status,
    plan: planName
  });
}

async function handleSubscriptionDeleted(subscription) {
  const pool = getPool();

  // Get org from subscription
  const result = await pool.query(
    `SELECT org_id FROM billing_subscriptions WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  if (result.rows.length === 0) return;

  const orgId = result.rows[0].org_id;

  // Mark subscription as canceled
  await pool.query(
    `UPDATE billing_subscriptions
     SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  // Downgrade org to free plan
  await pool.query(
    `UPDATE organizations
     SET billing_plan = 'free',
         billing_status = 'canceled',
         updated_at = NOW()
     WHERE id = $1`,
    [orgId]
  );

  await updateOrgLimits(orgId, 'free');

  logger.info('Subscription canceled:', { orgId, subscriptionId: subscription.id });
}

async function handleInvoicePaid(invoice) {
  const pool = getPool();

  const customer = await getStripe().customers.retrieve(invoice.customer);
  const orgId = customer.metadata?.org_id;

  if (!orgId) return;

  await pool.query(
    `INSERT INTO billing_invoices (
      org_id,
      customer_id,
      stripe_invoice_id,
      stripe_payment_intent_id,
      stripe_charge_id,
      number,
      status,
      subtotal_cents,
      tax_cents,
      total_cents,
      amount_paid_cents,
      currency,
      period_start,
      period_end,
      paid_at,
      invoice_pdf_url,
      hosted_invoice_url,
      billing_reason,
      last_synced_at
    )
    SELECT
      $1,
      bc.id,
      $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, $17, NOW()
    FROM billing_customers bc
    WHERE bc.org_id = $1
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      paid_at = EXCLUDED.paid_at,
      amount_paid_cents = EXCLUDED.amount_paid_cents,
      last_synced_at = NOW()`,
    [
      orgId,
      invoice.customer,
      invoice.id,
      invoice.payment_intent,
      invoice.charge,
      invoice.number,
      invoice.status,
      invoice.subtotal,
      invoice.tax || 0,
      invoice.total,
      invoice.amount_paid,
      invoice.currency,
      new Date(invoice.period_start * 1000),
      new Date(invoice.period_end * 1000),
      invoice.invoice_pdf,
      invoice.hosted_invoice_url,
      invoice.billing_reason
    ]
  );

  logger.info('Invoice paid:', { orgId, invoiceId: invoice.id, amount: invoice.total });
}

async function handlePaymentFailed(invoice) {
  const pool = getPool();

  const customer = await getStripe().customers.retrieve(invoice.customer);
  const orgId = customer.metadata?.org_id;

  if (!orgId) return;

  // Update subscription status to past_due
  if (invoice.subscription) {
    await pool.query(
      `UPDATE billing_subscriptions
       SET status = 'past_due', updated_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [invoice.subscription]
    );

    await pool.query(
      `UPDATE organizations SET billing_status = 'past_due' WHERE id = $1`,
      [orgId]
    );
  }

  // Log security event
  await pool.query(
    `INSERT INTO security_events (org_id, event_type, severity, title, details)
     VALUES ($1, 'payment_failed', 'high', 'Payment Failed', $2)`,
    [orgId, { invoice_id: invoice.id, amount: invoice.amount_due }]
  );

  logger.warn('Payment failed:', { orgId, invoiceId: invoice.id });
}

async function handleCustomerUpdate(customer) {
  const pool = getPool();
  const orgId = customer.metadata?.org_id;

  if (!orgId) return;

  await pool.query(
    `UPDATE billing_customers
     SET email = $2,
         name = $3,
         stripe_default_payment_method_id = $4,
         balance_cents = $5,
         last_synced_at = NOW()
     WHERE org_id = $1`,
    [
      orgId,
      customer.email,
      customer.name,
      customer.invoice_settings?.default_payment_method,
      customer.balance
    ]
  );
}

// ============================================
// Helper Functions
// ============================================

async function getPlanNameFromPrice(priceId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT name FROM billing_plans
     WHERE stripe_price_id_monthly = $1 OR stripe_price_id_yearly = $1`,
    [priceId]
  );
  return result.rows[0]?.name || 'starter';
}

async function updateOrgLimits(orgId, planName) {
  const pool = getPool();

  await pool.query(
    `UPDATE organizations o
     SET max_users = bp.max_users,
         max_items = bp.max_items,
         max_locations = bp.max_locations,
         max_api_calls_per_day = bp.max_api_calls_per_day,
         features = bp.features,
         updated_at = NOW()
     FROM billing_plans bp
     WHERE o.id = $1 AND bp.name = $2`,
    [orgId, planName]
  );
}

module.exports = router;
