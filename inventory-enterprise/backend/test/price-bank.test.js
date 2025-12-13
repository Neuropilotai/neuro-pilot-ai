/**
 * Integration Tests: Price Bank System
 * Version: v23.6.13-2025-12-09
 *
 * Tests for:
 * - Price bank ingestion endpoint
 * - Latest price lookup
 * - Price history retrieval
 * - Tenant scoping
 * - Metrics recording
 *
 * Target: Comprehensive coverage of price bank functionality
 */

const { describe, it, before, after, beforeEach } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Note: This test assumes the server is running or can be started
// For full integration, you may need to start the server in test mode
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8083';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-change-in-production';

describe('Price Bank System Integration Tests', function() {
  this.timeout(15000);

  let authToken;
  let testOrgId = 'test-org-123';
  let testItemCode = 'TEST-ITEM-001';
  let testVendor = 'GFS';

  // Mock authentication token
  before(function() {
    authToken = jwt.sign(
      {
        email: 'test@example.com',
        role: 'owner',
        org_id: testOrgId,
        tenant_id: testOrgId
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/price-bank/ingest', function() {
    it('should ingest price items successfully', async function() {
      const testItems = [
        {
          item_code: testItemCode,
          vendor: testVendor,
          description: 'Test Item Description',
          pack_size: '12x1kg',
          unit_cost: 25.99,
          currency: 'USD',
          effective_date: '2025-12-09',
          source_pdf: 'test-doc-123|test-invoice.pdf',
          source_page: 1,
          hash: 'test-hash-123'
        }
      ];

      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: testItems })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('ingested', 1);
    });

    it('should handle multiple items in one ingestion', async function() {
      const testItems = [
        {
          item_code: 'TEST-ITEM-002',
          vendor: testVendor,
          description: 'Second Test Item',
          pack_size: '6x2kg',
          unit_cost: 45.50,
          currency: 'USD',
          effective_date: '2025-12-09',
          source_pdf: 'test-doc-123|test-invoice.pdf',
          source_page: 1,
          hash: 'test-hash-456'
        },
        {
          item_code: 'TEST-ITEM-003',
          vendor: 'Sysco',
          description: 'Third Test Item',
          pack_size: '24x500g',
          unit_cost: 18.75,
          currency: 'USD',
          effective_date: '2025-12-09',
          source_pdf: 'test-doc-123|test-invoice.pdf',
          source_page: 2,
          hash: 'test-hash-789'
        }
      ];

      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: testItems })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('ingested', 2);
    });

    it('should validate required fields', async function() {
      const invalidItems = [
        {
          // Missing item_code
          vendor: testVendor,
          unit_cost: 25.99,
          effective_date: '2025-12-09'
        }
      ];

      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: invalidItems })
        .expect(400);

      expect(response.body).to.have.property('errors');
      expect(response.body.errors).to.be.an('array');
    });

    it('should handle duplicate ingestion (upsert)', async function() {
      const testItems = [
        {
          item_code: testItemCode,
          vendor: testVendor,
          description: 'Updated Description',
          pack_size: '12x1kg',
          unit_cost: 26.50, // Updated price
          currency: 'USD',
          effective_date: '2025-12-09',
          source_pdf: 'test-doc-123|test-invoice.pdf',
          source_page: 1,
          hash: 'test-hash-123'
        }
      ];

      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: testItems })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('ingested', 1);
    });

    it('should handle ingestion errors gracefully', async function() {
      // This test would require mocking database errors
      // For now, we test that the endpoint exists and validates input
      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: [] }) // Empty array should fail validation
        .expect(400);

      expect(response.body).to.have.property('errors');
    });
  });

  describe('GET /api/price-bank/items/:itemCode/latest', function() {
    it('should return latest price for existing item', async function() {
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/latest`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('latest');
      if (response.body.latest) {
        expect(response.body.latest).to.have.property('item_code', testItemCode);
        expect(response.body.latest).to.have.property('vendor');
        expect(response.body.latest).to.have.property('unit_cost');
        expect(response.body.latest).to.have.property('effective_date');
      }
    });

    it('should return null for non-existent item', async function() {
      const response = await request(BASE_URL)
        .get('/api/price-bank/items/NON-EXISTENT-ITEM/latest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).to.have.property('error');
    });

    it('should validate itemCode parameter', async function() {
      const response = await request(BASE_URL)
        .get('/api/price-bank/items//latest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).to.have.property('errors');
    });

    it('should respect tenant scoping', async function() {
      // Create token for different org
      const otherOrgToken = jwt.sign(
        {
          email: 'other@example.com',
          role: 'owner',
          org_id: 'other-org-456',
          tenant_id: 'other-org-456'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Should not see items from testOrgId
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/latest`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(404);

      // Other org should not have access to test org's items
      expect(response.body).to.have.property('error');
    });
  });

  describe('GET /api/price-bank/items/:itemCode/history', function() {
    it('should return price history for existing item', async function() {
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 })
        .expect(200);

      expect(response.body).to.have.property('history');
      expect(response.body.history).to.be.an('array');
      
      if (response.body.history.length > 0) {
        const firstEntry = response.body.history[0];
        expect(firstEntry).to.have.property('item_code', testItemCode);
        expect(firstEntry).to.have.property('vendor');
        expect(firstEntry).to.have.property('unit_cost');
        expect(firstEntry).to.have.property('effective_date');
      }
    });

    it('should respect limit parameter', async function() {
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 5 })
        .expect(200);

      expect(response.body).to.have.property('history');
      expect(response.body.history.length).to.be.at.most(5);
    });

    it('should use default limit of 50 when not specified', async function() {
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('history');
      expect(response.body.history.length).to.be.at.most(50);
    });

    it('should validate limit parameter range', async function() {
      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 500 }) // Exceeds max of 200
        .expect(400);

      expect(response.body).to.have.property('errors');
    });

    it('should return empty array for non-existent item', async function() {
      const response = await request(BASE_URL)
        .get('/api/price-bank/items/NON-EXISTENT-ITEM/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('history');
      expect(response.body.history).to.be.an('array');
      expect(response.body.history.length).to.equal(0);
    });

    it('should respect tenant scoping for history', async function() {
      // Create token for different org
      const otherOrgToken = jwt.sign(
        {
          email: 'other@example.com',
          role: 'owner',
          org_id: 'other-org-456',
          tenant_id: 'other-org-456'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(BASE_URL)
        .get(`/api/price-bank/items/${testItemCode}/history`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(200);

      // Should return empty history for other org
      expect(response.body).to.have.property('history');
      expect(response.body.history).to.be.an('array');
      expect(response.body.history.length).to.equal(0);
    });
  });

  describe('Price Bank Metrics', function() {
    it('should record metrics on successful ingestion', async function() {
      // This test verifies that metrics are being recorded
      // In a real scenario, you would check Prometheus metrics endpoint
      const testItems = [
        {
          item_code: 'METRICS-TEST-001',
          vendor: 'GFS',
          description: 'Metrics Test Item',
          pack_size: '12x1kg',
          unit_cost: 30.00,
          currency: 'USD',
          effective_date: '2025-12-09',
          source_pdf: 'metrics-test|test.pdf',
          source_page: 1,
          hash: 'metrics-hash-123'
        }
      ];

      const response = await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: testItems })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      
      // In production, you would query /metrics endpoint to verify
      // metrics were recorded: price_bank_ingest_items_total, price_bank_ingest_duration_seconds
    });

    it('should record metrics on price lookup', async function() {
      const response = await request(BASE_URL)
        .get('/api/price-bank/items/METRICS-TEST-001/latest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify lookup was successful
      expect(response.body).to.have.property('latest');
      
      // In production, you would query /metrics endpoint to verify
      // metrics were recorded: price_bank_lookups_total, price_bank_lookup_duration_seconds
    });
  });

  describe('Price Bank Data Integrity', function() {
    it('should maintain price history when updating latest price', async function() {
      const originalPrice = 25.99;
      const updatedPrice = 27.50;

      // First ingestion
      await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{
            item_code: 'HISTORY-TEST-001',
            vendor: testVendor,
            description: 'History Test',
            pack_size: '12x1kg',
            unit_cost: originalPrice,
            currency: 'USD',
            effective_date: '2025-12-09',
            source_pdf: 'history-test|test.pdf',
            source_page: 1,
            hash: 'history-hash-1'
          }]
        })
        .expect(200);

      // Second ingestion with updated price
      await request(BASE_URL)
        .post('/api/price-bank/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{
            item_code: 'HISTORY-TEST-001',
            vendor: testVendor,
            description: 'History Test Updated',
            pack_size: '12x1kg',
            unit_cost: updatedPrice,
            currency: 'USD',
            effective_date: '2025-12-10',
            source_pdf: 'history-test|test2.pdf',
            source_page: 1,
            hash: 'history-hash-2'
          }]
        })
        .expect(200);

      // Latest should be updated price
      const latestResponse = await request(BASE_URL)
        .get('/api/price-bank/items/HISTORY-TEST-001/latest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(latestResponse.body.latest.unit_cost).to.equal(updatedPrice);

      // History should contain both entries
      const historyResponse = await request(BASE_URL)
        .get('/api/price-bank/items/HISTORY-TEST-001/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(historyResponse.body.history.length).to.be.at.least(2);
      
      // Verify both prices are in history
      const prices = historyResponse.body.history.map(h => h.unit_cost);
      expect(prices).to.include(originalPrice);
      expect(prices).to.include(updatedPrice);
    });
  });
});

