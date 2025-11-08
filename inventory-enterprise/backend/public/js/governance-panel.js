/**
 * governance-panel.js (v16.5.0)
 *
 * Real-Time Governance Panel Controller
 * - Fetches unified status and predictive trends
 * - Subscribes to WebSocket for live updates
 * - Renders sparkline chart with forecast overlay
 * - Handles system control actions
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-19
 */

class GovernancePanel {
  constructor() {
    this.ws = null;
    this.chart = null;
    this.refreshInterval = null;
    this.token = localStorage.getItem('token');
    this.wsConnected = false;
    this.chartData = {
      historical: [],
      forecast: []
    };
  }

  /**
   * Initialize the panel
   */
  init() {
    console.log('🎯 Initializing Governance Panel v16.5.0');

    // Check authentication
    if (!this.token) {
      console.warn('⚠️  No auth token found, redirecting to login');
      window.location.href = '/owner-login.html';
      return;
    }

    // Bind event listeners
    this.bindEventListeners();

    // Initial data load
    this.loadUnifiedStatus();
    this.loadPredictiveTrend();

    // Setup WebSocket connection
    this.initWebSocket();

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadUnifiedStatus();
    }, 30000);

    console.log('✅ Governance Panel initialized');
  }

  /**
   * Bind UI event listeners
   */
  bindEventListeners() {
    // Control toolbar buttons
    document.getElementById('refresh-all-btn')?.addEventListener('click', () => {
      this.handleRefreshAll();
    });

    document.getElementById('generate-report-btn')?.addEventListener('click', () => {
      this.handleGenerateReport();
    });

    document.getElementById('verify-finance-btn')?.addEventListener('click', () => {
      this.handleVerifyFinance();
    });

    document.getElementById('recompute-ai-btn')?.addEventListener('click', () => {
      this.handleRecomputeAI();
    });

    // Trend controls
    document.getElementById('trend-pillar-select')?.addEventListener('change', () => {
      this.loadPredictiveTrend();
    });

    document.getElementById('trend-horizon-select')?.addEventListener('change', () => {
      this.loadPredictiveTrend();
    });

    document.getElementById('trend-refresh-btn')?.addEventListener('click', () => {
      this.loadPredictiveTrend();
    });

    // Dismiss alerts
    document.getElementById('dismiss-alerts-btn')?.addEventListener('click', () => {
      this.dismissAlerts();
    });
  }

  /**
   * Load unified status from API
   */
  async loadUnifiedStatus() {
    try {
      const response = await fetch('/api/governance/predictive/unified', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/owner-login.html';
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update UI
      this.updateUnifiedStatus(data);

      // Update last update timestamp
      document.getElementById('last-update').textContent =
        `Last update: ${new Date(data.last_update).toLocaleTimeString()}`;

    } catch (error) {
      console.error('❌ Error loading unified status:', error);
      this.showError('Failed to load governance status');
    }
  }

  /**
   * Update unified status UI
   */
  updateUnifiedStatus(data) {
    // Governance Score
    document.getElementById('governance-score').textContent =
      Math.round(data.governance_score);
    document.getElementById('governance-badge').textContent =
      data.overall_status === 'ok' ? '🟢' :
      data.overall_status === 'degraded' ? '🟡' : '🔴';

    // Finance Integrity
    document.getElementById('finance-score').textContent =
      Math.round(data.finance_integrity.score);
    document.getElementById('finance-badge').textContent =
      data.finance_integrity.badge;
    document.getElementById('finance-status').textContent =
      data.finance_integrity.status.toUpperCase();

    // AI Intelligence
    document.getElementById('ai-score').textContent =
      Math.round(data.ai_intelligence.index);
    document.getElementById('ai-badge').textContent =
      data.ai_intelligence.badge;
    document.getElementById('ai-status').textContent =
      data.ai_intelligence.status.toUpperCase();

    // Health Score
    document.getElementById('health-score').textContent =
      Math.round(data.health_score.score);
    document.getElementById('health-badge').textContent =
      data.health_score.badge;
    document.getElementById('health-status').textContent =
      data.health_score.status.toUpperCase();

    // Update status card classes
    this.updateCardStatus('governance-score-card', data.overall_status);
    this.updateCardStatus('finance-card', data.finance_integrity.status);
    this.updateCardStatus('ai-card', data.ai_intelligence.status);
    this.updateCardStatus('health-card', data.health_score.status);

    // Display alerts if any
    if (data.alerts && data.alerts.length > 0) {
      this.displayAlerts(data.alerts);
    } else {
      document.getElementById('alerts-panel').style.display = 'none';
    }
  }

  /**
   * Load predictive trend from API
   */
  async loadPredictiveTrend() {
    try {
      const pillar = document.getElementById('trend-pillar-select')?.value || 'composite';
      const horizon = document.getElementById('trend-horizon-select')?.value || 7;

      const response = await fetch(
        `/api/governance/predictive/trend?pillar=${pillar}&days=${horizon}&lookback=30`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update chart data
      this.chartData = {
        historical: data.historical,
        forecast: data.forecast
      };

      // Render chart
      this.renderTrendChart();

      // Update metadata
      document.getElementById('trend-current').textContent =
        `${Math.round(data.current_score)}/100`;
      document.getElementById('trend-change').textContent =
        `${data.change_7d >= 0 ? '+' : ''}${data.change_7d}`;
      document.getElementById('trend-direction').textContent =
        data.trend === 'rising' ? '↗️ Rising' :
        data.trend === 'falling' ? '↘️ Falling' : '→ Stable';
      document.getElementById('trend-confidence').textContent =
        `${Math.round(data.confidence * 100)}%`;

      // Update trend icon and value
      document.getElementById('governance-trend-icon').textContent =
        data.trend === 'rising' ? '↗' :
        data.trend === 'falling' ? '↘' : '→';
      document.getElementById('governance-trend-value').textContent =
        `${data.change_7d >= 0 ? '+' : ''}${data.change_7d}`;

    } catch (error) {
      console.error('❌ Error loading predictive trend:', error);
      this.showError('Failed to load trend data');
    }
  }

  /**
   * Render trend chart with forecast overlay
   */
  renderTrendChart() {
    const canvas = document.getElementById('governance-trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 40, bottom: 40, left: 50 };

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Extract data
    const historical = this.chartData.historical;
    const forecast = this.chartData.forecast;

    if (historical.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No historical data available', width / 2, height / 2);
      return;
    }

    // Combine all points for scaling
    const allPoints = [
      ...historical.map(h => ({ date: h.as_of, value: h.score })),
      ...forecast.map(f => ({ date: f.as_of, value: f.score }))
    ];

    // Calculate scales
    const minValue = 0;
    const maxValue = 100;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xScale = (i, total) => padding.left + (i / (total - 1)) * plotWidth;
    const yScale = (value) => padding.top + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const value = maxValue - (i / 4) * (maxValue - minValue);
      ctx.fillStyle = '#999';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(value), padding.left - 10, y + 4);
    }

    // Draw historical line
    if (historical.length > 0) {
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.beginPath();

      historical.forEach((point, i) => {
        const x = xScale(i, historical.length);
        const y = yScale(point.score);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = '#00ff88';
      historical.forEach((point, i) => {
        const x = xScale(i, historical.length);
        const y = yScale(point.score);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Draw forecast line (dotted)
    if (forecast.length > 0) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();

      // Start from last historical point
      const lastHistorical = historical[historical.length - 1];
      const startX = xScale(historical.length - 1, historical.length + forecast.length);
      const startY = yScale(lastHistorical.score);
      ctx.moveTo(startX, startY);

      forecast.forEach((point, i) => {
        const x = xScale(historical.length + i, historical.length + forecast.length);
        const y = yScale(point.score);
        ctx.lineTo(x, y);
      });

      ctx.stroke();
      ctx.setLineDash([]);

      // Draw forecast points
      ctx.fillStyle = '#00d4ff';
      forecast.forEach((point, i) => {
        const x = xScale(historical.length + i, historical.length + forecast.length);
        const y = yScale(point.score);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw confidence bands (shaded area)
      ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
      ctx.beginPath();

      // Upper bound
      forecast.forEach((point, i) => {
        const x = xScale(historical.length + i, historical.length + forecast.length);
        const y = yScale(point.upper);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Lower bound (reverse)
      for (let i = forecast.length - 1; i >= 0; i--) {
        const x = xScale(historical.length + i, historical.length + forecast.length);
        const y = yScale(forecast[i].lower);
        ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fill();
    }

    // Draw X-axis labels (simplified - show first, middle, last)
    ctx.fillStyle = '#999';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    if (historical.length > 0) {
      // First point
      ctx.fillText(
        historical[0].as_of.slice(5),
        xScale(0, historical.length),
        height - 10
      );

      // Last historical
      ctx.fillText(
        historical[historical.length - 1].as_of.slice(5),
        xScale(historical.length - 1, historical.length + forecast.length),
        height - 10
      );
    }

    if (forecast.length > 0) {
      // Last forecast
      ctx.fillText(
        forecast[forecast.length - 1].as_of.slice(5),
        xScale(historical.length + forecast.length - 1, historical.length + forecast.length),
        height - 10
      );
    }

    // Legend
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00ff88';
    ctx.fillRect(width - padding.right - 120, padding.top, 15, 3);
    ctx.fillText('Historical', width - padding.right - 100, padding.top + 5);

    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(width - padding.right - 120, padding.top + 20, 15, 3);
    ctx.fillText('Forecast', width - padding.right - 100, padding.top + 25);
  }

  /**
   * Initialize WebSocket connection for real-time updates
   */
  initWebSocket() {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ai/realtime`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.wsConnected = true;
        document.getElementById('websocket-status').textContent = '🟢';

        // Subscribe to governance updates
        this.ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'governance'
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'governance_update') {
            console.log('📡 Governance update received:', message.payload);
            this.handleGovernanceUpdate(message.payload);
          }
        } catch (error) {
          console.error('❌ Error processing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.wsConnected = false;
        document.getElementById('websocket-status').textContent = '🔴';
      };

      this.ws.onclose = () => {
        console.warn('⚠️  WebSocket disconnected');
        this.wsConnected = false;
        document.getElementById('websocket-status').textContent = '🔴';

        // Attempt reconnection after 5 seconds
        setTimeout(() => {
          console.log('🔄 Attempting WebSocket reconnection...');
          this.initWebSocket();
        }, 5000);
      };
    } catch (error) {
      console.error('❌ Error initializing WebSocket:', error);
    }
  }

  /**
   * Handle real-time governance update from WebSocket
   */
  handleGovernanceUpdate(payload) {
    // Update specific pillar score
    const { pillar, score, ts } = payload;

    if (pillar === 'finance') {
      document.getElementById('finance-score').textContent = Math.round(score);
    } else if (pillar === 'ai') {
      document.getElementById('ai-score').textContent = Math.round(score);
    } else if (pillar === 'health') {
      document.getElementById('health-score').textContent = Math.round(score);
    } else if (pillar === 'composite') {
      document.getElementById('governance-score').textContent = Math.round(score);
    }

    // Reload full status to update badges and statuses
    this.loadUnifiedStatus();
  }

  /**
   * Update status card styling based on status
   */
  updateCardStatus(cardId, status) {
    const card = document.getElementById(cardId);
    if (!card) return;

    card.classList.remove('status-ok', 'status-degraded', 'status-critical');
    card.classList.add(`status-${status}`);
  }

  /**
   * Display alerts panel
   */
  displayAlerts(alerts) {
    const panel = document.getElementById('alerts-panel');
    const list = document.getElementById('alerts-list');

    if (!panel || !list) return;

    list.innerHTML = '';

    alerts.forEach(alert => {
      const item = document.createElement('div');
      item.className = 'alert-item';
      item.innerHTML = `
        <span class="alert-severity ${alert.severity}">${alert.severity?.toUpperCase()}</span>
        <span class="alert-message">${alert.message || alert.anomaly_type}</span>
        <span class="alert-time">${new Date(alert.detected_at || alert.ts).toLocaleTimeString()}</span>
      `;
      list.appendChild(item);
    });

    panel.style.display = 'block';
  }

  /**
   * Dismiss alerts
   */
  dismissAlerts() {
    document.getElementById('alerts-panel').style.display = 'none';
  }

  /**
   * Handle "Refresh All" button
   */
  async handleRefreshAll() {
    console.log('🔄 Refreshing all data...');
    await Promise.all([
      this.loadUnifiedStatus(),
      this.loadPredictiveTrend()
    ]);
    this.showSuccess('Data refreshed successfully');
  }

  /**
   * Handle "Generate Report" button
   */
  async handleGenerateReport() {
    try {
      console.log('📄 Generating weekly report...');

      const response = await fetch('/api/governance/intelligence/report', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ format: 'pdf' })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.showSuccess(`Report generated: ${data.file_path || 'Success'}`);
    } catch (error) {
      console.error('❌ Error generating report:', error);
      this.showError('Failed to generate report');
    }
  }

  /**
   * Handle "Verify Finance" button
   */
  async handleVerifyFinance() {
    try {
      console.log('🔒 Verifying finance period...');

      const response = await fetch('/api/finance/enforcement/period/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.showSuccess(`Finance verification: ${data.status || 'Complete'}`);
      this.loadUnifiedStatus();
    } catch (error) {
      console.error('❌ Error verifying finance:', error);
      this.showError('Failed to verify finance period');
    }
  }

  /**
   * Handle "AI Recompute" button
   */
  async handleRecomputeAI() {
    try {
      console.log('⚙️ Recomputing AI forecasts...');

      const response = await fetch('/api/governance/predictive/recompute', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.showSuccess(`Recomputed ${data.forecast_count || 0} forecasts`);

      // Refresh trend after recompute
      setTimeout(() => {
        this.loadPredictiveTrend();
      }, 1000);
    } catch (error) {
      console.error('❌ Error recomputing forecasts:', error);
      this.showError('Failed to recompute AI forecasts');
    }
  }

  /**
   * Show success toast
   */
  showSuccess(message) {
    console.log(`✅ ${message}`);
    // Could implement a toast notification here
    alert(`✅ ${message}`);
  }

  /**
   * Show error toast
   */
  showError(message) {
    console.error(`❌ ${message}`);
    // Could implement a toast notification here
    alert(`❌ ${message}`);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.ws) {
      this.ws.close();
    }

    console.log('🛑 Governance Panel destroyed');
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.GovernancePanel = GovernancePanel;
}
