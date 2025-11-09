/**
 * POS Payments Route
 * Handles payment capture and refunds
 * Triggers inventory decrements on successful payment
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();

// Validation schemas
const capturePaymentSchema = z.object({
  method: z.enum(['cash', 'external_card']),
  amount_cents: z.number().int().positive(),
  ref: z.string().max(100).optional()
});

const refundPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  reason: z.string().max(500).optional()
});

/**
 * POST /:orderId/capture - Capture payment for order
 */
router.post('/:orderId/capture', async (req, res) => {
  const client = await global.db.connect();

  try {
    await client.query('BEGIN');

    const orderId = parseInt(req.params.orderId);
    const data = capturePaymentSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;
    const userId = req.user.user_id || req.user.id;

    // Get order and verify it's payable
    const order = await client.query(
      `SELECT o.*, s.status as shift_status
       FROM pos_orders o
       JOIN pos_shifts s ON s.id = o.shift_id
       WHERE o.id = $1 AND o.org_id = $2 AND o.site_id = $3
       FOR UPDATE`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const orderData = order.rows[0];

    if (orderData.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Order is not open for payment',
        code: 'ORDER_NOT_OPEN',
        current_status: orderData.status
      });
    }

    if (orderData.shift_status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Shift is not open',
        code: 'SHIFT_NOT_OPEN'
      });
    }

    // Get total payments already captured
    const paymentsResult = await client.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total_paid
       FROM pos_payments
       WHERE order_id = $1 AND status = 'captured'`,
      [orderId]
    );

    const totalPaid = parseInt(paymentsResult.rows[0].total_paid);
    const remaining = orderData.total_cents - totalPaid;

    if (remaining <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Order already fully paid',
        code: 'ALREADY_PAID'
      });
    }

    // Validate payment amount doesn't exceed remaining
    if (data.amount_cents > remaining) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Payment amount exceeds remaining balance',
        code: 'AMOUNT_EXCEEDS_BALANCE',
        remaining_cents: remaining,
        attempted_cents: data.amount_cents
      });
    }

    // Insert payment
    const payment = await client.query(
      `INSERT INTO pos_payments (
         org_id, site_id, order_id, method, amount_cents, ref, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'captured')
       RETURNING *`,
      [orgId, siteId, orderId, data.method, data.amount_cents, data.ref]
    );

    // Check if order is now fully paid
    const newTotalPaid = totalPaid + data.amount_cents;
    const isFullyPaid = newTotalPaid >= orderData.total_cents;

    if (isFullyPaid) {
      // Mark order as paid (this triggers inventory decrement via trigger)
      await client.query(
        `UPDATE pos_orders
         SET status = 'paid', paid_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [orderId]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'PAYMENT_CAPTURE', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({
          method: data.method,
          amount_cents: data.amount_cents,
          ref: data.ref,
          fully_paid: isFullyPaid
        }),
        req.ip
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: isFullyPaid ? 'Payment captured and order completed' : 'Partial payment captured',
      data: {
        payment: payment.rows[0],
        order_status: isFullyPaid ? 'paid' : 'open',
        total_paid_cents: newTotalPaid,
        remaining_cents: orderData.total_cents - newTotalPaid,
        change_due_cents: data.method === 'cash' ? Math.max(0, data.amount_cents - remaining) : 0
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Capture payment error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to capture payment',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });

  } finally {
    client.release();
  }
});

/**
 * POST /:orderId/refund - Refund payment for order
 */
router.post('/:orderId/refund', async (req, res) => {
  const client = await global.db.connect();

  try {
    await client.query('BEGIN');

    const orderId = parseInt(req.params.orderId);
    const data = refundPaymentSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;
    const userId = req.user.user_id || req.user.id;

    // Get order
    const order = await client.query(
      `SELECT * FROM pos_orders
       WHERE id = $1 AND org_id = $2 AND site_id = $3
       FOR UPDATE`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const orderData = order.rows[0];

    if (orderData.status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Only paid orders can be refunded',
        code: 'ORDER_NOT_PAID',
        current_status: orderData.status
      });
    }

    // Get total captured payments
    const paymentsResult = await client.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total_captured
       FROM pos_payments
       WHERE order_id = $1 AND status = 'captured'`,
      [orderId]
    );

    const totalCaptured = parseInt(paymentsResult.rows[0].total_captured);

    // Get total refunded
    const refundsResult = await client.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total_refunded
       FROM pos_payments
       WHERE order_id = $1 AND status = 'refunded'`,
      [orderId]
    );

    const totalRefunded = parseInt(refundsResult.rows[0].total_refunded);
    const refundable = totalCaptured - totalRefunded;

    if (data.amount_cents > refundable) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Refund amount exceeds refundable balance',
        code: 'AMOUNT_EXCEEDS_REFUNDABLE',
        refundable_cents: refundable,
        attempted_cents: data.amount_cents
      });
    }

    // Insert refund payment (negative amount or separate status)
    const refund = await client.query(
      `INSERT INTO pos_payments (
         org_id, site_id, order_id, method, amount_cents, ref, status
       )
       VALUES ($1, $2, $3, 'cash', $4, $5, 'refunded')
       RETURNING *`,
      [orgId, siteId, orderId, data.amount_cents, data.reason || 'Refund']
    );

    // If full refund, update order status
    const newRefunded = totalRefunded + data.amount_cents;
    if (newRefunded >= totalCaptured) {
      await client.query(
        `UPDATE pos_orders SET status = 'refunded' WHERE id = $1`,
        [orderId]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'PAYMENT_REFUND', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({
          amount_cents: data.amount_cents,
          reason: data.reason,
          full_refund: newRefunded >= totalCaptured
        }),
        req.ip
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refund: refund.rows[0],
        total_refunded_cents: newRefunded,
        remaining_refundable_cents: totalCaptured - newRefunded
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Refund payment error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid refund data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });

  } finally {
    client.release();
  }
});

/**
 * GET /:orderId/payments - Get all payments for order
 */
router.get('/:orderId/payments', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    const payments = await global.db.query(
      `SELECT * FROM pos_payments
       WHERE order_id = $1
       AND org_id = $2
       AND site_id = $3
       ORDER BY paid_at`,
      [orderId, orgId, siteId]
    );

    res.json({
      success: true,
      data: payments.rows
    });

  } catch (error) {
    console.error('Get payments error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get payments',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
