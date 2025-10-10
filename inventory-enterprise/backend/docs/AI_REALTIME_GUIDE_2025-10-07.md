# AI Real-Time Intelligence Layer Guide
## Version: v2.3.0-2025-10-07

---

## Overview

The Real-Time Intelligence Layer upgrades Inventory Enterprise from periodic batch optimization (v2.2.0) to **continuous, streaming AI intelligence** with sub-200ms latency.

### Key Features

1. **WebSocket Streaming** - Live AI events pushed to clients in real-time
2. **Hot-Reload Models** - Models update without server restart
3. **Streaming Feedback** - Incremental learning from continuous data flow
4. **Live Forecasting** - On-demand predictions with 30-minute caching

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  REAL-TIME INTELLIGENCE LAYER                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  WebSocket  │────▶│  Event Bus   │────▶│  External Apps  │
│   Server    │     │  (Internal)  │     │   (Dashboard)   │
└─────────────┘     └──────────────┘     └─────────────────┘
      ▲                     ▲
      │                     │
      │              ┌──────┴──────┐
      │              │             │
┌─────┴──────┐  ┌───┴────┐  ┌────┴────┐
│  Feedback  │  │Forecast│  │  RL     │
│  Stream    │  │Worker  │  │ Agent   │
└────────────┘  └────────┘  └─────────┘
      ▲              ▲           ▲
      │              │           │
   [DB Poll]    [File Watch]  [Simulation]
```

---

## WebSocket API

### Connection

```javascript
const socket = io('http://localhost:8083/ai/realtime', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  },
  transports: ['websocket']
});

socket.on('connected', (data) => {
  console.log('Connected:', data.version);
});
```

### Subscribe to Item Updates

```javascript
// Subscribe to specific item
socket.emit('subscribe:item', 'APPLE001');

// Listen for forecast updates
socket.on('forecast:update', (data) => {
  console.log('New forecast:', data);
  // {
  //   itemCode: 'APPLE001',
  //   forecast: {...},
  //   modelType: 'prophet',
  //   timestamp: '2025-10-07T10:00:00Z'
  // }
});

// Listen for policy changes
socket.on('policy:update', (data) => {
  console.log('Policy updated:', data);
  // {
  //   itemCode: 'APPLE001',
  //   policy: { reorder_point: 55, safety_stock: 23 },
  //   improvementPercent: 8.5,
  //   reward: 150,
  //   timestamp: '2025-10-07T10:00:00Z'
  // }
});
```

### Subscribe to Anomalies

```javascript
socket.emit('subscribe:anomalies');

socket.on('anomaly:alert', (data) => {
  console.log('Anomaly detected:', data);
  // {
  //   itemCode: 'APPLE001',
  //   anomalyType: 'sudden_spike',
  //   severity: 'high',
  //   details: {...},
  //   timestamp: '2025-10-07T10:00:00Z'
  // }
});
```

### Event Types

| Event | Description | Trigger |
|-------|-------------|---------|
| `forecast:update` | New forecast generated | Model prediction completed |
| `policy:update` | RL policy changed | Policy optimization successful |
| `anomaly:alert` | Anomaly detected | Z-score > 3σ |
| `feedback:ingested` | New feedback processed | Actual vs forecast recorded |
| `model:retrained` | Model retrained | Drift detection or manual trigger |
| `drift:detected` | Model drift identified | MAPE > threshold |

---

## Streaming Feedback

### Configuration

```bash
# .env
FEEDBACK_POLL_INTERVAL=5000        # Poll every 5 seconds
FEEDBACK_BATCH_SIZE=100            # Process 100 records per batch
FEEDBACK_DRIFT_THRESHOLD=0.15      # 15% MAPE triggers retrain
INCREMENTAL_RETRAIN_ENABLED=true   # Enable automatic retraining
```

### How It Works

1. **Polling**: Every 5 seconds, checks for new `ai_feedback` entries
2. **Processing**: Emits events to WebSocket clients
3. **Drift Detection**: Tracks rolling 20-sample MAPE per item
4. **Incremental Retrain**: Triggers if MAPE > 15% and > 1hr since last retrain

### Manual Control

```javascript
const feedbackStream = require('./ai/streaming/FeedbackStream');

// Start streaming
await feedbackStream.start();

// Get stats
const stats = feedbackStream.getStats();
console.log(stats);
// {
//   isStreaming: true,
//   lastProcessedId: 12345,
//   pollIntervalMs: 5000,
//   itemsTracked: 150,
//   itemsWithDrift: 5
// }

// Stop streaming
feedbackStream.stop();
```

---

## Live Forecast Worker

### Features

- **Hot-Reload**: Watches model directory, reloads on file changes
- **Redis Caching**: 30-minute TTL per forecast
- **Sub-200ms Latency**: Target p95 < 200ms

### Configuration

```bash
# .env
AI_MODELS_DIR=data/ai/models
REDIS_ENABLED=true
FORECAST_CACHE_TTL=1800          # 30 minutes
HOT_RELOAD_ENABLED=true
FORECAST_HORIZON=30              # 30 days
```

### Usage

```javascript
const forecastWorker = require('./ai/workers/ForecastWorker');

// Start worker
await forecastWorker.start();

// Get live forecast
const forecast = await forecastWorker.getForecast('APPLE001', 30);
console.log(forecast);
// {
//   itemCode: 'APPLE001',
//   modelType: 'prophet',
//   modelVersion: 5,
//   horizon: 30,
//   generatedAt: '2025-10-07T10:00:00Z',
//   predictions: [...]
// }

// Check stats
const stats = forecastWorker.getStats();
console.log(stats);
// {
//   isWatching: true,
//   modelsLoaded: 150,
//   hotReloadEnabled: true,
//   cacheEnabled: true,
//   models: [...]
// }
```

### Hot-Reload Behavior

When a model file changes:
1. Old model unloaded from cache
2. New model loaded
3. Redis cache invalidated
4. `model:retrained` event emitted
5. Clients receive update via WebSocket

---

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Forecast Latency (p95)** | < 200ms | `ai_forecast_latency_seconds{quantile="0.95"}` |
| **Cache Hit Rate** | ≥ 85% | `ai_forecast_latency_seconds_count{cache_status="cache_hit"} / ai_forecast_latency_seconds_count` |
| **WebSocket Latency** | < 50ms | Client-side ping/pong measurement |
| **Feedback Processing** | > 100 records/sec | `ai_feedback_stream_rate` |

---

## Monitoring

### Grafana Dashboard

Import `grafana/AI-Realtime-Intelligence-2025-10-07.json`

**Panels:**
- WebSocket connections (live count)
- Event broadcast rate
- Forecast latency (p50/p95/p99)
- Cache hit rate gauge
- Feedback streaming rate
- Event type breakdown
- Latency heatmap

### Prometheus Metrics

```promql
# WebSocket connections
ai_ws_connections_total

# WebSocket events
rate(ai_ws_events_total[1m])

# Forecast latency
histogram_quantile(0.95, rate(ai_forecast_latency_seconds_bucket[5m]))

# Cache hit rate
sum(rate(ai_forecast_latency_seconds_count{cache_status="cache_hit"}[5m])) /
sum(rate(ai_forecast_latency_seconds_count[5m]))

# Feedback stream rate
ai_feedback_stream_rate
```

---

## Security

### Authentication

All WebSocket connections require:
1. **Valid JWT token** in handshake
2. **User role** verification
3. **2FA** (if enabled for user)

### Rate Limiting

- **100 events/minute** per client
- **Auto-disconnect** after 10 minutes idle
- **Exponential backoff** on reconnect

### Authorization

| Operation | Required Role |
|-----------|---------------|
| Subscribe to items | Any authenticated user |
| Subscribe to anomalies | Any authenticated user |
| Trigger retrain | Admin only (via REST API) |
| Tune policy | Admin only (via REST API) |

---

## Troubleshooting

### WebSocket Connection Fails

```bash
# Check if WebSocket server started
grep "WebSocket server initialized" logs/application.log

# Verify JWT token
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8083/api/auth/verify

# Check CORS settings
echo $CORS_ORIGIN
```

### High Forecast Latency

```bash
# Check cache hit rate
curl http://localhost:8083/metrics | grep ai_forecast_latency

# Clear Redis cache
redis-cli -a $REDIS_PASSWORD FLUSHDB

# Verify models loaded
curl http://localhost:8083/api/ai/forecast/stats
```

### Feedback Stream Stalled

```bash
# Check streaming status
grep "FeedbackStream" logs/application.log | tail -20

# Verify database connectivity
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM ai_feedback;"

# Restart stream
curl -X POST http://localhost:8083/api/admin/feedback-stream/restart \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Migration from v2.2.0

### Prerequisites

- Inventory Enterprise v2.2.0 deployed
- Node.js ≥18.0.0
- Redis running
- Socket.IO client library (if using custom frontend)

### Steps

1. **Install Dependencies**
   ```bash
   npm install socket.io chokidar
   ```

2. **Update Server Startup**
   ```javascript
   // server.js
   const realtimeAI = require('./server/websocket/RealtimeAI');
   const feedbackStream = require('./ai/streaming/FeedbackStream');
   const forecastWorker = require('./ai/workers/ForecastWorker');

   // After HTTP server starts
   realtimeAI.initialize(httpServer);
   await feedbackStream.start();
   await forecastWorker.start();
   ```

3. **Configure Environment**
   ```bash
   # Add to .env
   FEEDBACK_POLL_INTERVAL=5000
   FORECAST_CACHE_TTL=1800
   HOT_RELOAD_ENABLED=true
   ```

4. **Update Client Code**
   ```html
   <script src="/socket.io/socket.io.js"></script>
   <script>
     const socket = io('/ai/realtime', {
       auth: { token: localStorage.getItem('jwt_token') }
     });
   </script>
   ```

5. **Import Grafana Dashboard**
   - Dashboards → Import
   - Upload `grafana/AI-Realtime-Intelligence-2025-10-07.json`

6. **Test**
   ```bash
   # Start server
   npm start

   # In another terminal, test WebSocket
   node test-websocket-client.js
   ```

---

## API Reference

### REST Endpoints (New in v2.3.0)

```
GET  /api/ai/realtime/stats        - Get real-time system stats
GET  /api/ai/forecast/live/:itemCode - Get live forecast (REST fallback)
POST /api/ai/feedback-stream/restart - Restart feedback streaming (admin)
GET  /api/ai/forecast-worker/stats  - Get forecast worker stats
```

### WebSocket Events (Client → Server)

```
subscribe:item       - Subscribe to item updates
unsubscribe:item     - Unsubscribe from item
subscribe:anomalies  - Subscribe to all anomalies
request:stats        - Request current statistics
ping                 - Heartbeat ping
```

### WebSocket Events (Server → Client)

```
connected           - Connection established
subscribed          - Subscription confirmed
forecast:update     - Forecast generated
policy:update       - Policy changed
anomaly:alert       - Anomaly detected
feedback:ingested   - Feedback processed
model:retrained     - Model retrained
drift:detected      - Drift identified
disconnect_idle     - Disconnected due to inactivity
server:shutdown     - Server shutting down
```

---

## Best Practices

1. **Reconnection**: Implement exponential backoff (1s, 2s, 4s, 8s, max 30s)
2. **Event Handling**: Use debouncing for high-frequency events
3. **Subscriptions**: Subscribe only to needed items, not all
4. **Error Handling**: Listen for `error` and `disconnect` events
5. **Cleanup**: Unsubscribe when component unmounts
6. **Batching**: Buffer rapid events client-side before rendering

---

## Changelog

See `CHANGELOG.md` for full release notes.

**v2.3.0-2025-10-07**:
- Added WebSocket real-time streaming
- Implemented hot-reload forecast worker
- Added streaming feedback bridge
- Extended Prometheus metrics (4 new)
- Created Grafana real-time dashboard

---

## Support

- **Documentation**: https://docs.neuro-pilot.ai/realtime
- **Issues**: https://github.com/neuro-pilot-ai/inventory-enterprise/issues
- **Slack**: #inventory-enterprise-support

---

**End of Guide**
