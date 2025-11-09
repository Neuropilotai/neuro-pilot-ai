#!/usr/bin/env node
/**
 * D-ID Talking Head Generation for Group7
 * Generates animated avatar videos with voice
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DID_API_KEY = process.env.DID_API_KEY;
const DID_API_URL = 'https://api.d-id.com';

if (!DID_API_KEY) {
  console.error('❌ Missing DID_API_KEY in .env');
  process.exit(1);
}

/**
 * Create D-ID talking head video
 * @param {Object} options
 * @param {string} options.avatarUrl - Avatar image URL (e.g., LYRA7_AVATAR_URL)
 * @param {string} options.text - Text to speak (D-ID built-in TTS)
 * @param {string} options.audioUrl - OR provide audio URL (ElevenLabs MP3)
 * @param {string} options.voice - Voice ID for D-ID TTS (optional)
 * @param {string} options.outputPath - Local output path
 * @returns {Promise<string>} - Path to downloaded video
 */
export async function renderTalkingHead(options) {
  const { avatarUrl, text, audioUrl, voice, outputPath } = options;

  console.log('🎭 Creating D-ID talking head...');

  // Step 1: Submit talk request
  const talkPayload = {
    source_url: avatarUrl,
    script: {}
  };

  if (audioUrl) {
    // Mode B: Use external audio (ElevenLabs)
    talkPayload.script.type = 'audio';
    talkPayload.script.audio_url = audioUrl;
  } else if (text) {
    // Mode A: Use D-ID built-in TTS
    talkPayload.script.type = 'text';
    talkPayload.script.input = text;
    talkPayload.script.provider = {
      type: 'microsoft',
      voice_id: voice || 'en-US-JennyNeural'
    };
  } else {
    throw new Error('Must provide either text or audioUrl');
  }

  const createResponse = await fetch(`${DID_API_URL}/talks`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${DID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(talkPayload)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`D-ID talk creation failed (${createResponse.status}): ${error}`);
  }

  const createResult = await createResponse.json();
  const talkId = createResult.id;
  console.log(`✅ Talk created: ${talkId}`);

  // Step 2: Poll for completion
  console.log('⏳ Waiting for D-ID to render video...');

  let status = 'created';
  let resultUrl = null;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds

  while (status !== 'done' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    attempts++;

    const statusResponse = await fetch(`${DID_API_URL}/talks/${talkId}`, {
      headers: {
        'Authorization': `Basic ${DID_API_KEY}`
      }
    });

    if (!statusResponse.ok) {
      throw new Error(`D-ID status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    status = statusResult.status;
    resultUrl = statusResult.result_url;

    console.log(`   Status: ${status} (${attempts * 5}s elapsed)`);

    if (status === 'error') {
      throw new Error(`D-ID rendering failed: ${statusResult.error?.description || 'Unknown error'}`);
    }

    if (status === 'done') {
      break;
    }
  }

  if (status !== 'done') {
    throw new Error('D-ID render timeout');
  }

  console.log(`✅ Video ready: ${resultUrl}`);

  // Step 3: Download video
  console.log(`📥 Downloading to: ${outputPath}`);

  const videoResponse = await fetch(resultUrl);
  if (!videoResponse.ok) {
    throw new Error(`Download failed: ${videoResponse.status}`);
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(videoBuffer));

  const stats = await fs.stat(outputPath);
  console.log(`✅ Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return outputPath;
}

/**
 * Validate D-ID API credentials
 */
export async function validateCredentials() {
  try {
    const response = await fetch(`${DID_API_URL}/clips`, {
      headers: {
        'Authorization': `Basic ${DID_API_KEY}`
      }
    });

    return response.status === 200 || response.status === 404;
  } catch (error) {
    return false;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = arr[i + 1];
      if (value && !value.startsWith('--')) {
        acc[key] = value;
      } else {
        acc[key] = true;
      }
    }
    return acc;
  }, {});

  if (args.validate) {
    const valid = await validateCredentials();
    console.log(valid ? '✅ D-ID credentials valid' : '❌ Invalid credentials');
    process.exit(valid ? 0 : 1);
  }

  if (!args.avatar || (!args.text && !args.audio) || !args.output) {
    console.log(`
Usage:
  node did-render.mjs --avatar URL --text "Hello" --output video.mp4
  node did-render.mjs --avatar URL --audio audio.mp3 --output video.mp4
  node did-render.mjs --validate

Options:
  --avatar URL     Avatar image URL (required)
  --text TEXT      Text to speak with D-ID TTS
  --audio URL      Audio file URL (ElevenLabs MP3)
  --voice ID       D-ID voice ID (default: en-US-JennyNeural)
  --output PATH    Output video path (required)
  --validate       Test API credentials
    `);
    process.exit(1);
  }

  await renderTalkingHead({
    avatarUrl: args.avatar,
    text: args.text,
    audioUrl: args.audio,
    voice: args.voice,
    outputPath: args.output
  });

  console.log('\n✅ D-ID render complete!');
}
