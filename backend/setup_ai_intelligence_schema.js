#!/usr/bin/env node

/**
 * AI Intelligence Layer - Database Schema Setup
 * Creates tables for adaptive learning, pattern detection, and insights
 */

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/enterprise_inventory.db');

console.log('\n🧠 Setting up AI Intelligence Layer Schema\n');

db.serialize(() => {
  // Learning data - Stores patterns from user behavior
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_learning_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      pattern_type TEXT NOT NULL, -- 'consumption', 'variance', 'lead_time', 'reorder'
      pattern_data TEXT NOT NULL, -- JSON data
      confidence_score REAL DEFAULT 0.5,
      accuracy_rate REAL DEFAULT 0.0,
      sample_size INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating ai_learning_data:', err);
    else console.log('✅ ai_learning_data table ready');
  });

  // Variance insights - Root cause analysis
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_variance_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      count_date TEXT NOT NULL,
      variance_amount REAL NOT NULL,
      detected_cause TEXT, -- 'theft', 'wrong_unit', 'over_portioning', 'spoilage', 'receiving_error'
      confidence REAL DEFAULT 0.0,
      evidence TEXT, -- JSON array of evidence items
      corrective_action TEXT,
      status TEXT DEFAULT 'detected', -- 'detected', 'investigating', 'resolved'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating ai_variance_insights:', err);
    else console.log('✅ ai_variance_insights table ready');
  });

  // Reorder optimization - RL policy data
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_reorder_policy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL UNIQUE,
      reorder_point INTEGER NOT NULL,
      reorder_quantity INTEGER NOT NULL,
      safety_stock INTEGER NOT NULL,
      lead_time_days INTEGER NOT NULL,
      avg_daily_consumption REAL NOT NULL,
      variance_consumption REAL NOT NULL,
      service_level_target REAL DEFAULT 0.95,
      cost_per_unit REAL DEFAULT 0.0,
      holding_cost_rate REAL DEFAULT 0.02,
      stockout_cost REAL DEFAULT 0.0,
      total_reward REAL DEFAULT 0.0, -- RL cumulative reward
      policy_version INTEGER DEFAULT 1,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating ai_reorder_policy:', err);
    else console.log('✅ ai_reorder_policy table ready');
  });

  // Consumption tracking - For learning patterns
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_consumption_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      consumption_date TEXT NOT NULL,
      quantity_consumed REAL NOT NULL,
      location TEXT,
      temperature REAL,
      day_of_week INTEGER, -- 0-6
      week_of_year INTEGER,
      is_holiday INTEGER DEFAULT 0,
      guest_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating ai_consumption_history:', err);
    else console.log('✅ ai_consumption_history table ready');
  });

  // Query logs - For natural language interface
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      query_text TEXT NOT NULL,
      language TEXT DEFAULT 'en', -- 'en', 'fr'
      intent TEXT, -- 'variance_analysis', 'shortage_cause', 'forecast', 'recommendation'
      extracted_entities TEXT, -- JSON: item codes, dates, locations
      response_text TEXT,
      confidence REAL DEFAULT 0.0,
      was_helpful INTEGER, -- User feedback: 1=yes, 0=no, NULL=unknown
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating ai_query_log:', err);
    else console.log('✅ ai_query_log table ready');
  });

  // Anomaly detection
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anomaly_type TEXT NOT NULL, -- 'sudden_spike', 'unusual_drop', 'pattern_break', 'price_anomaly'
      item_code TEXT,
      location TEXT,
      detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
      severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
      description TEXT,
      expected_value REAL,
      actual_value REAL,
      deviation_score REAL,
      auto_resolved INTEGER DEFAULT 0,
      resolution_notes TEXT,
      resolved_at TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating ai_anomalies:', err);
    else console.log('✅ ai_anomalies table ready');
  });

  // Agent actions log - Track what the AI does
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_agent_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL, -- 'reorder_adjust', 'variance_flag', 'forecast_update', 'alert_sent'
      item_code TEXT,
      action_data TEXT, -- JSON with details
      reasoning TEXT,
      confidence REAL DEFAULT 0.0,
      outcome TEXT, -- 'success', 'failed', 'pending'
      impact_metric REAL, -- Cost saved or value added
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating ai_agent_actions:', err);
    else console.log('✅ ai_agent_actions table ready');
  });

  // Create indexes for performance
  db.run('CREATE INDEX IF NOT EXISTS idx_learning_item ON ai_learning_data(item_code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_variance_item ON ai_variance_insights(item_code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_consumption_item ON ai_consumption_history(item_code, consumption_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_anomaly_type ON ai_anomalies(anomaly_type, detected_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_agent_actions ON ai_agent_actions(action_type, created_at)');

  console.log('\n✅ AI Intelligence Layer schema created successfully\n');
  console.log('Tables created:');
  console.log('  • ai_learning_data - Pattern storage');
  console.log('  • ai_variance_insights - Root cause analysis');
  console.log('  • ai_reorder_policy - RL optimization');
  console.log('  • ai_consumption_history - Consumption tracking');
  console.log('  • ai_query_log - Natural language queries');
  console.log('  • ai_anomalies - Anomaly detection');
  console.log('  • ai_agent_actions - Agent action log\n');

  db.close();
});
