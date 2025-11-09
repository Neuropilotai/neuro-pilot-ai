#!/usr/bin/env node
// GROUP7 - Nightly Learning Loop
import 'dotenv/config';
import { execSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  mkdirSync('Production/logs/learning', { recursive: true });
  appendFileSync('Production/logs/learning/loop.log', entry);
  console.log(message);
}

async function runLearningLoop() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 GROUP7 AUTONOMOUS LEARNING LOOP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Step 1: Analyze performance
    log('▶ Step 1: Analyzing performance metrics...');
    execSync('node ops/learning/analyze-performance.mjs', { stdio: 'inherit' });
    log('✅ Analysis complete');
    
    // Step 2: Adapt prompts
    log('\n▶ Step 2: Adapting prompts based on insights...');
    execSync('node ops/learning/adapt-prompts.mjs', { stdio: 'inherit' });
    log('✅ Prompts adapted');
    
    // Step 3: Commit changes (optional - requires git configured)
    const shouldCommit = process.env.AUTO_COMMIT === 'true';
    if (shouldCommit) {
      log('\n▶ Step 3: Committing learned optimizations...');
      try {
        execSync('git add Production/logs/learning/*.json', { stdio: 'pipe' });
        execSync('git commit -m "chore: nightly learning loop - optimized prompts" || true', { stdio: 'pipe' });
        log('✅ Changes committed');
        
        if (process.env.AUTO_PUSH === 'true') {
          execSync('git push || true', { stdio: 'pipe' });
          log('✅ Changes pushed to remote');
        }
      } catch (error) {
        log(`⚠️  Git operations failed: ${error.message}`);
      }
    } else {
      log('\n⏭️  Step 3: Auto-commit disabled (set AUTO_COMMIT=true to enable)');
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ LEARNING LOOP COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Next steps:');
    console.log('  1. Review: Production/logs/learning/analysis_latest.json');
    console.log('  2. Review: Production/logs/learning/adapted_prompts.json');
    console.log('  3. Run: npm run run:one with new optimized scripts');
    console.log('');
    
    log('🎉 Learning loop completed successfully');
    
  } catch (error) {
    log(`❌ Learning loop failed: ${error.message}`);
    throw error;
  }
}

runLearningLoop()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ LOOP FAILED:', err.message);
    process.exit(1);
  });
