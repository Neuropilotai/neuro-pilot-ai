#!/usr/bin/env node
/**
 * Shotstack API Integration for Group7
 * Programmatic video rendering with polling
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY;
const SHOTSTACK_STAGE = process.env.SHOTSTACK_STAGE || 'v1';  // 'v1' for production, 'stage' for staging
const SHOTSTACK_BASE_URL = `https://api.shotstack.io/${SHOTSTACK_STAGE}`;

if (!SHOTSTACK_API_KEY) {
  console.error('❌ Missing SHOTSTACK_API_KEY in .env');
  process.exit(1);
}

/**
 * Submit render job to Shotstack
 * @param {Object} template - Shotstack timeline template
 * @param {Object} data - Variables to merge into template
 * @returns {Promise<string>} - Render ID
 */
export async function submitRender(template, data) {
  console.log('📤 Submitting render to Shotstack...');

  // Deep clone template to avoid mutation
  const processedTemplate = JSON.parse(JSON.stringify(template));

  // Replace all placeholders in the template JSON
  let templateString = JSON.stringify(processedTemplate);
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    const quotedPlaceholder = `"{{${key}}}"`;

    // For numeric values, replace quoted placeholder with unquoted value
    // For string values, keep the quotes
    if (typeof value === 'number') {
      templateString = templateString.replaceAll(quotedPlaceholder, String(value));
    } else {
      templateString = templateString.replaceAll(placeholder, String(value));
    }
  }
  const finalTemplate = JSON.parse(templateString);

  const payload = {
    timeline: finalTemplate.timeline,
    output: finalTemplate.output
  }

  const response = await fetch(`${SHOTSTACK_BASE_URL}/render`, {
    method: 'POST',
    headers: {
      'x-api-key': SHOTSTACK_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shotstack render submit failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result.success || !result.response?.id) {
    throw new Error(`Shotstack API returned invalid response: ${JSON.stringify(result)}`);
  }

  const renderId = result.response.id;
  console.log(`✅ Render submitted: ${renderId}`);

  return renderId;
}

/**
 * Poll render status until complete
 * @param {string} renderId - Render job ID
 * @param {number} maxWaitMs - Maximum wait time (default: 5 minutes)
 * @returns {Promise<Object>} - Render result with video URL
 */
export async function pollRenderStatus(renderId, maxWaitMs = 300000) {
  console.log(`⏳ Polling render status: ${renderId}`);

  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (true) {
    const elapsed = Date.now() - startTime;

    if (elapsed > maxWaitMs) {
      throw new Error(`Render timeout after ${maxWaitMs / 1000}s`);
    }

    const response = await fetch(`${SHOTSTACK_BASE_URL}/render/${renderId}`, {
      headers: {
        'x-api-key': SHOTSTACK_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shotstack status check failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const status = result.response?.status;
    const url = result.response?.url;

    console.log(`   Status: ${status} (${Math.floor(elapsed / 1000)}s elapsed)`);

    if (status === 'done') {
      console.log(`✅ Render complete: ${url}`);
      return {
        id: renderId,
        status,
        url,
        duration: result.response.duration,
        data: result.response.data
      };
    }

    if (status === 'failed') {
      const error = result.response?.error || 'Unknown error';
      throw new Error(`Shotstack render failed: ${error}`);
    }

    // Status is 'queued' or 'processing', wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Download video from Shotstack URL to local file
 * @param {string} url - Shotstack video URL
 * @param {string} outputPath - Local file path
 */
export async function downloadVideo(url, outputPath) {
  console.log(`📥 Downloading video to: ${outputPath}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Video download failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));

  const stats = await fs.stat(outputPath);
  console.log(`✅ Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * Complete render pipeline: submit → poll → download
 * @param {Object} template - Shotstack template
 * @param {Object} data - Template variables
 * @param {string} outputPath - Local output file path
 * @returns {Promise<Object>} - Render result
 */
export async function renderVideo(template, data, outputPath) {
  const renderId = await submitRender(template, data);
  const result = await pollRenderStatus(renderId);
  await downloadVideo(result.url, outputPath);

  return result;
}

/**
 * Validate Shotstack API credentials
 * @returns {Promise<boolean>}
 */
export async function validateCredentials() {
  try {
    const response = await fetch(`${SHOTSTACK_BASE_URL}/render`, {
      method: 'GET',
      headers: {
        'x-api-key': SHOTSTACK_API_KEY
      }
    });

    // 200 or 404 means API key is valid (404 is expected for GET on this endpoint)
    return response.status === 200 || response.status === 404;
  } catch (error) {
    return false;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , action, ...args] = process.argv;

  if (action === 'test') {
    // Test render with sample data
    const templatePath = path.join(__dirname, '../config/shotstack_template.json');
    const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

    const testData = {
      hook_text: 'Test Video',
      insight_text: 'Shotstack API integration working perfectly',
      cta_text: 'Join Group7',
      agent_name: 'Lyra-7',
      voice_url: 'https://shotstack-assets.s3.amazonaws.com/music/unminus/ambisax.mp3', // Sample audio
      avatar_url: process.env.LYRA7_AVATAR_URL || 'https://shotstack-assets.s3.amazonaws.com/logos/real-estate-black.png', // Sample avatar
      duration: 15
    };

    const outputPath = path.join(__dirname, '../Production/test_shotstack.mp4');
    await renderVideo(template, testData, outputPath);
    console.log('\n✅ Test render complete!');
  } else if (action === 'validate') {
    const valid = await validateCredentials();
    console.log(valid ? '✅ Shotstack credentials valid' : '❌ Invalid credentials');
    process.exit(valid ? 0 : 1);
  } else {
    console.log(`
Usage:
  node shotstack-render.mjs test       # Test render with sample data
  node shotstack-render.mjs validate   # Validate API credentials
    `);
  }
}
