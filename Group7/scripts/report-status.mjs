#!/usr/bin/env node
// GROUP7 - Status Reporter
import 'dotenv/config';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { httpWithRetry } from './poll-utils.mjs';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_SYSTEM_DB = process.env.NOTION_SYSTEM_DB_ID;

async function gatherMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    last_24h: {
      videos_produced: 0,
      videos_succeeded: 0,
      videos_failed: 0,
      avg_processing_time: 0,
      total_cost: 0
    },
    system_health: {},
    storage: {},
    performance: {}
  };

  try {
    const logFile = 'Production/logs/video_runs.jsonl';
    const lines = readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    const last24h = lines.slice(-100);
    
    metrics.last_24h.videos_produced = last24h.length;
    last24h.forEach(line => {
      try {
        const log = JSON.parse(line);
        if (log.message.includes('completed successfully')) {
          metrics.last_24h.videos_succeeded++;
        } else if (log.message.includes('Error')) {
          metrics.last_24h.videos_failed++;
        }
      } catch {}
    });
  } catch (error) {
    console.warn('Could not read video logs');
  }

  try {
    const heartbeat = JSON.parse(readFileSync('Production/logs/monitoring/heartbeat_latest.json', 'utf-8'));
    metrics.system_health = {
      all_healthy: heartbeat.allHealthy,
      services: heartbeat.results.map(r => ({ service: r.service, status: r.status, latency: r.latency_ms }))
    };
  } catch {}

  try {
    const videoDir = 'Production/Video';
    const files = readdirSync(videoDir);
    const totalSize = files.reduce((sum, f) => {
      try {
        return sum + statSync(join(videoDir, f)).size;
      } catch {
        return sum;
      }
    }, 0);
    
    metrics.storage = {
      video_count: files.length,
      total_size_mb: (totalSize / 1024 / 1024).toFixed(2)
    };
  } catch {}

  const successRate = metrics.last_24h.videos_produced > 0 
    ? (metrics.last_24h.videos_succeeded / metrics.last_24h.videos_produced * 100).toFixed(1)
    : 0;

  metrics.performance = {
    success_rate: `${successRate}%`,
    uptime: metrics.system_health.all_healthy ? '100%' : 'Degraded'
  };

  return metrics;
}

async function logToNotion(metrics) {
  if (!NOTION_SYSTEM_DB) {
    console.log('⚠️  NOTION_SYSTEM_DB_ID not set - skipping Notion log');
    return null;
  }

  const properties = {
    'Name': { title: [{ text: { content: `System Report ${new Date().toLocaleDateString()}` } }] },
    'Videos Produced': { number: metrics.last_24h.videos_produced },
    'Success Rate': { rich_text: [{ text: { content: metrics.performance.success_rate } }] },
    'System Health': { select: { name: metrics.system_health.all_healthy ? 'Healthy' : 'Degraded' } },
    'Created': { date: { start: metrics.timestamp } }
  };

  const response = await httpWithRetry('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_SYSTEM_DB },
      properties
    })
  });

  return response.json();
}

async function generateReport() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 GROUP7 STATUS REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const metrics = await gatherMetrics();
  
  console.log('\n📹 Last 24 Hours:');
  console.log(`   Videos Produced: ${metrics.last_24h.videos_produced}`);
  console.log(`   Succeeded: ${metrics.last_24h.videos_succeeded}`);
  console.log(`   Failed: ${metrics.last_24h.videos_failed}`);
  
  console.log('\n💓 System Health:');
  if (metrics.system_health.services) {
    metrics.system_health.services.forEach(s => {
      const icon = s.status === 'healthy' ? '✅' : '⚠️';
      console.log(`   ${icon} ${s.service}: ${s.status} (${s.latency}ms)`);
    });
  }
  
  console.log('\n💾 Storage:');
  console.log(`   Video Count: ${metrics.storage.video_count || 0}`);
  console.log(`   Total Size: ${metrics.storage.total_size_mb || 0} MB`);
  
  console.log('\n📈 Performance:');
  console.log(`   Success Rate: ${metrics.performance.success_rate}`);
  console.log(`   System Uptime: ${metrics.performance.uptime}`);
  
  console.log('\n✅ Report saved: Production/logs/monitoring/status_report_latest.json');
  
  const fs = await import('fs/promises');
  await fs.mkdir('Production/logs/monitoring', { recursive: true });
  await fs.writeFile(
    'Production/logs/monitoring/status_report_latest.json',
    JSON.stringify(metrics, null, 2)
  );

  try {
    await logToNotion(metrics);
    console.log('✅ Report logged to Notion');
  } catch (error) {
    console.log('⚠️  Notion logging skipped:', error.message);
  }

  return metrics;
}

generateReport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Report failed:', err.message);
    process.exit(1);
  });
