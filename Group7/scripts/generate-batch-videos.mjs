#!/usr/bin/env node
/**
 * Generate batch videos from a scripts JSON file
 * Usage: node scripts/generate-batch-videos.mjs Production/Inputs/GROUP7_Daily_20251103.json
 */

import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const scriptFile = process.argv[2] || 'Production/Inputs/GROUP7_Daily_20251103.json';

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎬 GROUP7 BATCH VIDEO GENERATOR`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

try {
  const scripts = JSON.parse(await fs.readFile(scriptFile, 'utf-8'));
  console.log(`📋 Loaded ${scripts.length} scripts from: ${scriptFile}\n`);

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const num = i + 1;

    console.log(`\n▶ Generating video ${num}/${scripts.length}: ${script.id}`);
    console.log(`  Agent: ${script.agent}`);
    console.log(`  Hook: ${script.hook}`);

    const cmd = `node ops/run-one-did.mjs \
      --agent="${script.agent}" \
      --slug="${script.id}" \
      --hook="${script.hook}" \
      --insight="${script.insight}" \
      --cta="${script.cta}" \
      --did-tts`;

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
      console.log(`✅ Video ${num} complete`);
      if (stderr) console.warn(`  Warning: ${stderr.substring(0, 100)}`);
    } catch (error) {
      console.error(`❌ Video ${num} failed: ${error.message}`);
    }

    // Small delay between videos
    if (i < scripts.length - 1) {
      console.log(`  ⏳ Waiting 3 seconds before next video...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ BATCH COMPLETE!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📁 Videos saved to: Production/Video/`);
  console.log(`📊 Logs saved to: Production/logs/\n`);

} catch (error) {
  console.error(`\n❌ Batch generation failed: ${error.message}\n`);
  process.exit(1);
}
