import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

const WS_URL = import.meta.env.VITE_WS_URL || '';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.warn('No auth token found, skipping WebSocket connection');
      return;
    }

    this.socket = io(`${WS_URL}/ai/realtime`, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      toast.success('Real-time connection established', { icon: '🔗' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect manually
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        toast.error('Failed to establish real-time connection');
      }
    });

    // Listen for AI events
    this.socket.on('forecast:update', (data) => {
      this.emit('forecast:update', data);
    });

    this.socket.on('policy:update', (data) => {
      this.emit('policy:update', data);
    });

    this.socket.on('anomaly:alert', (data) => {
      this.emit('anomaly:alert', data);
      toast.error(`Anomaly detected: ${data.itemCode}`, {
        icon: '⚠️',
        duration: 6000,
      });
    });

    this.socket.on('feedback:ingested', (data) => {
      this.emit('feedback:ingested', data);
    });

    this.socket.on('model:retrained', (data) => {
      this.emit('model:retrained', data);
      toast.success(`Model retrained for ${data.itemCode}`, {
        icon: '🔄',
      });
    });

    this.socket.on('drift:detected', (data) => {
      this.emit('drift:detected', data);
      toast.warning(`Drift detected: ${data.itemCode}`, {
        icon: '📊',
        duration: 6000,
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  subscribe(itemCode) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe:item', { itemCode });
    }
  }

  unsubscribe(itemCode) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('unsubscribe:item', { itemCode });
    }
  }

  subscribeAnomalies() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe:anomalies');
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}

export const websocket = new WebSocketService();
export default websocket;
