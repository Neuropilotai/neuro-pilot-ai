/**
 * AI Ops Integration Tests
 * Version: v2.6.0-2025-10-07
 *
 * Tests for AI Ops automation components
 */

const { describe, it, before, after, beforeEach } = require('mocha');
const { expect } = require('chai');
const AIOperationsAgent = require('../aiops/Agent');
const MetricsCollector = require('../aiops/MetricsCollector');
const AnomalyPredictor = require('../aiops/AnomalyPredictor');
const RemediationEngine = require('../aiops/RemediationEngine');
const AlertManager = require('../aiops/AlertManager');
const db = require('../database');

describe('AI Ops Automation', function() {
  this.timeout(10000);

  describe('MetricsCollector', () => {
    let collector;

    before(async () => {
      collector = new MetricsCollector({
        prometheusUrl: 'http://localhost:9090'
      });
      await collector.initialize();
    });

    it('should initialize successfully', () => {
      expect(collector).to.exist;
      expect(collector.metricQueries).to.be.an('object');
    });

    it('should collect metrics', async () => {
      const metrics = await collector.collectMetrics();

      expect(metrics).to.have.property('timestamp');
      expect(metrics).to.have.property('metrics');
      expect(metrics.metrics).to.be.an('object');
      expect(Object.keys(metrics.metrics).length).to.be.greaterThan(0);
    });

    it('should fetch historical metrics', async () => {
      const historical = await collector.fetchHistorical(1); // 1 day

      expect(historical).to.be.an('array');
      expect(historical.length).to.be.greaterThan(0);
      expect(historical[0]).to.have.property('metricName');
      expect(historical[0]).to.have.property('value');
      expect(historical[0]).to.have.property('timestamp');
    });

    it('should parse Prometheus text format', () => {
      const text = `
        api_requests_total{status="200"} 1234
        api_latency_p95_ms 250.5
      `;

      const metrics = collector.parseTextFormat(text);

      expect(metrics).to.be.an('object');
      expect(Object.keys(metrics).length).to.equal(2);
    });
  });

  describe('AnomalyPredictor', () => {
    let predictor;

    before(async () => {
      predictor = new AnomalyPredictor({
        minSamples: 10
      });
      await predictor.initialize();
    });

    it('should initialize successfully', () => {
      expect(predictor).to.exist;
      expect(predictor.isInitialized).to.be.true;
    });

    it('should train on historical data', async () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        metricName: 'api_latency_p95_ms',
        value: 200 + Math.random() * 100,
        timestamp: new Date(Date.now() - i * 60000).toISOString()
      }));

      const success = await predictor.train(mockData);

      expect(success).to.be.true;
      expect(predictor.models).to.have.property('api_latency_p95_ms');
    });

    it('should predict anomalies', async () => {
      const currentMetrics = {
        metrics: {
          api_latency_p95_ms: { value: 800, timestamp: new Date().toISOString() }
        }
      };

      const predictions = await predictor.predict(currentMetrics, 24);

      expect(predictions).to.be.an('array');
      expect(predictions.length).to.be.greaterThan(0);
      expect(predictions[0]).to.have.property('anomalyScore');
      expect(predictions[0]).to.have.property('confidence');
      expect(predictions[0].anomalyScore).to.be.within(0, 1);
      expect(predictions[0].confidence).to.be.within(0, 1);
    });

    it('should calculate prediction confidence', async () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        metricName: 'cache_hit_rate_percent',
        value: 85 + Math.random() * 10,
        timestamp: new Date(Date.now() - i * 60000).toISOString()
      }));

      await predictor.train(mockData);

      const currentMetrics = {
        metrics: {
          cache_hit_rate_percent: { value: 60, timestamp: new Date().toISOString() }
        }
      };

      const predictions = await predictor.predict(currentMetrics, 24);
      const prediction = predictions.find(p => p.metricName === 'cache_hit_rate_percent');

      expect(prediction.confidence).to.be.greaterThan(0.5);
    });
  });

  describe('RemediationEngine', () => {
    let engine;

    before(async () => {
      engine = new RemediationEngine({
        dryRun: true // Don't actually execute actions in tests
      });
      await engine.initialize();
    });

    it('should initialize successfully', () => {
      expect(engine).to.exist;
      expect(engine.playbooks).to.be.an('object');
    });

    it('should load playbooks', () => {
      const playbooks = engine.getPlaybooks();

      expect(playbooks).to.be.an('array');
      expect(playbooks.length).to.be.greaterThan(0);
      expect(playbooks[0]).to.have.property('name');
      expect(playbooks[0]).to.have.property('actions');
    });

    it('should execute remediation (dry run)', async () => {
      const incident = {
        id: 'test-incident-123',
        type: 'high-latency',
        severity: 'high',
        prediction: {
          anomalyScore: 0.9,
          value: 1500
        }
      };

      const result = await engine.execute('high-latency', incident);

      expect(result).to.have.property('success');
      expect(result).to.have.property('actions');
      expect(result.actions).to.be.an('array');
      expect(result.duration).to.be.a('number');
    });

    it('should check conditions before executing', async () => {
      const incident = {
        id: 'test-incident-124',
        type: 'high-latency',
        severity: 'low',
        prediction: {
          anomalyScore: 0.5,
          value: 300
        }
      };

      const result = await engine.execute('high-latency', incident);

      // Conditions not met, should skip
      expect(result.success).to.be.false;
      expect(result.skipped).to.be.true;
    });

    it('should track execution history', async () => {
      const incident = {
        id: 'test-incident-125',
        type: 'cache-miss',
        severity: 'medium',
        prediction: {
          anomalyScore: 0.85,
          value: 65
        }
      };

      await engine.execute('cache-miss', incident);

      const history = engine.getHistory();
      expect(history).to.be.an('array');
      expect(history.length).to.be.greaterThan(0);
    });
  });

  describe('AlertManager', () => {
    let alertManager;

    before(async () => {
      alertManager = new AlertManager({
        slack: { enabled: false },
        email: { enabled: false },
        pagerduty: { enabled: false }
      });
      await alertManager.initialize();
    });

    it('should initialize successfully', () => {
      expect(alertManager).to.exist;
    });

    it('should send alerts (no channels configured)', async () => {
      const alert = {
        type: 'test-alert',
        severity: 'medium',
        message: 'Test alert message',
        confidence: 0.9
      };

      const result = await alertManager.sendAlert(alert);

      expect(result).to.have.property('slack');
      expect(result).to.have.property('email');
      expect(result).to.have.property('pagerduty');
    });

    it('should rate limit alerts', async () => {
      const alert = {
        type: 'rate-limited-alert',
        severity: 'low',
        message: 'Test rate limiting'
      };

      const result1 = await alertManager.sendAlert(alert);
      const result2 = await alertManager.sendAlert(alert);

      expect(result2).to.have.property('sent');
      expect(result2.sent).to.be.false;
      expect(result2.reason).to.equal('rate_limited');
    });

    it('should track alert history', async () => {
      const alert = {
        type: 'history-test',
        severity: 'info',
        message: 'Testing history'
      };

      await alertManager.sendAlert(alert);

      const history = alertManager.getHistory();
      expect(history).to.be.an('array');
      expect(history.length).to.be.greaterThan(0);
    });
  });

  describe('AI Operations Agent (Integration)', () => {
    let agent;

    before(async () => {
      agent = new AIOperationsAgent({
        checkInterval: 5000,
        autoRemediationEnabled: false, // Disable for tests
        dryRun: true
      });
    });

    it('should initialize successfully', async () => {
      expect(agent).to.exist;
      expect(agent.isRunning).to.be.false;
    });

    it('should start monitoring', async function() {
      this.timeout(10000);

      await agent.start();

      expect(agent.isRunning).to.be.true;
      expect(agent.stats.checksPerformed).to.be.greaterThanOrEqual(0);

      await agent.stop();
    });

    it('should detect incidents', async function() {
      this.timeout(10000);

      // Mock incident detection
      const incident = {
        id: 'test-123',
        type: 'high-latency',
        severity: 'high',
        confidence: 0.92,
        prediction: {
          metricName: 'api_latency_p95_ms',
          value: 1200,
          anomalyScore: 0.95
        }
      };

      // Trigger incident handler (internal method)
      await agent._handleIncident(incident, Date.now());

      expect(agent.stats.incidentsPredicted).to.be.greaterThan(0);
    });

    it('should provide statistics', () => {
      const stats = agent.getStatistics();

      expect(stats).to.have.property('checksPerformed');
      expect(stats).to.have.property('incidentsPredicted');
      expect(stats).to.have.property('remediationsTriggered');
      expect(stats).to.have.property('successRate');
      expect(stats).to.have.property('isRunning');
    });

    after(async () => {
      if (agent.isRunning) {
        await agent.stop();
      }
    });
  });

  describe('Database Integration', () => {
    beforeEach(async () => {
      // Clean test data
      await db.run('DELETE FROM ai_anomaly_predictions WHERE incident_type LIKE "test-%"');
      await db.run('DELETE FROM ai_remediation_log WHERE incident_type LIKE "test-%"');
    });

    it('should store predictions in database', async () => {
      const query = `
        INSERT INTO ai_anomaly_predictions (
          incident_type, severity, confidence, anomaly_score,
          predicted_timestamp, detected_timestamp, metric_name, metric_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await db.run(query, [
        'test-incident',
        'high',
        0.9,
        0.95,
        new Date().toISOString(),
        new Date().toISOString(),
        'api_latency_p95_ms',
        1200
      ]);

      const result = await db.get(
        'SELECT * FROM ai_anomaly_predictions WHERE incident_type = ?',
        ['test-incident']
      );

      expect(result).to.exist;
      expect(result.severity).to.equal('high');
      expect(result.confidence).to.equal(0.9);
    });

    it('should store remediation logs', async () => {
      const query = `
        INSERT INTO ai_remediation_log (
          incident_id, incident_type, severity, remediation_action,
          success, response_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await db.run(query, [
        'test-incident-123',
        'test-high-latency',
        'high',
        'restart-service',
        1,
        15000
      ]);

      const result = await db.get(
        'SELECT * FROM ai_remediation_log WHERE incident_id = ?',
        ['test-incident-123']
      );

      expect(result).to.exist;
      expect(result.success).to.equal(1);
      expect(result.response_time_ms).to.equal(15000);
    });

    it('should retrieve AI Ops performance metrics', async () => {
      const view = await db.all('SELECT * FROM v_aiops_performance');

      expect(view).to.be.an('array');
      expect(view[0]).to.have.property('total_predictions');
      expect(view[0]).to.have.property('true_positives');
      expect(view[0]).to.have.property('false_positives');
      expect(view[0]).to.have.property('avg_confidence_pct');
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full incident prediction and remediation cycle', async function() {
      this.timeout(15000);

      // 1. Initialize all components
      const agent = new AIOperationsAgent({
        checkInterval: 60000,
        autoRemediationEnabled: true,
        dryRun: true
      });

      await agent.start();

      // 2. Collect metrics
      const metrics = await agent.metricsCollector.collectMetrics();
      expect(metrics.metrics).to.be.an('object');

      // 3. Predict anomalies
      const predictions = await agent.anomalyPredictor.predict(metrics, 24);
      expect(predictions).to.be.an('array');

      // 4. Stop agent
      await agent.stop();
      expect(agent.isRunning).to.be.false;

      // 5. Verify statistics
      const stats = agent.getStatistics();
      expect(stats.checksPerformed).to.be.greaterThan(0);
    });
  });
});
