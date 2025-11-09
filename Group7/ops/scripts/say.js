#!/usr/bin/env node
/**
 * Group7 Local TTS CLI
 * Usage: node ops/scripts/say.js "<text>" config/voices/lyra7.voice.json
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not set in .env');
  process.exit(1);
}

const [, , text, profilePath] = process.argv;

if (!text || !profilePath) {
  console.error('Usage: node ops/scripts/say.js "<text>" config/voices/lyra7.voice.json');
  process.exit(1);
}

// Load voice profile
let profile;
try {
  const fullPath = path.resolve(process.cwd(), profilePath);
  profile = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  console.log(`✅ Loaded profile: ${profile.agent} (${profile.voice_id})`);
} catch (err) {
  console.error(`❌ Failed to load profile: ${err.message}`);
  process.exit(1);
}

// Get voice ID from env override or profile
const agentKey = profile.agent.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const voiceId = process.env[`ELEVENLABS_VOICE_ID_${agentKey}`] || profile.voice_id;

const payload = JSON.stringify({
  text,
  model_id: profile.model_id,
  voice_settings: profile.settings,
  output_format: profile.output_format,
  request_id: `local_${Date.now()}`
});

const options = {
  hostname: 'api.elevenlabs.io',
  port: 443,
  path: `/v1/text-to-speech/${voiceId}/stream`,
  method: 'POST',
  headers: {
    'xi-api-key': API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

function attempt(retries) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode === 429 || (res.statusCode >= 500 && res.statusCode < 600)) {
        if (retries > 0) {
          console.warn(`⚠️  HTTP ${res.statusCode}, retrying... (${retries} left)`);
          setTimeout(() => attempt(retries - 1).then(resolve).catch(reject), 2000);
          return;
        }
      }

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outDir = path.resolve(process.cwd(), 'out');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const outFile = path.join(outDir, `VOICE_${timestamp}.mp3`);
      const writeStream = fs.createWriteStream(outFile);

      res.pipe(writeStream);

      writeStream.on('finish', () => {
        const size = fs.statSync(outFile).size;
        console.log(`✅ Generated: ${path.relative(process.cwd(), outFile)} (${size} bytes)`);
        resolve(outFile);
      });

      writeStream.on('error', reject);
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

console.log(`🎙️  Synthesizing with ${profile.agent}...`);
attempt(2)
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  });
