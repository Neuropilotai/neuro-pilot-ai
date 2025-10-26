# AI Stability Panel Integration Guide

## 🎯 Overview

This guide shows how to integrate the Adaptive Intelligence API into frontend dashboards using dynamic HTML loading.

---

## 🔧 Integration Pattern

### Option 1: Dynamic HTML Loading (Recommended)

```html
<!-- In your main dashboard HTML (e.g., owner-super-console.html) -->
<section id="ai-stability-panel"></section>

<script>
  // Fetch and inject the AI stability panel
  fetch('/frontend/owner-ai-stability.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('ai-stability-panel').innerHTML = html;

      // If your panel JS requires initialization, call it here
      if (window.AIStabilityPanel?.init) {
        window.AIStabilityPanel.init();
      }
    })
    .catch(err => {
      console.error('Failed to load AI stability panel:', err);
      document.getElementById('ai-stability-panel').innerHTML =
        '<p class="error">Failed to load stability panel</p>';
    });
</script>
```

### Option 2: Direct API Integration

```html
<!-- In your dashboard HTML -->
<div id="ai-stability-dashboard">
  <h3>Adaptive Intelligence Status</h3>
  <div id="stability-metrics">Loading...</div>
</div>

<script>
(async function() {
  try {
    const token = localStorage.getItem('authToken');

    // Fetch current status
    const response = await fetch('/api/ai/adaptive/status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success) {
      const { policy, metrics, tuner } = data.data;

      // Render metrics
      document.getElementById('stability-metrics').innerHTML = `
        <div class="metrics-grid">
          <div class="metric-card">
            <h4>Success Rate</h4>
            <div class="metric-value">${metrics.success_rate.toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <h4>Avg Attempts</h4>
            <div class="metric-value">${metrics.avg_attempts.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <h4>Lock Rate</h4>
            <div class="metric-value">${metrics.lock_rate.toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <h4>Max Retries</h4>
            <div class="metric-value">${policy.max_retries}</div>
          </div>
        </div>
        <div class="tuner-status">
          Last tuned: ${tuner.last_tune || 'Never'}
          (${tuner.tune_count} cycles)
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading stability data:', error);
    document.getElementById('stability-metrics').innerHTML =
      '<p class="error">Failed to load stability metrics</p>';
  }
})();
</script>
```

---

## 📁 Example Panel Component

Create a standalone panel file at `/frontend/owner-ai-stability.html`:

```html
<!-- /frontend/owner-ai-stability.html -->
<div class="ai-stability-panel">
  <div class="panel-header">
    <h3>🤖 Adaptive Intelligence</h3>
    <button id="stability-retrain-btn" class="btn-retrain">Retrain</button>
  </div>

  <div class="stability-metrics" id="stability-metrics-container">
    <div class="loading">Loading metrics...</div>
  </div>

  <div class="stability-history" id="stability-history-container">
    <h4>Recent Tuning History</h4>
    <div id="history-list"></div>
  </div>
</div>

<script>
window.AIStabilityPanel = {
  token: null,

  init() {
    this.token = localStorage.getItem('authToken');
    this.loadMetrics();
    this.loadHistory();
    this.attachEventListeners();

    // Auto-refresh every 30 seconds
    setInterval(() => this.loadMetrics(), 30000);
  },

  async loadMetrics() {
    try {
      const response = await fetch('/api/ai/adaptive/status', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();

      if (data.success) {
        this.renderMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  },

  async loadHistory() {
    try {
      const response = await fetch('/api/ai/adaptive/history?limit=5', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();

      if (data.success) {
        this.renderHistory(data.data.history);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  async triggerRetrain() {
    try {
      const btn = document.getElementById('stability-retrain-btn');
      btn.disabled = true;
      btn.textContent = 'Retraining...';

      const response = await fetch('/api/ai/adaptive/retrain', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ days: 30, force: false })
      });

      const data = await response.json();

      if (data.success) {
        alert(data.message);
        this.loadHistory(); // Refresh history
      } else {
        alert('Retrain failed: ' + data.error);
      }
    } catch (error) {
      console.error('Retrain error:', error);
      alert('Failed to trigger retrain');
    } finally {
      const btn = document.getElementById('stability-retrain-btn');
      btn.disabled = false;
      btn.textContent = 'Retrain';
    }
  },

  renderMetrics(data) {
    const { policy, metrics, tuner } = data;

    const html = `
      <div class="metrics-grid">
        <div class="metric-card ${metrics.success_rate >= 95 ? 'success' : 'warning'}">
          <div class="metric-label">Success Rate</div>
          <div class="metric-value">${metrics.success_rate.toFixed(1)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Attempts</div>
          <div class="metric-value">${metrics.avg_attempts.toFixed(2)}</div>
        </div>
        <div class="metric-card ${metrics.lock_rate < 5 ? 'success' : 'warning'}">
          <div class="metric-label">Lock Rate</div>
          <div class="metric-value">${metrics.lock_rate.toFixed(1)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Observations</div>
          <div class="metric-value">${metrics.observation_count}</div>
        </div>
      </div>
      <div class="policy-summary">
        <strong>Policy:</strong> ${policy.max_retries} retries,
        ${policy.base_delay_ms}ms delay,
        ${policy.jitter_pct}% jitter
      </div>
      <div class="tuner-status">
        <strong>Tuner:</strong> ${tuner.tune_count} cycles completed
        ${tuner.last_tune ? `(last: ${new Date(tuner.last_tune).toLocaleString()})` : ''}
      </div>
    `;

    document.getElementById('stability-metrics-container').innerHTML = html;
  },

  renderHistory(history) {
    if (history.length === 0) {
      document.getElementById('history-list').innerHTML =
        '<p class="no-data">No tuning history yet</p>';
      return;
    }

    const html = history.map(rec => `
      <div class="history-item ${rec.applied ? 'applied' : 'pending'}">
        <div class="history-header">
          <span class="history-date">${new Date(rec.timestamp).toLocaleString()}</span>
          <span class="history-status ${rec.applied ? 'badge-success' : 'badge-pending'}">
            ${rec.applied ? 'Applied' : 'Pending'}
          </span>
        </div>
        <div class="history-body">
          <div class="history-change">
            <strong>Delay:</strong> ${rec.from.base_delay_ms}ms → ${rec.to.base_delay_ms}ms
          </div>
          <div class="history-reason">${rec.reason}</div>
        </div>
      </div>
    `).join('');

    document.getElementById('history-list').innerHTML = html;
  },

  attachEventListeners() {
    const retrainBtn = document.getElementById('stability-retrain-btn');
    if (retrainBtn) {
      retrainBtn.addEventListener('click', () => this.triggerRetrain());
    }
  }
};

// Auto-initialize if loaded dynamically
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.AIStabilityPanel) {
      window.AIStabilityPanel.init();
    }
  });
} else {
  // DOM already loaded
  if (window.AIStabilityPanel) {
    window.AIStabilityPanel.init();
  }
}
</script>

<style>
.ai-stability-panel {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.btn-retrain {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-retrain:hover {
  background: #45a049;
}

.btn-retrain:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.metric-card {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.metric-card.success {
  background: #e8f5e9;
  border: 1px solid #4CAF50;
}

.metric-card.warning {
  background: #fff3e0;
  border: 1px solid #FF9800;
}

.metric-label {
  font-size: 0.9em;
  color: #666;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 1.8em;
  font-weight: bold;
  color: #333;
}

.policy-summary, .tuner-status {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 0.9em;
}

.history-item {
  border-left: 4px solid #ccc;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafafa;
}

.history-item.applied {
  border-left-color: #4CAF50;
}

.history-item.pending {
  border-left-color: #FF9800;
}

.history-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.history-date {
  font-size: 0.9em;
  color: #666;
}

.badge-success {
  background: #4CAF50;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
}

.badge-pending {
  background: #FF9800;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
}

.history-change {
  font-weight: bold;
  margin-bottom: 4px;
}

.history-reason {
  font-size: 0.9em;
  color: #666;
  font-style: italic;
}

.error {
  color: #f44336;
  padding: 12px;
  background: #ffebee;
  border-radius: 4px;
}

.no-data {
  color: #999;
  text-align: center;
  padding: 20px;
}
</style>
```

---

## 🔌 Integration into Existing Dashboard

### In `owner-super-console.html` (or your main dashboard):

```html
<!-- Add this section where you want the panel to appear -->
<div class="dashboard-section">
  <section id="ai-stability-panel"></section>
</div>

<script>
// Load the panel dynamically
fetch('/frontend/owner-ai-stability.html')
  .then(r => r.text())
  .then(html => {
    document.getElementById('ai-stability-panel').innerHTML = html;

    // Initialize the panel if it has an init function
    if (window.AIStabilityPanel?.init) {
      window.AIStabilityPanel.init();
    }
  })
  .catch(err => {
    console.error('Failed to load AI stability panel:', err);
  });
</script>
```

---

## 🎨 Styling Tips

1. **Match your existing theme**: Customize the CSS colors to match your dashboard
2. **Responsive design**: The metrics grid uses `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` for responsiveness
3. **Success/warning states**: Metrics have visual indicators based on thresholds (e.g., success rate < 95% shows warning)

---

## 🔄 Auto-Refresh

The panel auto-refreshes metrics every 30 seconds by default. Adjust the interval in the `init()` method:

```javascript
// Refresh every 60 seconds instead
setInterval(() => this.loadMetrics(), 60000);
```

---

## 🚀 Advanced Features

### Add Real-time Updates with WebSockets

```javascript
// In your panel init() method
const ws = new WebSocket('ws://localhost:8083');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'stability_update') {
    this.renderMetrics(data.payload);
  }
};
```

### Add Metric Charts

Use Chart.js or similar library:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<canvas id="stability-chart"></canvas>

<script>
const ctx = document.getElementById('stability-chart').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels: history.map(h => new Date(h.timestamp).toLocaleString()),
    datasets: [{
      label: 'Success Rate',
      data: history.map(h => h.telemetry.success_rate),
      borderColor: '#4CAF50'
    }]
  }
});
</script>
```

---

## 📚 Related Documentation

- [Adaptive Intelligence API](../ADAPTIVE_INTELLIGENCE_API_v16_6.md)
- [Verification Script](../scripts/verify_adaptive_intelligence.sh)
- [Frontend Dashboard Guide](./OWNER_CONSOLE_GUIDE.md)

---

**Generated**: 2025-10-20
**Version**: 16.6.0
**Author**: NeuroInnovate AI Team
