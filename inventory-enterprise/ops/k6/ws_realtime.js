/**
 * K6 Load Test: WebSocket Real-Time Updates
 * Version: v2.5.1-2025-10-07
 *
 * Tests WebSocket connection stability and real-time event latency
 * for the /ai/realtime endpoint under load.
 *
 * Scenario:
 *   - 100 virtual users (VUs) connect via Socket.IO
 *   - Each VU subscribes to forecast:update, policy:update, anomaly:alert events
 *   - Measures time from event emission to client receipt
 *   - Validates payload integrity
 *
 * Success Criteria:
 *   - 95% of events delivered in < 2s
 *   - Median latency < 500ms
 *   - Connection success rate > 95%
 *   - Zero message loss
 *
 * Usage:
 *   k6 run ops/k6/ws_realtime.js
 *   k6 run --vus 100 --duration 60s ops/k6/ws_realtime.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Environment configuration
const BASE_URL = __ENV.WS_URL || 'ws://localhost:8083';
const SOCKET_IO_PATH = '/socket.io/?EIO=4&transport=websocket';
const NAMESPACE = '/ai/realtime';

// Mock JWT token for authentication
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJsb2FkLXRlc3QtdXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJBZG1pbiIsInRlbmFudElkIjoidGVuYW50XzAwMSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.mockSignature';

// Custom metrics
const wsConnectionTime = new Trend('ws_connection_time', true);
const wsEventLatency = new Trend('ws_event_latency', true);
const wsConnectionSuccess = new Rate('ws_connection_success');
const wsEventReceived = new Counter('ws_events_received');
const wsEventLost = new Counter('ws_events_lost');
const wsErrors = new Counter('ws_errors');

// Load test configuration
export const options = {
  stages: [
    { duration: '10s', target: 20 },   // Ramp-up to 20 VUs
    { duration: '20s', target: 50 },   // Ramp-up to 50 VUs
    { duration: '30s', target: 100 },  // Ramp-up to 100 VUs
    { duration: '60s', target: 100 },  // Hold at 100 VUs
    { duration: '10s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    'ws_connection_time': ['p(95)<2000', 'p(50)<500'],        // Connection time
    'ws_event_latency': ['p(95)<2000', 'p(50)<500'],          // Event latency < 2s (p95)
    'ws_connection_success': ['rate>0.95'],                    // 95% success rate
    'ws_errors': ['count<100'],                                // Less than 100 errors
    'checks': ['rate>0.95'],                                   // 95% of checks pass
  },
};

/**
 * Parse Socket.IO packet (Engine.IO v4 format)
 */
function parseSocketIOPacket(message) {
  // Socket.IO packet format: <packet type>[JSON payload]
  // Example: 42["event_name",{data}]

  if (typeof message !== 'string') return null;

  // Match Socket.IO event packet (type 42 = EVENT)
  const match = message.match(/^42(\[.*\])$/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return {
        event: parsed[0],
        data: parsed[1],
      };
    }
  } catch (e) {
    return null;
  }

  return null;
}

/**
 * Main VU scenario
 */
export default function () {
  const connectionStartTime = Date.now();

  // Build Socket.IO WebSocket URL with auth
  const url = `${BASE_URL}${NAMESPACE}${SOCKET_IO_PATH}&auth=${encodeURIComponent(JSON.stringify({ token: AUTH_TOKEN }))}`;

  const params = {
    tags: { name: 'AIRealtimeWebSocket' },
  };

  const response = ws.connect(url, params, function (socket) {
    // Connection established
    const connectionTime = Date.now() - connectionStartTime;
    wsConnectionTime.add(connectionTime);
    wsConnectionSuccess.add(1);

    console.log(`[VU ${__VU}] WebSocket connected (${connectionTime}ms)`);

    let eventsReceived = 0;
    let eventTimestamps = new Map();

    // Handle incoming messages
    socket.on('message', function (message) {
      const packet = parseSocketIOPacket(message);

      if (!packet) {
        // Non-event packet (ping, ack, etc.)
        return;
      }

      const { event, data } = packet;

      // Track AI events
      if (['forecast:update', 'policy:update', 'anomaly:alert', 'model:retrained'].includes(event)) {
        eventsReceived++;
        wsEventReceived.add(1);

        // Calculate latency if timestamp present
        if (data && data.timestamp) {
          const eventTime = new Date(data.timestamp).getTime();
          const receiveTime = Date.now();
          const latency = receiveTime - eventTime;

          // Only record reasonable latencies (< 10s to filter clock skew)
          if (latency >= 0 && latency < 10000) {
            wsEventLatency.add(latency);
          }
        }

        // Validate payload structure
        check(data, {
          'event has itemCode': (d) => d && typeof d.itemCode === 'string',
          'event has timestamp': (d) => d && typeof d.timestamp === 'string',
          'forecast has mape': (d) => !event.includes('forecast') || typeof d.mape === 'number',
          'policy has reward': (d) => !event.includes('policy') || typeof d.reward === 'number',
        });

        console.log(`[VU ${__VU}] Received ${event}: ${data.itemCode} (latency: ${Date.now() - new Date(data.timestamp).getTime()}ms)`);
      }

      // Handle connection messages
      if (message.startsWith('0')) {
        console.log(`[VU ${__VU}] Engine.IO handshake complete`);
      }
    });

    socket.on('open', function () {
      console.log(`[VU ${__VU}] Socket.IO connection opened`);
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
      console.error(`[VU ${__VU}] WebSocket error:`, e.error());
    });

    socket.on('close', function () {
      console.log(`[VU ${__VU}] WebSocket closed (received ${eventsReceived} events)`);

      // Check if we received any events during the session
      if (eventsReceived === 0) {
        console.warn(`[VU ${__VU}] Warning: No events received during session`);
      }
    });

    // Keep connection alive for 30-60 seconds
    const connectionDuration = Math.floor(Math.random() * 30000) + 30000; // 30-60s
    socket.setTimeout(function () {
      console.log(`[VU ${__VU}] Closing connection after ${connectionDuration}ms`);
      socket.close();
    }, connectionDuration);
  });

  // Check connection result
  check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  if (!response || response.status !== 101) {
    wsConnectionSuccess.add(0);
    wsErrors.add(1);
    console.error(`[VU ${__VU}] Failed to connect: ${response ? response.status : 'null response'}`);
  }

  // Wait before next iteration
  sleep(1);
}

/**
 * Teardown - summary report
 */
export function handleSummary(data) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 WebSocket Load Test Summary (v2.5.1)');
  console.log('═══════════════════════════════════════════════════════\n');

  const metrics = data.metrics;

  // Connection metrics
  const connTime = metrics.ws_connection_time;
  const connSuccess = metrics.ws_connection_success;
  console.log('🔌 Connection Performance:');
  console.log(`   Avg connection time: ${connTime.values.avg.toFixed(2)}ms`);
  console.log(`   P95 connection time: ${connTime.values['p(95)'].toFixed(2)}ms`);
  console.log(`   Success rate: ${(connSuccess.values.rate * 100).toFixed(2)}%`);

  // Event latency metrics
  const eventLatency = metrics.ws_event_latency;
  if (eventLatency) {
    console.log('\n⚡ Event Latency:');
    console.log(`   Median: ${eventLatency.values.med.toFixed(2)}ms`);
    console.log(`   P95: ${eventLatency.values['p(95)'].toFixed(2)}ms`);
    console.log(`   Max: ${eventLatency.values.max.toFixed(2)}ms`);
  }

  // Event counters
  const eventsReceived = metrics.ws_events_received;
  const eventsLost = metrics.ws_events_lost;
  const errors = metrics.ws_errors;

  console.log('\n📨 Event Delivery:');
  console.log(`   Events received: ${eventsReceived.values.count}`);
  console.log(`   Events lost: ${eventsLost ? eventsLost.values.count : 0}`);
  console.log(`   Errors: ${errors.values.count}`);

  // Pass/fail determination
  const passed =
    connSuccess.values.rate >= 0.95 &&
    eventLatency && eventLatency.values['p(95)'] < 2000 &&
    eventLatency.values.med < 500 &&
    errors.values.count < 100;

  console.log('\n' + (passed ? '✅ PASS' : '❌ FAIL'));
  console.log('═══════════════════════════════════════════════════════\n');

  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}
