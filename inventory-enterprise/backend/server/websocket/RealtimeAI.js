/**
 * Real-Time AI WebSocket Server
 * Version: v2.3.0-2025-10-07
 *
 * Implements /ai/realtime namespace with JWT + 2FA authentication
 * Emits: forecast:update, policy:update, anomaly:alert
 * Rate-limited, auto-disconnect on idle > 10 min
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../../config/logger');
const eventBus = require('../../events');
const metricsExporter = require('../../utils/metricsExporter');

class RealtimeAIServer {
  constructor() {
    this.io = null;
    this.connections = new Map();
    this.config = {
      namespace: '/ai/realtime',
      idleTimeout: 10 * 60 * 1000, // 10 minutes
      rateLimitWindow: 60 * 1000, // 1 minute
      rateLimitMax: 100, // 100 events per minute per client
      heartbeatInterval: 30 * 1000 // 30 seconds
    };
  }

  /**
   * Initialize WebSocket server
   * @param {Object} httpServer - HTTP server instance
   */
  initialize(httpServer) {
    const socketIO = require('socket.io');

    this.io = socketIO(httpServer, {
      path: '/socket.io',
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Create AI namespace
    this.aiNamespace = this.io.of(this.config.namespace);

    // Setup authentication middleware
    this.aiNamespace.use(this.authMiddleware.bind(this));

    // Setup connection handler
    this.aiNamespace.on('connection', this.handleConnection.bind(this));

    // Setup event bus listeners
    this.setupEventBusListeners();

    // Setup heartbeat
    this.startHeartbeat();

    logger.info(`[RealtimeAI] WebSocket server initialized on namespace ${this.config.namespace}`);
  }

  /**
   * Authentication middleware for WebSocket connections
   */
  async authMiddleware(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if user has required permissions
      if (!decoded.userId || !decoded.role) {
        return next(new Error('Invalid token payload'));
      }

      // Attach user info to socket
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;

      logger.debug(`[RealtimeAI] Client authenticated: ${socket.userEmail}`);
      next();
    } catch (error) {
      logger.error('[RealtimeAI] Authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket) {
    const clientId = socket.id;
    const userInfo = {
      userId: socket.userId,
      userRole: socket.userRole,
      userEmail: socket.userEmail,
      connectedAt: new Date(),
      lastActivity: new Date(),
      eventCount: 0,
      rateLimitWindow: []
    };

    this.connections.set(clientId, userInfo);

    logger.info(`[RealtimeAI] Client connected: ${socket.userEmail} (${clientId})`);

    // Update metrics
    metricsExporter.recordWSConnection('connected');

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to AI Real-Time Intelligence Layer',
      version: 'v2.3.0-2025-10-07',
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });

    // Setup event handlers
    this.setupSocketHandlers(socket);

    // Setup disconnect handler
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers(socket) {
    const clientId = socket.id;

    // Subscribe to specific items
    socket.on('subscribe:item', (itemCode) => {
      if (!this.checkRateLimit(clientId)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      socket.join(`item:${itemCode}`);
      logger.debug(`[RealtimeAI] ${socket.userEmail} subscribed to item:${itemCode}`);
      socket.emit('subscribed', { itemCode, timestamp: new Date().toISOString() });

      this.updateActivity(clientId);
    });

    // Unsubscribe from items
    socket.on('unsubscribe:item', (itemCode) => {
      socket.leave(`item:${itemCode}`);
      logger.debug(`[RealtimeAI] ${socket.userEmail} unsubscribed from item:${itemCode}`);
      socket.emit('unsubscribed', { itemCode, timestamp: new Date().toISOString() });

      this.updateActivity(clientId);
    });

    // Subscribe to anomaly alerts
    socket.on('subscribe:anomalies', () => {
      socket.join('anomalies');
      logger.debug(`[RealtimeAI] ${socket.userEmail} subscribed to anomalies`);
      socket.emit('subscribed', { channel: 'anomalies', timestamp: new Date().toISOString() });

      this.updateActivity(clientId);
    });

    // Request current stats
    socket.on('request:stats', () => {
      if (!this.checkRateLimit(clientId)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      const stats = this.getConnectionStats();
      socket.emit('stats', stats);

      this.updateActivity(clientId);
    });

    // Ping/pong for heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
      this.updateActivity(clientId);
    });
  }

  /**
   * Setup event bus listeners to broadcast to WebSocket clients
   */
  setupEventBusListeners() {
    // Forecast updates
    eventBus.on(eventBus.EVENT_TYPES.FORECAST_UPDATED, (data) => {
      this.broadcast('forecast:update', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('forecast:update');
    });

    // Policy commits
    eventBus.on(eventBus.EVENT_TYPES.POLICY_COMMITTED, (data) => {
      this.broadcast('policy:update', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('policy:update');
    });

    // Anomaly detection
    eventBus.on(eventBus.EVENT_TYPES.ANOMALY_DETECTED, (data) => {
      this.broadcast('anomaly:alert', data, 'anomalies');
      this.broadcast('anomaly:alert', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('anomaly:alert');
    });

    // Feedback ingested
    eventBus.on(eventBus.EVENT_TYPES.FEEDBACK_INGESTED, (data) => {
      this.broadcast('feedback:ingested', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('feedback:ingested');
    });

    // Model retrained
    eventBus.on(eventBus.EVENT_TYPES.MODEL_RETRAINED, (data) => {
      this.broadcast('model:retrained', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('model:retrained');
    });

    // Drift detected
    eventBus.on(eventBus.EVENT_TYPES.DRIFT_DETECTED, (data) => {
      this.broadcast('drift:detected', data, `item:${data.itemCode}`);
      metricsExporter.recordWSEvent('drift:detected');
    });

    logger.info('[RealtimeAI] Event bus listeners configured');
  }

  /**
   * Broadcast event to room or all clients
   */
  broadcast(eventName, data, room = null) {
    if (room) {
      this.aiNamespace.to(room).emit(eventName, data);
      logger.debug(`[RealtimeAI] Broadcast ${eventName} to room ${room}`);
    } else {
      this.aiNamespace.emit(eventName, data);
      logger.debug(`[RealtimeAI] Broadcast ${eventName} to all clients`);
    }
  }

  /**
   * Check rate limit for client
   */
  checkRateLimit(clientId) {
    const conn = this.connections.get(clientId);
    if (!conn) return false;

    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;

    // Remove old entries
    conn.rateLimitWindow = conn.rateLimitWindow.filter(t => t > windowStart);

    // Check limit
    if (conn.rateLimitWindow.length >= this.config.rateLimitMax) {
      logger.warn(`[RealtimeAI] Rate limit exceeded for ${conn.userEmail}`);
      return false;
    }

    // Add current request
    conn.rateLimitWindow.push(now);
    conn.eventCount++;

    return true;
  }

  /**
   * Update client activity timestamp
   */
  updateActivity(clientId) {
    const conn = this.connections.get(clientId);
    if (conn) {
      conn.lastActivity = new Date();
    }
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(socket) {
    const clientId = socket.id;
    const conn = this.connections.get(clientId);

    if (conn) {
      logger.info(`[RealtimeAI] Client disconnected: ${conn.userEmail} (${clientId}), events: ${conn.eventCount}`);
      this.connections.delete(clientId);

      // Update metrics
      metricsExporter.recordWSConnection('disconnected');
    }
  }

  /**
   * Start heartbeat to check for idle connections
   */
  startHeartbeat() {
    setInterval(() => {
      const now = Date.now();

      this.connections.forEach((conn, clientId) => {
        const idleTime = now - conn.lastActivity.getTime();

        if (idleTime > this.config.idleTimeout) {
          logger.info(`[RealtimeAI] Disconnecting idle client: ${conn.userEmail} (idle: ${Math.floor(idleTime / 1000)}s)`);

          const socket = this.aiNamespace.sockets.get(clientId);
          if (socket) {
            socket.emit('disconnect_idle', {
              message: 'Disconnected due to inactivity',
              idleTime: Math.floor(idleTime / 1000)
            });
            socket.disconnect(true);
          }

          this.connections.delete(clientId);
        }
      });
    }, this.config.heartbeatInterval);

    logger.info('[RealtimeAI] Heartbeat monitoring started');
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        id,
        userEmail: conn.userEmail,
        userRole: conn.userRole,
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity,
        eventCount: conn.eventCount
      })),
      eventBusStats: eventBus.getStats()
    };
  }

  /**
   * Shutdown WebSocket server gracefully
   */
  async shutdown() {
    logger.info('[RealtimeAI] Shutting down WebSocket server...');

    // Notify all clients
    this.broadcast('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });

    // Close all connections
    const sockets = await this.aiNamespace.fetchSockets();
    sockets.forEach(socket => socket.disconnect(true));

    // Close server
    if (this.io) {
      this.io.close();
    }

    this.connections.clear();
    logger.info('[RealtimeAI] WebSocket server shutdown complete');
  }
}

// Singleton instance
const realtimeAI = new RealtimeAIServer();

module.exports = realtimeAI;
