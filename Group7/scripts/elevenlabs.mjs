#!/usr/bin/env node
/**
 * Group7 ElevenLabs Text-to-Speech Integration
 * Generates high-quality voice audio for AI agents
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_MODEL = 'eleven_turbo_v2';

if (!ELEVENLABS_API_KEY) {
  console.error('❌ Missing ELEVENLABS_API_KEY in .env');
  process.exit(1);
}

// Group7 Agent Voice Mapping
export const AGENT_VOICES = {
  'Lyra': 'jsCqWAovK2LkecY7zXl4',      // Rachel - Calm, professional
  'Atlas': 'TxGEqnHWrfWFTfGW9XjX',     // Josh - Strong, confident
  'Nova': 'pFZP5JQG7iQjIQuC4Bku',      // Lily - Energetic, friendly
  'Cipher': 'cgSgspJ2msm6clMCkdW9',    // Charlie - Analytical
  'Echo': 'EXAVITQu4vr4xnSDxMaL',      // Bella - Warm, engaging
  'Quantum': 'flq6f7yk4E4fJM5XTYuZ',   // George - Deep, authoritative
  'Nexus': '21m00Tcm4TlvDq8ikWAM'      // Chris - Versatile, clear
};

/**
 * Generate voice from text using ElevenLabs API
 * @param {Object} options - Voice generation options
 * @param {string} options.text - Text to convert to speech
 * @param {string} options.agent - Agent name (Lyra, Atlas, etc.)
 * @param {string} options.voiceId - Optional voice ID (overrides agent)
 * @param {string} options.modelId - Model ID (default: eleven_turbo_v2)
 * @param {Object} options.settings - Voice settings
 * @param {number} options.settings.stability - Voice stability (0-1)
 * @param {number} options.settings.similarity_boost - Similarity boost (0-1)
 * @param {string} options.outputPath - Optional output file path
 * @returns {Promise<Object>} - { audioBuffer, outputPath?, stats }
 */
export async function generateVoice({
  text,
  agent,
  voiceId,
  modelId = DEFAULT_MODEL,
  settings = {},
  outputPath
}) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎤 ELEVENLABS TEXT-TO-SPEECH');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Determine voice ID
  const finalVoiceId = voiceId || (agent && AGENT_VOICES[agent]);
  if (!finalVoiceId) {
    throw new Error(`No voice ID provided and unknown agent: ${agent}`);
  }

  const agentDisplay = agent || 'Custom Voice';
  console.log(`Agent: ${agentDisplay}`);
  console.log(`Voice ID: ${finalVoiceId}`);
  console.log(`Model: ${modelId}`);
  console.log(`Text: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`);
  console.log();

  // Prepare voice settings
  const voiceSettings = {
    stability: settings.stability ?? 0.5,
    similarity_boost: settings.similarity_boost ?? 0.75,
    style: settings.style ?? 0,
    use_speaker_boost: settings.use_speaker_boost ?? true
  };

  console.log(`⚙️  Voice Settings:`);
  console.log(`   Stability: ${voiceSettings.stability}`);
  console.log(`   Similarity Boost: ${voiceSettings.similarity_boost}`);
  console.log();

  // Make API request
  console.log('📡 Sending request to ElevenLabs...');
  const startTime = Date.now();

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API failed (${response.status}): ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const duration = Date.now() - startTime;

  console.log(`✅ Voice generated in ${duration}ms`);
  console.log(`   Size: ${(audioBuffer.byteLength / 1024).toFixed(2)} KB`);

  // Save to file if output path provided
  if (outputPath) {
    await fs.writeFile(outputPath, Buffer.from(audioBuffer));
    const stats = await fs.stat(outputPath);
    console.log(`💾 Saved to: ${outputPath}`);
    console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);

    return {
      audioBuffer,
      outputPath,
      stats: {
        size: stats.size,
        duration,
        voiceId: finalVoiceId,
        agent: agentDisplay
      }
    };
  }

  return {
    audioBuffer,
    stats: {
      size: audioBuffer.byteLength,
      duration,
      voiceId: finalVoiceId,
      agent: agentDisplay
    }
  };
}

/**
 * Get list of available voices from ElevenLabs
 * @returns {Promise<Array>} - Array of voice objects
 */
export async function listVoices() {
  console.log('📋 Fetching available voices...');

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voices (${response.status})`);
  }

  const data = await response.json();
  console.log(`✅ Found ${data.voices.length} voices`);

  return data.voices;
}

/**
 * Get voice details by ID
 * @param {string} voiceId - Voice ID
 * @returns {Promise<Object>} - Voice details
 */
export async function getVoice(voiceId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voice (${response.status})`);
  }

  return response.json();
}

/**
 * Validate ElevenLabs API credentials
 * @returns {Promise<boolean>}
 */
export async function validateCredentials() {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , action, ...args] = process.argv;

  if (action === 'test') {
    // Test voice generation
    const agent = args[0] || 'Lyra';
    const text = args.slice(1).join(' ') || 'This is a test of the ElevenLabs text to speech integration for Group7.';

    const outputPath = path.join(__dirname, `../Production/test_voice_${agent.toLowerCase()}.mp3`);

    await generateVoice({
      text,
      agent,
      outputPath
    });

    console.log('\n✅ Test complete! Play the audio file to verify.\n');

  } else if (action === 'list') {
    // List all available voices
    const voices = await listVoices();
    console.log('\nAvailable Voices:');
    voices.forEach(voice => {
      console.log(`   ${voice.voice_id} - ${voice.name} (${voice.category})`);
    });
    console.log();

  } else if (action === 'agents') {
    // Show Group7 agent voice mapping
    console.log('\n📋 Group7 Agent Voice Mapping:\n');
    for (const [agent, voiceId] of Object.entries(AGENT_VOICES)) {
      console.log(`   ${agent.padEnd(10)} → ${voiceId}`);
    }
    console.log();

  } else if (action === 'validate') {
    // Validate API credentials
    const valid = await validateCredentials();
    console.log(valid ? '✅ ElevenLabs credentials valid' : '❌ Invalid credentials');
    process.exit(valid ? 0 : 1);

  } else {
    console.log(`
🎤 Group7 ElevenLabs CLI

Usage:
  node elevenlabs.mjs test [agent] [text]     # Test voice generation
  node elevenlabs.mjs list                     # List all available voices
  node elevenlabs.mjs agents                   # Show Group7 agent voices
  node elevenlabs.mjs validate                 # Validate API credentials

Examples:
  node elevenlabs.mjs test Lyra "Hello from Group7"
  node elevenlabs.mjs list
  node elevenlabs.mjs agents
  node elevenlabs.mjs validate
    `);
  }
}
