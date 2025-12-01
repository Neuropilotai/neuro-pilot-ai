/**
 * Vendor Orders API Tests
 * NeuroPilot AI Enterprise V22.2
 *
 * Tests for vendor orders endpoints with deduplication logic.
 *
 * Run with: npm test -- tests/vendor-orders.test.js
 */

const request = require('supertest');

// Mock the pool before requiring the app
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn()
  }))
};

jest.mock('../db', () => ({
  pool: mockPool
}));

// Mock ordersStorage
jest.mock('../config/ordersStorage', () => ({
  buildPreviewUrl: jest.fn(id => id ? `https://drive.google.com/file/d/${id}/preview` : null),
  buildViewUrl: jest.fn(id => id ? `https://drive.google.com/file/d/${id}/view` : null),
  extractFileId: jest.fn(input => {
    if (!input) return null;
    const match = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input;
  }),
  isValidFileId: jest.fn(id => /^[a-zA-Z0-9_-]{20,50}$/.test(id)),
  isValidSourceSystem: jest.fn(sys => ['sysco', 'gfs', 'usfoods', 'pfg', 'local', 'manual', 'other'].includes(sys?.toLowerCase())),
  getSupportedSourceSystems: jest.fn(() => ['sysco', 'gfs', 'usfoods', 'pfg', 'local', 'manual', 'other']),
  getOrdersRootFolderId: jest.fn(() => '1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ')
}));

const express = require('express');
const vendorOrdersRouter = require('../routes/vendor-orders');

// Create test app
const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = { org_id: 1, email: 'test@example.com', role: 'admin' };
  req.tenant = { orgId: 1 };
  next();
});

app.use('/api/vendor-orders', vendorOrdersRouter);

describe('Vendor Orders API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/vendor-orders', () => {
    it('should return paginated orders list', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Count query
        .mockResolvedValueOnce({
          rows: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              vendor_id: 1,
              vendor_name: 'GFS',
              order_number: 'INV-001',
              order_date: '2025-01-15',
              total_lines: 10,
              total_cents: 150000,
              status: 'new',
              pdf_file_id: 'abc123xyz456'
            }
          ]
        });

      const response = await request(app)
        .get('/api/vendor-orders')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].orderNumber).toBe('INV-001');
      expect(response.body.orders[0].total).toBe('1500.00');
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/vendor-orders?status=parsed')
        .expect(200);

      // Check that status filter was applied
      const countQuery = mockPool.query.mock.calls[0][0];
      expect(countQuery).toContain('vo.status = $');
    });
  });

  describe('GET /api/vendor-orders/:id', () => {
    it('should return single order with lines', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            vendor_id: 1,
            vendor_name: 'GFS',
            order_number: 'INV-001',
            total_cents: 150000,
            status: 'parsed',
            pdf_file_id: 'abc123xyz456'
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'line-1',
              line_number: 1,
              description: 'Chicken Breast',
              ordered_qty: 10,
              unit_price_cents: 1500
            }
          ]
        });

      const response = await request(app)
        .get('/api/vendor-orders/123e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.order.orderNumber).toBe('INV-001');
      expect(response.body.lines).toHaveLength(1);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app)
        .get('/api/vendor-orders/invalid-id')
        .expect(400);

      expect(response.body.code).toBe('INVALID_ID');
    });

    it('should return 404 for non-existent order', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/vendor-orders/123e4567-e89b-12d3-a456-426614174000')
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/vendor-orders - Deduplication', () => {
    it('should check for duplicates before creating', async () => {
      // Mock dedup check - no existing order
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ check_vendor_order_exists: null }] })
        .mockResolvedValueOnce({ rows: [{ name: 'GFS' }] }) // Vendor lookup
        .mockResolvedValueOnce({
          rows: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            vendor_name: 'GFS',
            order_number: 'INV-002',
            status: 'new'
          }]
        });

      const response = await request(app)
        .post('/api/vendor-orders')
        .send({
          vendor_id: 1,
          order_number: 'INV-002',
          order_date: '2025-01-15',
          source_system: 'gfs'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.alreadyExists).toBe(false);
    });

    it('should return existing order when duplicate detected by pdf_file_id', async () => {
      const existingOrderId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock dedup check - existing order found
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ check_vendor_order_exists: existingOrderId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: existingOrderId,
            vendor_name: 'GFS',
            order_number: 'INV-001',
            order_date: '2025-01-15',
            status: 'parsed',
            pdf_file_id: 'abc123xyz456789012345678'
          }]
        });

      const response = await request(app)
        .post('/api/vendor-orders')
        .send({
          pdf_file_id: 'abc123xyz456789012345678'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.alreadyExists).toBe(true);
      expect(response.body.order.id).toBe(existingOrderId);
    });

    it('should reject invalid source_system', async () => {
      const response = await request(app)
        .post('/api/vendor-orders')
        .send({
          order_number: 'INV-003',
          source_system: 'invalid_vendor'
        })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toContain(expect.stringContaining('Invalid source_system'));
    });
  });

  describe('DELETE /api/vendor-orders/:id', () => {
    it('should soft delete order', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '123e4567-e89b-12d3-a456-426614174000' }]
      });

      const response = await request(app)
        .delete('/api/vendor-orders/123e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });
  });

  describe('GET /api/vendor-orders/stats/summary', () => {
    it('should return statistics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_orders: '25',
          total_lines: '250',
          total_value_cents: '5000000',
          new_count: '5',
          parsed_count: '15',
          validated_count: '3',
          error_count: '2',
          vendor_count: '4'
        }]
      });

      const response = await request(app)
        .get('/api/vendor-orders/stats/summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats.totalOrders).toBe(25);
      expect(response.body.stats.totalValue).toBe('50000.00');
      expect(response.body.stats.statusCounts.new).toBe(5);
    });
  });
});

describe('ordersStorage utilities', () => {
  const ordersStorage = require('../config/ordersStorage');

  it('should extract file ID from various URL formats', () => {
    // Direct file ID
    expect(ordersStorage.extractFileId('1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ'))
      .toBe('1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ');

    // Preview URL
    expect(ordersStorage.extractFileId('https://drive.google.com/file/d/1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ/preview'))
      .toBe('1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ');

    // View URL
    expect(ordersStorage.extractFileId('https://drive.google.com/file/d/1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ/view'))
      .toBe('1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ');
  });

  it('should validate file ID format', () => {
    expect(ordersStorage.isValidFileId('1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ')).toBe(true);
    expect(ordersStorage.isValidFileId('short')).toBe(false);
    expect(ordersStorage.isValidFileId(null)).toBe(false);
  });

  it('should validate source systems', () => {
    expect(ordersStorage.isValidSourceSystem('sysco')).toBe(true);
    expect(ordersStorage.isValidSourceSystem('GFS')).toBe(true);
    expect(ordersStorage.isValidSourceSystem('invalid')).toBe(false);
  });

  it('should build preview URLs', () => {
    const url = ordersStorage.buildPreviewUrl('abc123');
    expect(url).toBe('https://drive.google.com/file/d/abc123/preview');
  });
});
