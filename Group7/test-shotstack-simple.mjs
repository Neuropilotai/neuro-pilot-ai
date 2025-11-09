#!/usr/bin/env node
/**
 * Simple Shotstack Test (No Google Drive Required)
 * Tests: ElevenLabs → Shotstack → Local MP4
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { submitRender, pollRenderStatus, downloadVideo } from './scripts/shotstack-render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Agent voice map
const AGENT_VOICES = {
  'Lyra': 'jsCqWAovK2LkecY7zXl4',
  'Atlas': 'TxGEqnHWrfWFTfGW9XjX',
  'Nova': 'pFZP5JQG7iQjIQuC4Bku',
  'Cipher': 'cgSgspJ2msm6clMCkdW9',
  'Echo': 'EXAVITQu4vr4xnSDxMaL',
  'Quantum': 'flq6f7yk4E4fJM5XTYuZ',
  'Nexus': '21m00Tcm4TlvDq8ikWAM'
};

async function testSimplePipeline() {
  console.log('\n🚀 Group7 Shotstack Simple Test\n');

  try {
    // Step 1: Generate voice with ElevenLabs
    console.log('🎤 Generating voice...');
    const voiceId = AGENT_VOICES['Lyra'];
    const text = 'AI that learns while you sleep. Group7 adapts autonomously to engagement data.';

    const voiceResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!voiceResponse.ok) {
      throw new Error(`ElevenLabs failed: ${voiceResponse.status}`);
    }

    const audioBuffer = await voiceResponse.arrayBuffer();
    const audioPath = path.join(__dirname, 'Production/test_voice.mp3');
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    const audioStats = await fs.stat(audioPath);
    console.log(`✅ Voice generated: ${(audioStats.size / 1024).toFixed(2)} KB`);

    // Step 2: Use public sample audio URL (Shotstack's test audio)
    // This avoids needing Google Drive for the test
    const audioUrl = 'https://shotstack-assets.s3.amazonaws.com/music/unminus/ambisax.mp3';
    console.log(`✅ Using sample audio: ${audioUrl}`);

    // Step 3: Render video with Shotstack
    console.log('🎬 Rendering video with Shotstack...');

    // Build template with actual values (Shotstack validates before merging)
    const template = {
      timeline: {
        background: "#0B1220",
        tracks: [
          {
            clips: [{
              asset: {
                type: "html",
                html: `<div style='width:1080px;height:1920px;background:linear-gradient(135deg, #0B1220 0%, #1E293B 100%);padding:96px;font-family:Inter,system-ui,sans-serif;color:#F8FAFC;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box'><div style='animation: fadeInUp 0.8s ease-out'><h1 style='font-size:72px;font-weight:600;line-height:1.2;margin:0;color:#F8FAFC;text-shadow:0 4px 12px rgba(0,0,0,0.3)'>AI that learns while you sleep</h1></div><div style='width:70%;animation: fadeInUp 1s ease-out 0.3s both'><p style='font-size:42px;line-height:1.4;margin:0;color:#CBD5E1'>Group7 adapts autonomously to engagement data</p></div><div style='display:flex;justify-content:space-between;align-items:center;animation: fadeInUp 1.2s ease-out 0.6s both'><div style='background:#0EA5E9;padding:24px 48px;border-radius:48px;font-size:36px;font-weight:600;box-shadow:0 8px 24px rgba(14,165,233,0.4)'>Follow Group7</div><div style='font-size:24px;color:#94A3B8;font-weight:500'>Lyra-7</div></div></div><style>@keyframes fadeInUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}</style>`,
                css: "body{margin:0;padding:0;overflow:hidden}*{box-sizing:border-box}",
                width: 1080,
                height: 1920
              },
              start: 0,
              length: 15,
              transition: {
                in: "fade",
                out: "fade"
              }
            }]
          },
          {
            clips: [{
              asset: {
                type: "audio",
                src: audioUrl
              },
              start: 0,
              length: 15
            }]
          }
        ]
      },
      output: {
        format: "mp4",
        fps: 30,
        size: {
          width: 1080,
          height: 1920
        }
      }
    };

    const renderId = await submitRender(template, {});
    const result = await pollRenderStatus(renderId);

    // Step 4: Download video
    const videoPath = path.join(__dirname, 'Production/test_shotstack.mp4');
    await downloadVideo(result.url, videoPath);

    console.log('\n✅ Test Complete!\n');
    console.log(`   Voice: ${audioPath}`);
    console.log(`   Video: ${videoPath}`);
    console.log(`   Duration: ${result.duration}s\n`);

    console.log('🎥 Watch your video:');
    console.log(`   open "${videoPath}"\n`);

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    process.exit(1);
  }
}

testSimplePipeline();
