/**
 * Inventory Simulator Tests
 * Version: v2.2.0-2025-10-07
 *
 * Tests for offline inventory simulation
 */

const simulator = require('../../src/ai/rl/simulator');

describe('InventorySimulator', () => {
  describe('simulate', () => {
    test('should simulate inventory behavior over time', async () => {
      const policy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.5
      };

      const historicalData = Array(30).fill(null).map((_, i) => ({
        date: `2025-10-${String(i + 1).padStart(2, '0')}`,
        consumption: 10 + Math.random() * 5
      }));

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData,
        days: 30
      });

      expect(result).toHaveProperty('stockouts');
      expect(result).toHaveProperty('waste');
      expect(result).toHaveProperty('serviceLevel');
      expect(result).toHaveProperty('avgHoldingCost');
      expect(result).toHaveProperty('totalOrderCost');
      expect(result).toHaveProperty('ordersPlaced');
      expect(result).toHaveProperty('finalStock');

      expect(result.serviceLevel).toBeGreaterThanOrEqual(0);
      expect(result.serviceLevel).toBeLessThanOrEqual(100);
    });

    test('should handle perfect demand satisfaction', async () => {
      const policy = {
        reorder_point: 100,
        safety_stock: 50,
        eoq_factor: 2.0
      };

      const historicalData = Array(10).fill({
        consumption: 5
      });

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData,
        days: 10
      });

      expect(result.stockouts).toBe(0);
      expect(result.serviceLevel).toBe(100);
    });

    test('should detect stockouts with insufficient inventory', async () => {
      const policy = {
        reorder_point: 5,
        safety_stock: 2,
        eoq_factor: 0.5
      };

      const historicalData = Array(10).fill({
        consumption: 20
      });

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData,
        days: 10
      });

      expect(result.stockouts).toBeGreaterThan(0);
      expect(result.serviceLevel).toBeLessThan(100);
    });

    test('should detect waste with excessive inventory', async () => {
      const policy = {
        reorder_point: 500,
        safety_stock: 200,
        eoq_factor: 3.0
      };

      const historicalData = Array(10).fill({
        consumption: 1
      });

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData,
        days: 10
      });

      expect(result.waste).toBeGreaterThan(0);
    });

    test('should trigger reorders at reorder point', async () => {
      const policy = {
        reorder_point: 30,
        safety_stock: 10,
        eoq_factor: 1.0
      };

      const historicalData = Array(20).fill({
        consumption: 10
      });

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData,
        days: 20
      });

      expect(result.ordersPlaced).toBeGreaterThan(0);
      expect(result.totalOrderCost).toBeGreaterThan(0);
    });

    test('should handle empty historical data', async () => {
      const policy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const result = await simulator.simulate({
        itemCode: 'APPLE001',
        policy,
        historicalData: [],
        days: 0
      });

      expect(result.ordersPlaced).toBe(0);
      expect(result.stockouts).toBe(0);
      expect(result.serviceLevel).toBe(100);
    });
  });

  describe('estimateInitialStock', () => {
    test('should estimate based on historical average', () => {
      const historicalData = [
        { consumption: 10 },
        { consumption: 12 },
        { consumption: 15 },
        { consumption: 8 }
      ];

      const policy = {
        reorder_point: 50,
        safety_stock: 20
      };

      const initialStock = simulator.estimateInitialStock(historicalData, policy);

      // Average consumption = 11.25, so 7 days = 78.75
      // Should be at least reorder_point + safety_stock = 70
      expect(initialStock).toBeGreaterThanOrEqual(70);
    });

    test('should use default when no historical data', () => {
      const policy = {
        reorder_point: 50,
        safety_stock: 20
      };

      const initialStock = simulator.estimateInitialStock([], policy);

      expect(initialStock).toBe(40); // safety_stock * 2
    });
  });

  describe('calculateOrderQuantity', () => {
    test('should calculate order quantity based on policy', () => {
      const policy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.5
      };

      const state = {
        currentStock: 30,
        onOrder: 0
      };

      const orderQty = simulator.calculateOrderQuantity(policy, state, 10);

      // targetStock = 50 + 20 = 70
      // orderQty = (70 - 30) * 1.5 = 60
      expect(orderQty).toBeCloseTo(60, 0);
    });

    test('should not order negative quantities', () => {
      const policy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const state = {
        currentStock: 100,
        onOrder: 0
      };

      const orderQty = simulator.calculateOrderQuantity(policy, state, 5);

      expect(orderQty).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateOrderCost', () => {
    test('should include fixed and variable costs', () => {
      const orderCost = simulator.calculateOrderCost(100);

      // Fixed cost 50 + variable (100 * 2) = 250
      expect(orderCost).toBe(250);
    });

    test('should handle zero quantity', () => {
      const orderCost = simulator.calculateOrderCost(0);

      expect(orderCost).toBe(50); // Only fixed cost
    });
  });

  describe('calculateHoldingCost', () => {
    test('should calculate holding cost per day', () => {
      const holdingCost = simulator.calculateHoldingCost(100);

      // 100 units * $0.50 per unit = $50
      expect(holdingCost).toBe(50);
    });

    test('should handle zero stock', () => {
      const holdingCost = simulator.calculateHoldingCost(0);

      expect(holdingCost).toBe(0);
    });
  });

  describe('batchSimulate', () => {
    test('should simulate multiple policies', async () => {
      const policies = [
        { reorder_point: 40, safety_stock: 15, eoq_factor: 1.0 },
        { reorder_point: 50, safety_stock: 20, eoq_factor: 1.5 },
        { reorder_point: 60, safety_stock: 25, eoq_factor: 2.0 }
      ];

      const historicalData = Array(30).fill({
        consumption: 10
      });

      const results = await simulator.batchSimulate({
        itemCode: 'APPLE001',
        policies,
        historicalData,
        days: 30
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('policy');
      expect(results[0]).toHaveProperty('stockouts');
      expect(results[0]).toHaveProperty('serviceLevel');

      // Each result should have the original policy attached
      expect(results[0].policy.reorder_point).toBe(40);
      expect(results[1].policy.reorder_point).toBe(50);
      expect(results[2].policy.reorder_point).toBe(60);
    });

    test('should handle empty policy list', async () => {
      const results = await simulator.batchSimulate({
        itemCode: 'APPLE001',
        policies: [],
        historicalData: [],
        days: 30
      });

      expect(results).toHaveLength(0);
    });
  });
});
