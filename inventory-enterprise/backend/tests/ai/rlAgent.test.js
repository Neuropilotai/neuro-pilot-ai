/**
 * RL Agent Tests
 * Version: v2.2.0-2025-10-07
 *
 * Tests for reinforcement learning agent, policy optimization, and simulation
 */

const RLAgent = require('../../src/ai/rl/RLAgent');
const simulator = require('../../src/ai/rl/simulator');

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../config/logger');
jest.mock('../../utils/metricsExporter');
jest.mock('../../src/ai/rl/simulator');

const db = require('../../config/database');
const metricsExporter = require('../../utils/metricsExporter');

describe('RLAgent', () => {
  let agent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new (require('../../src/ai/rl/RLAgent').constructor)();
  });

  describe('discretizeState', () => {
    test('should discretize continuous state into buckets', () => {
      const historicalData = [
        { consumption: 10, forecast: 9 },
        { consumption: 12, forecast: 11 },
        { consumption: 15, forecast: 14 },
        { consumption: 8, forecast: 9 },
        { consumption: 11, forecast: 10 }
      ];

      const state = agent.discretizeState('APPLE001', historicalData);

      expect(state).toHaveProperty('stockVarianceBucket');
      expect(state).toHaveProperty('mapeBucket');
      expect(state).toHaveProperty('leadTimeBucket');
      expect(state).toHaveProperty('raw');
      expect(state.raw).toHaveProperty('stockVariance');
      expect(state.raw).toHaveProperty('avgMape');
      expect(state.raw).toHaveProperty('leadTime');
    });

    test('should handle empty historical data', () => {
      const state = agent.discretizeState('APPLE001', []);

      expect(state.stockVarianceBucket).toBeDefined();
      expect(state.mapeBucket).toBeDefined();
    });
  });

  describe('discretize', () => {
    test('should assign correct bucket for value', () => {
      const buckets = [0, 10, 25, 50, 100];

      expect(agent.discretize(5, buckets)).toBe(0);
      expect(agent.discretize(15, buckets)).toBe(1);
      expect(agent.discretize(30, buckets)).toBe(2);
      expect(agent.discretize(75, buckets)).toBe(3);
      expect(agent.discretize(150, buckets)).toBe(4);
    });

    test('should handle boundary values', () => {
      const buckets = [0, 10, 25, 50, 100];

      expect(agent.discretize(0, buckets)).toBe(0);
      expect(agent.discretize(10, buckets)).toBe(1);
      expect(agent.discretize(100, buckets)).toBe(4);
    });
  });

  describe('getCandidateActions', () => {
    test('should generate 9 candidate actions', () => {
      const currentPolicy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const actions = agent.getCandidateActions(currentPolicy);

      expect(actions).toHaveLength(9);
      expect(actions[0].name).toBe('no_change');
      expect(actions.find(a => a.name === 'increase_reorder_point')).toBeDefined();
      expect(actions.find(a => a.name === 'decrease_safety_stock')).toBeDefined();
    });
  });

  describe('applyAction', () => {
    test('should apply action to policy correctly', () => {
      const currentPolicy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const action = {
        reorderPointDelta: 0.1,
        safetyStockDelta: 0.15,
        eoqFactorDelta: 0
      };

      const newPolicy = agent.applyAction(currentPolicy, action);

      expect(newPolicy.reorder_point).toBeCloseTo(55, 1);
      expect(newPolicy.safety_stock).toBeCloseTo(23, 1);
      expect(newPolicy.eoq_factor).toBe(1.0);
    });

    test('should not allow negative values', () => {
      const currentPolicy = {
        reorder_point: 10,
        safety_stock: 5,
        eoq_factor: 0.5
      };

      const action = {
        reorderPointDelta: -0.5,
        safetyStockDelta: -0.5,
        eoqFactorDelta: -0.5
      };

      const newPolicy = agent.applyAction(currentPolicy, action);

      expect(newPolicy.reorder_point).toBeGreaterThanOrEqual(0);
      expect(newPolicy.safety_stock).toBeGreaterThanOrEqual(0);
      expect(newPolicy.eoq_factor).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('computeReward', () => {
    test('should compute reward correctly', () => {
      const simResult = {
        stockouts: 2,
        waste: 5,
        serviceLevel: 95,
        avgHoldingCost: 10
      };

      const reward = agent.computeReward(simResult);

      // Reward = -100*2 - 50*5 + 200*(95/100) - 10*10
      // Reward = -200 - 250 + 190 - 100 = -360
      expect(reward).toBeCloseTo(-360, 0);
    });

    test('should reward high service level', () => {
      const simResult = {
        stockouts: 0,
        waste: 0,
        serviceLevel: 100,
        avgHoldingCost: 5
      };

      const reward = agent.computeReward(simResult);

      expect(reward).toBeGreaterThan(0); // 200 - 50 = 150
    });

    test('should penalize stockouts heavily', () => {
      const simResult = {
        stockouts: 10,
        waste: 0,
        serviceLevel: 50,
        avgHoldingCost: 0
      };

      const reward = agent.computeReward(simResult);

      expect(reward).toBeLessThan(-900); // -100*10 + 200*0.5
    });
  });

  describe('tunePolicy', () => {
    beforeEach(() => {
      db.query = jest.fn();
      simulator.simulate = jest.fn();
      metricsExporter.recordRLPolicyCommit = jest.fn();
      metricsExporter.recordRLReward = jest.fn();
    });

    test('should tune policy when improvement exceeds threshold', async () => {
      const mockCurrentPolicy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const mockHistoricalData = Array(60).fill({
        consumption: 10,
        forecast: 9
      });

      // Mock getCurrentPolicy
      db.query.mockResolvedValueOnce({ rows: [mockCurrentPolicy] });

      // Mock getHistoricalData
      db.query.mockResolvedValueOnce({ rows: mockHistoricalData });

      // Mock simulation results
      simulator.simulate
        .mockResolvedValueOnce({ // no_change
          stockouts: 5,
          waste: 10,
          serviceLevel: 85,
          avgHoldingCost: 15
        })
        .mockResolvedValueOnce({ // increase_reorder_point
          stockouts: 2,
          waste: 8,
          serviceLevel: 95,
          avgHoldingCost: 18
        })
        .mockResolvedValueOnce({ // decrease_reorder_point
          stockouts: 8,
          waste: 5,
          serviceLevel: 75,
          avgHoldingCost: 10
        })
        // ... more actions
        .mockResolvedValue({
          stockouts: 3,
          waste: 7,
          serviceLevel: 90,
          avgHoldingCost: 12
        });

      // Mock baseline simulation
      simulator.simulate.mockResolvedValueOnce({
        stockouts: 5,
        waste: 10,
        serviceLevel: 85,
        avgHoldingCost: 15
      });

      // Mock commitPolicy queries
      db.query.mockResolvedValue({ rowsAffected: 1 });

      const result = await agent.tunePolicy('APPLE001');

      expect(result.success).toBe(true);
      expect(result.improvementPercent).toBeGreaterThan(5);
      expect(result.policy).toBeDefined();
      expect(metricsExporter.recordRLPolicyCommit).toHaveBeenCalled();
      expect(metricsExporter.recordRLReward).toHaveBeenCalled();
    });

    test('should not commit policy if improvement below threshold', async () => {
      const mockCurrentPolicy = {
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0
      };

      const mockHistoricalData = Array(60).fill({
        consumption: 10,
        forecast: 9
      });

      db.query
        .mockResolvedValueOnce({ rows: [mockCurrentPolicy] })
        .mockResolvedValueOnce({ rows: mockHistoricalData });

      // Mock all simulations to have similar rewards
      simulator.simulate.mockResolvedValue({
        stockouts: 5,
        waste: 10,
        serviceLevel: 85,
        avgHoldingCost: 15
      });

      const result = await agent.tunePolicy('APPLE001');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('No significant improvement');
      expect(result.improvementPercent).toBeLessThan(5);
    });

    test('should handle missing policy', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await agent.tunePolicy('APPLE001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No existing policy');
    });

    test('should handle insufficient historical data', async () => {
      const mockCurrentPolicy = { reorder_point: 50, safety_stock: 20, eoq_factor: 1.0 };

      db.query
        .mockResolvedValueOnce({ rows: [mockCurrentPolicy] })
        .mockResolvedValueOnce({ rows: [] }); // Empty historical data

      const result = await agent.tunePolicy('APPLE001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient historical data');
    });
  });

  describe('commitPolicy', () => {
    beforeEach(() => {
      db.query = jest.fn();
    });

    test('should update policy and insert history', async () => {
      const policy = {
        reorder_point: 55,
        safety_stock: 23,
        eoq_factor: 1.1
      };

      const data = {
        policy,
        reward: 150,
        reason: 'RL improvement: +8.5%',
        simResult: {}
      };

      // Mock update query
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });

      // Mock get policy version
      db.query.mockResolvedValueOnce({ rows: [{ policy_version: 5 }] });

      // Mock insert history
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });

      await agent.commitPolicy('APPLE001', data);

      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE ai_policy'),
        [55, 23, 1.1, 'APPLE001']
      );
      expect(db.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO ai_policy_history'),
        expect.arrayContaining(['APPLE001', 55, 23, 1.1, 5, 150, expect.any(String)])
      );
    });
  });

  describe('getPolicy', () => {
    test('should retrieve policy for item', async () => {
      const mockPolicy = {
        item_code: 'APPLE001',
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0,
        policy_version: 3
      };

      db.query.mockResolvedValue({ rows: [mockPolicy] });

      const result = await agent.getPolicy('APPLE001');

      expect(result.item_code).toBe('APPLE001');
      expect(result.reorder_point).toBe(50);
    });

    test('should return null for non-existent policy', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await agent.getPolicy('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getPolicyHistory', () => {
    test('should retrieve policy history', async () => {
      const mockHistory = [
        {
          id: 1,
          item_code: 'APPLE001',
          reorder_point: 55,
          policy_version: 4,
          reward: 150,
          reason: 'RL improvement: +8.5%',
          ts: '2025-10-01T10:00:00Z'
        },
        {
          id: 2,
          item_code: 'APPLE001',
          reorder_point: 50,
          policy_version: 3,
          reward: 138,
          reason: 'RL improvement: +6.2%',
          ts: '2025-09-25T10:00:00Z'
        }
      ];

      db.query.mockResolvedValue({ rows: mockHistory });

      const result = await agent.getPolicyHistory('APPLE001', 5);

      expect(result).toHaveLength(2);
      expect(result[0].policy_version).toBe(4);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY ts DESC'),
        ['APPLE001', 5]
      );
    });
  });
});
