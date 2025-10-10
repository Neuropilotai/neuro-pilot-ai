const CacheOptimizerV2 = require('../v5_addons/cache_optimizer');
const AIOptimizerRL = require('../v5_addons/ai_optimizer_rl');
const ComplianceEngine = require('../v5_addons/compliance_engine');

async function runBenchmarks() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  NeuroInnovate v5 Performance Benchmarks');
  console.log('═══════════════════════════════════════════════════\n');

  // Cache Performance
  const cache = new CacheOptimizerV2();

  // Warm up cache
  for (let i = 0; i < 100; i++) {
    await cache.set('inventory', `item_${i}`, { name: `Item ${i}`, qty: i });
  }

  // Benchmark cache operations
  const cacheStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await cache.get('inventory', `item_${i}`);
  }
  const cacheDuration = Date.now() - cacheStart;
  const cacheStats = cache.getStats();

  console.log('📊 Cache Performance:');
  console.log(`  Operations: 100 reads`);
  console.log(`  Total Time: ${cacheDuration}ms`);
  console.log(`  Avg Time per Operation: ${(cacheDuration / 100).toFixed(2)}ms`);
  console.log(`  Hit Rate: ${cacheStats.global.hitRate}%`);
  console.log(`  p95 Response Time: ${cacheStats.performance.p95 || 'N/A'}ms\n`);

  // AI Optimizer Performance
  const ai = new AIOptimizerRL();
  await ai.initialize();

  const aiStart = Date.now();
  for (let i = 0; i < 10; i++) {
    ai.calculateReward(100, 95 + Math.random() * 10);
  }
  const aiDuration = Date.now() - aiStart;

  console.log('🧠 AI Optimizer Performance:');
  console.log(`  Reward Calculations: 10`);
  console.log(`  Total Time: ${aiDuration}ms`);
  console.log(`  Avg Time per Calc: ${(aiDuration / 10).toFixed(2)}ms\n`);

  // Compliance Engine Performance
  const compliance = new ComplianceEngine();

  const compStart = Date.now();
  const score = await compliance.calculateScore();
  const compDuration = Date.now() - compStart;

  console.log('🛡️  Compliance Engine Performance:');
  console.log(`  Checks Completed: ${score.checks.length}`);
  console.log(`  Total Time: ${compDuration}ms`);
  console.log(`  Compliance Score: ${score.score}/100 (Grade ${score.grade})`);
  console.log(`  SOC2 Compliant: ${score.meetsSOC2 ? '✅' : '❌'}\n`);

  console.log('═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Cache p95: ${cacheStats.performance.p95 || '<1'}ms ${cacheStats.performance.meetsTarget ? '✅ <40ms target' : ''}`);
  console.log(`  AI Optimizer: ${(aiDuration / 10).toFixed(2)}ms avg`);
  console.log(`  Compliance: ${compDuration}ms (${score.checks.length} checks)\n`);

  cache.destroy();
  ai.close();
}

runBenchmarks().then(() => process.exit(0)).catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
