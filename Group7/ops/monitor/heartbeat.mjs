#!/usr/bin/env node
// GROUP7 - System Heartbeat Monitor
import 'dotenv/config';

const ENDPOINTS = {
  elevenlabs: 'https://api.elevenlabs.io/v1/voices',
  canva: 'https://api.canva.com/rest/v1/users/me',
  cloudconvert: 'https://api.cloudconvert.com/v2/users/me',
  notion: 'https://api.notion.com/v1/users/me',
  metricool: 'https://api.metricool.com/v1/profile'
};

async function checkEndpoint(name, url, headers) {
  const start = Date.now();
  
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const latency = Date.now() - start;
    const status = response.ok ? 'healthy' : 'degraded';
    
    return {
      service: name,
      status,
      latency_ms: latency,
      http_status: response.status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      service: name,
      status: 'down',
      latency_ms: Date.now() - start,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function runHeartbeat() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💓 GROUP7 SYSTEM HEARTBEAT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log();

  const checks = [
    checkEndpoint('ElevenLabs', ENDPOINTS.elevenlabs, { 'xi-api-key': process.env.ELEVENLABS_API_KEY }),
    checkEndpoint('Canva', ENDPOINTS.canva, { 'Authorization': `Bearer ${process.env.CANVA_ACCESS_TOKEN}` }),
    checkEndpoint('CloudConvert', ENDPOINTS.cloudconvert, { 'Authorization': `Bearer ${process.env.CLOUDCONVERT_API_KEY}` }),
    checkEndpoint('Notion', ENDPOINTS.notion, { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }),
    checkEndpoint('Metricool', ENDPOINTS.metricool, { 'Authorization': `Bearer ${process.env.METRICOOL_API_KEY}` })
  ];

  const results = await Promise.all(checks);

  console.log('Service Health:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let allHealthy = true;
  
  results.forEach(r => {
    const icon = r.status === 'healthy' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌';
    const latency = r.latency_ms < 1000 ? `${r.latency_ms}ms` : `${(r.latency_ms / 1000).toFixed(2)}s`;
    console.log(`${icon} ${r.service.padEnd(15)} ${r.status.padEnd(10)} Latency: ${latency}`);
    
    if (r.status !== 'healthy') {
      allHealthy = false;
      if (r.error) console.log(`   Error: ${r.error}`);
    }
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (allHealthy) {
    console.log('✅ All systems operational');
  } else {
    console.log('⚠️  Some services degraded or down');
  }

  const fs = await import('fs/promises');
  await fs.mkdir('Production/logs/monitoring', { recursive: true });
  await fs.writeFile(
    'Production/logs/monitoring/heartbeat_latest.json',
    JSON.stringify({ timestamp: new Date().toISOString(), results, allHealthy }, null, 2)
  );

  return { allHealthy, results };
}

runHeartbeat()
  .then(({ allHealthy }) => process.exit(allHealthy ? 0 : 1))
  .catch(err => {
    console.error('❌ Heartbeat failed:', err.message);
    process.exit(1);
  });
