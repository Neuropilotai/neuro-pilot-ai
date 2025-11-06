/**
 * Minimal Railway Server for Staging
 * Lightweight version without AI/Redis/WebSocket dependencies
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health endpoint (Railway healthcheck)
app.get('/api/health/status', (req, res) => {
  res.json({
    success: true,
    data: {
      service: "inventory-backend-staging",
      status: "operational",
      version: "16.5.0-minimal",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// Legacy health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "inventory-backend-staging",
    version: "16.5.0-minimal"
  });
});

// Basic items API endpoint
app.get('/api/items', (req, res) => {
  res.json({
    success: true,
    data: [],
    message: "Minimal staging server - full features available in production"
  });
});

// Basic inventory endpoint
app.get('/api/inventory/summary', (req, res) => {
  res.json({
    success: true,
    data: {
      total_items: 0,
      message: "Minimal staging server - database integration pending"
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: "NeuroInnovate Inventory Backend - Staging",
    version: "16.5.0-minimal",
    status: "operational",
    endpoints: [
      "GET /api/health/status",
      "GET /api/health",
      "GET /api/items",
      "GET /api/inventory/summary"
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path,
    message: "This is a minimal staging server. Full API available in production."
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Minimal Inventory Backend Staging Server`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health endpoint: /api/health/status`);
});
