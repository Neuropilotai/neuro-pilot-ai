/**
 * Billing Routes
 * NeuroPilot AI Enterprise Phase 2
 *
 * Stripe integration for subscription management:
 * - Customer portal access
 * - Subscription management
 * - Usage tracking
 * - Invoice history
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, ROLES } = require('../middleware/auth');
const { extractTenant, loadOrgDetails } = require('../middleware/tenant');
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
// GET /api/billing/status
// Get current billing status for organization
// ============================================
router.get('/status',
  authenticateToken,
  extractTenant,
  loadOrgDetails,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool || !req.org?.id) {
        return res.json({
          plan: 'free',
          status: 'active',
          features: {}
        });
      }

      // Get subscription details
      const subResult = await pool.query(
        `SELECT
          bs.plan_name,
          bs.status,
          bs.current_period_end,
          bs.cancel_at_period_end,
          bs.trial_end,
          bp.display_name,
          bp.features,
          bp.max_users,
          bp.max_items,
          bp.max_locations,
          bp.max_api_calls_per_day
        FROM billing_subscriptions bs
        JOIN billing_plans bp ON bp.name = bs.plan_name
        WHERE bs.org_id = $1
          AND bs.status IN ('active', 'trialing', 'past_due')
        ORDER BY bs.created_at DESC
        LIMIT 1`,
        [req.org.id]
      );

      if (subResult.rows.length === 0) {
        // No subscription - use free plan
        const freePlan = await pool.query(
          `SELECT * FROM billing_plans WHERE name = 'free'`
        );

        return res.json({
          plan: 'free',
          displayName: 'Free',
          status: 'active',
          features: freePlan.rows[0]?.features || {},
          limits: {
            maxUsers: freePlan.rows[0]?.max_users || 2,
            maxItems: freePlan.rows[0]?.max_items || 100,
            maxLocations: freePlan.rows[0]?.max_locations || 1,
            maxApiCalls: freePlan.rows[0]?.max_api_calls_per_day || 100
          }
        });
      }

      const sub = subResult.rows[0];

      res.json({
        plan: sub.plan_name,
        displayName: sub.display_name,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end,
        features: sub.features || {},
        limits: {
          maxUsers: sub.max_users,
          maxItems: sub.max_items,
          maxLocations: sub.max_locations,
          maxApiCalls: sub.max_api_calls_per_day
        }
      });
    } catch (error) {
      logger.error('Billing status error:', error);
      res.status(500).json({ error: 'Failed to get billing status' });
    }
  }
);

// ============================================
// GET /api/billing/plans
// Get available billing plans
// ============================================
router.get('/plans', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json({ plans: [] });
    }

    const result = await pool.query(
      `SELECT
        name,
        display_name,
        description,
        price_monthly_cents,
        price_yearly_cents,
        currency,
        max_users,
        max_items,
        max_locations,
        max_api_calls_per_day,
        features,
        badge_text,
        badge_color
      FROM billing_plans
      WHERE is_active = TRUE AND is_public = TRUE
      ORDER BY sort_order`
    );

    res.json({
      plans: result.rows.map(plan => ({
        name: plan.name,
        displayName: plan.display_name,
        description: plan.description,
        pricing: {
          monthly: plan.price_monthly_cents,
          yearly: plan.price_yearly_cents,
          currency: plan.currency
        },
        limits: {
          users: plan.max_users,
          items: plan.max_items,
          locations: plan.max_locations,
          apiCalls: plan.max_api_calls_per_day
        },
        features: plan.features,
        badge: plan.badge_text ? {
          text: plan.badge_text,
          color: plan.badge_color
        } : null
      }))
    });
  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// ============================================
// POST /api/billing/checkout
// Create Stripe checkout session
// ============================================
router.post('/checkout',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          error: 'Billing not configured',
          code: 'BILLING_NOT_CONFIGURED'
        });
      }

      const { planName, interval = 'month' } = req.body;
      const pool = getPool();

      // Get plan details
      const planResult = await pool.query(
        `SELECT stripe_price_id_monthly, stripe_price_id_yearly
         FROM billing_plans WHERE name = $1 AND is_active = TRUE`,
        [planName]
      );

      if (planResult.rows.length === 0) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      const priceId = interval === 'year'
        ? planResult.rows[0].stripe_price_id_yearly
        : planResult.rows[0].stripe_price_id_monthly;

      if (!priceId) {
        return res.status(400).json({ error: 'Plan not available for purchase' });
      }

      // Get or create Stripe customer
      let customerId;
      const customerResult = await pool.query(
        `SELECT stripe_customer_id FROM billing_customers WHERE org_id = $1`,
        [req.org.id]
      );

      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].stripe_customer_id;
      } else {
        // Create new customer in Stripe
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: {
            org_id: req.org.id,
            user_id: req.user.id
          }
        });
        customerId = customer.id;

        // Store customer
        await pool.query(
          `INSERT INTO billing_customers (org_id, stripe_customer_id, email)
           VALUES ($1, $2, $3)`,
          [req.org.id, customerId, req.user.email]
        );
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL || 'https://app.neuropilot.dev'}/settings/billing?success=true`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://app.neuropilot.dev'}/settings/billing?canceled=true`,
        metadata: {
          org_id: req.org.id,
          plan_name: planName
        }
      });

      res.json({
        sessionId: session.id,
        url: session.url
      });
    } catch (error) {
      logger.error('Checkout error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }
);

// ============================================
// POST /api/billing/portal
// Create Stripe customer portal session
// ============================================
router.post('/portal',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          error: 'Billing not configured',
          code: 'BILLING_NOT_CONFIGURED'
        });
      }

      const pool = getPool();

      // Get customer ID
      const customerResult = await pool.query(
        `SELECT stripe_customer_id FROM billing_customers WHERE org_id = $1`,
        [req.org.id]
      );

      if (customerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No billing account found' });
      }

      // Create portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: customerResult.rows[0].stripe_customer_id,
        return_url: `${process.env.FRONTEND_URL || 'https://app.neuropilot.dev'}/settings/billing`
      });

      res.json({ url: session.url });
    } catch (error) {
      logger.error('Portal error:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }
);

// ============================================
// GET /api/billing/invoices
// Get invoice history
// ============================================
router.get('/invoices',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ invoices: [] });
      }

      const result = await pool.query(
        `SELECT
          stripe_invoice_id,
          number,
          status,
          total_cents,
          currency,
          period_start,
          period_end,
          paid_at,
          invoice_pdf_url,
          hosted_invoice_url
        FROM billing_invoices
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT 24`,
        [req.org.id]
      );

      res.json({
        invoices: result.rows.map(inv => ({
          id: inv.stripe_invoice_id,
          number: inv.number,
          status: inv.status,
          total: inv.total_cents,
          currency: inv.currency,
          periodStart: inv.period_start,
          periodEnd: inv.period_end,
          paidAt: inv.paid_at,
          pdfUrl: inv.invoice_pdf_url,
          hostedUrl: inv.hosted_invoice_url
        }))
      });
    } catch (error) {
      logger.error('Get invoices error:', error);
      res.status(500).json({ error: 'Failed to get invoices' });
    }
  }
);

// ============================================
// GET /api/billing/usage
// Get current usage metrics
// ============================================
router.get('/usage',
  authenticateToken,
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool || !req.org?.id) {
        return res.json({ usage: {} });
      }

      // Get various usage counts
      const [users, items, locations, apiCalls] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM organization_members WHERE org_id = $1 AND is_active = TRUE`,
          [req.org.id]
        ),
        pool.query(
          `SELECT COUNT(*) FROM inventory_items WHERE org_id = $1 AND is_active = 1`,
          [req.org.id]
        ),
        pool.query(
          `SELECT COUNT(*) FROM sites WHERE org_id = $1 AND is_active = TRUE`,
          [req.org.id]
        ),
        pool.query(
          `SELECT COALESCE(SUM(quantity), 0) as count FROM billing_usage_records
           WHERE org_id = $1 AND metric_name = 'api_calls'
           AND period_start >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`,
          [req.org.id]
        )
      ]);

      res.json({
        usage: {
          users: parseInt(users.rows[0].count, 10),
          items: parseInt(items.rows[0].count, 10),
          locations: parseInt(locations.rows[0].count, 10),
          apiCallsToday: parseInt(apiCalls.rows[0].count, 10)
        }
      });
    } catch (error) {
      logger.error('Get usage error:', error);
      res.status(500).json({ error: 'Failed to get usage' });
    }
  }
);

module.exports = router;
