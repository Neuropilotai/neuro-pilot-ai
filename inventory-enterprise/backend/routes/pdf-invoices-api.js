/**
 * PDF Invoice Manager API v4.1
 * View all PDF invoices, mark as processed, integrate with inventory counts
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('better-sqlite3');

// GET /api/invoices/pdfs - Get all PDF invoices
router.get('/pdfs', async (req, res) => {
  try {
    const db = sqlite3(req.app.locals.dbPath || './db/inventory_enterprise.db');

    // Get all orders with their PDFs
    const orders = db.prepare(`
      SELECT
        o.order_id,
        o.order_number,
        o.order_date,
        o.total_amount,
        o.status,
        o.pdf_path,
        o.processed_in_count_id,
        o.created_at,
        COUNT(oi.item_id) as item_count,
        SUM(oi.quantity) as total_quantity
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      WHERE o.pdf_path IS NOT NULL
      GROUP BY o.order_id
      ORDER BY o.order_date DESC
    `).all();

    // Categorize by processing status
    const categorized = {
      unprocessed: [],
      processed: [],
      pending_count: []
    };

    for (const order of orders) {
      const pdfExists = await checkPDFExists(order.pdf_path);

      const orderData = {
        ...order,
        pdf_available: pdfExists,
        pdf_url: pdfExists ? `/api/invoices/pdf/${order.order_id}` : null,
        is_processed: order.processed_in_count_id !== null,
        status_label: order.processed_in_count_id ? 'Processed' :
                     order.status === 'pending' ? 'Pending' : 'Unprocessed'
      };

      if (order.processed_in_count_id) {
        categorized.processed.push(orderData);
      } else if (order.status === 'pending') {
        categorized.pending_count.push(orderData);
      } else {
        categorized.unprocessed.push(orderData);
      }
    }

    res.json({
      success: true,
      data: categorized,
      summary: {
        total: orders.length,
        unprocessed: categorized.unprocessed.length,
        processed: categorized.processed.length,
        pending_count: categorized.pending_count.length
      }
    });

    db.close();
  } catch (error) {
    console.error('Error fetching PDF invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PDF invoices'
    });
  }
});

// GET /api/invoices/pdf/:orderId - View PDF
router.get('/pdf/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = sqlite3(req.app.locals.dbPath || './db/inventory_enterprise.db');

    const order = db.prepare('SELECT pdf_path FROM orders WHERE order_id = ?').get(orderId);
    db.close();

    if (!order || !order.pdf_path) {
      return res.status(404).json({
        success: false,
        error: 'PDF not found'
      });
    }

    // Resolve PDF path
    const pdfPath = path.isAbsolute(order.pdf_path)
      ? order.pdf_path
      : path.join(__dirname, '..', order.pdf_path);

    // Check if file exists
    const exists = await checkPDFExists(order.pdf_path);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'PDF file not found on disk'
      });
    }

    // Send PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice_${orderId}.pdf"`);
    res.sendFile(pdfPath);
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve PDF'
    });
  }
});

// GET /api/invoices/unprocessed - Get unprocessed invoices for count
router.get('/unprocessed', async (req, res) => {
  try {
    const { beforeDate } = req.query;
    const db = sqlite3(req.app.locals.dbPath || './db/inventory_enterprise.db');

    let query = `
      SELECT
        o.order_id,
        o.order_number,
        o.order_date,
        o.total_amount,
        o.pdf_path,
        COUNT(oi.item_id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      WHERE o.processed_in_count_id IS NULL
        AND o.pdf_path IS NOT NULL
    `;

    const params = [];
    if (beforeDate) {
      query += ' AND o.order_date <= ?';
      params.push(beforeDate);
    }

    query += ' GROUP BY o.order_id ORDER BY o.order_date DESC';

    const orders = db.prepare(query).all(...params);
    db.close();

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error fetching unprocessed invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unprocessed invoices'
    });
  }
});

// POST /api/invoices/mark-processed - Mark invoices as processed in a count
router.post('/mark-processed', async (req, res) => {
  try {
    const { orderIds, countId, countDate } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'orderIds array is required'
      });
    }

    if (!countId) {
      return res.status(400).json({
        success: false,
        error: 'countId is required'
      });
    }

    const db = sqlite3(req.app.locals.dbPath || './db/inventory_enterprise.db');

    // Update orders as processed
    const placeholders = orderIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE orders
      SET processed_in_count_id = ?,
          processed_at = ?,
          status = 'processed'
      WHERE order_id IN (${placeholders})
    `);

    const result = stmt.run(countId, countDate || new Date().toISOString(), ...orderIds);
    db.close();

    res.json({
      success: true,
      data: {
        marked_count: result.changes,
        count_id: countId
      }
    });
  } catch (error) {
    console.error('Error marking invoices as processed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark invoices as processed'
    });
  }
});

// GET /api/invoices/for-count - Get invoices to include in a specific count
router.get('/for-count/:cutoffDate', async (req, res) => {
  try {
    const { cutoffDate } = req.params;
    const db = sqlite3(req.app.locals.dbPath || './db/inventory_enterprise.db');

    // Get all unprocessed orders up to cutoff date
    const orders = db.prepare(`
      SELECT
        o.order_id,
        o.order_number,
        o.order_date,
        o.total_amount,
        o.pdf_path,
        COUNT(oi.item_id) as item_count,
        SUM(oi.quantity) as total_quantity
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      WHERE o.processed_in_count_id IS NULL
        AND o.order_date <= ?
        AND o.pdf_path IS NOT NULL
      GROUP BY o.order_id
      ORDER BY o.order_date DESC
    `).all(cutoffDate);

    // Find the most recent order (last order to include)
    const lastOrder = orders.length > 0 ? orders[0] : null;

    db.close();

    res.json({
      success: true,
      data: {
        orders,
        last_order: lastOrder,
        count: orders.length,
        cutoff_date: cutoffDate
      }
    });
  } catch (error) {
    console.error('Error fetching orders for count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders for count'
    });
  }
});

// Helper function
async function checkPDFExists(pdfPath) {
  if (!pdfPath) return false;

  try {
    const fullPath = path.isAbsolute(pdfPath)
      ? pdfPath
      : path.join(__dirname, '..', pdfPath);

    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = router;
