#!/usr/bin/env node
/**
 * Group7 Complete Video Production Pipeline with Shotstack
 * Flow: GPT-4 Script → ElevenLabs Voice → Shotstack Render → Google Drive → Notion
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { submitRender, pollRenderStatus, downloadVideo } from '../scripts/shotstack-render.mjs';

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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VIDEO_DB_ID = process.env.NOTION_VIDEO_DB_ID;

/**
 * Generate video script using GPT-4
 */
async function generateScript(agent, hook, insight) {
  if (hook && insight) {
    return { hook, insight };
  }

  console.log(`🤖 Generating script for ${agent}...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are ${agent}, an AI agent for Group7. Generate a compelling 15-30 second video script with:
1. A hook (6-10 words, attention-grabbing)
2. An insight (15-20 words, valuable information)

Focus on AI, automation, productivity, and future tech. Be bold and confident.`
        },
        {
          role: 'user',
          content: 'Generate a video script for today\'s post.'
        }
      ],
      temperature: 0.8
    })
  });

  if (!response.ok) {
    throw new Error(`GPT-4 API failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse hook and insight from GPT-4 response
  const lines = content.split('\n').filter(l => l.trim());
  const hookLine = lines.find(l => l.toLowerCase().includes('hook')) || lines[0];
  const insightLine = lines.find(l => l.toLowerCase().includes('insight')) || lines[1];

  const hook = hookLine.replace(/^.*hook:?\s*/i, '').trim();
  const insight = insightLine.replace(/^.*insight:?\s*/i, '').trim();

  console.log(`✅ Generated script:\n   Hook: ${hook}\n   Insight: ${insight}`);

  return { hook, insight };
}

/**
 * Generate voice using ElevenLabs
 */
async function generateVoice(agent, text, outputPath) {
  console.log(`🎤 Generating voice for ${agent}...`);

  const voiceId = AGENT_VOICES[agent];
  if (!voiceId) {
    throw new Error(`Unknown agent: ${agent}`);
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
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

  if (!response.ok) {
    throw new Error(`ElevenLabs API failed: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(audioBuffer));

  const stats = await fs.stat(outputPath);
  console.log(`✅ Voice generated: ${(stats.size / 1024).toFixed(2)} KB`);

  return outputPath;
}

/**
 * Upload audio to temporary storage (for Shotstack to access)
 * Uses Google Drive with public sharing
 */
async function uploadAudioForShotstack(audioPath, slug) {
  console.log(`☁️  Uploading audio to Google Drive...`);

  // Import upload function
  const { uploadToGDrive } = await import('../scripts/upload-gdrive.mjs');

  const folderId = process.env.GDRIVE_TEMP_FOLDER_ID || process.env.GDRIVE_OUTPUT_FOLDER_ID;
  const result = await uploadToGDrive(audioPath, `temp_audio_${slug}.mp3`, folderId);

  // Make file publicly accessible
  const fileId = result.id;
  const publicUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  console.log(`✅ Audio uploaded: ${publicUrl}`);

  return publicUrl;
}

/**
 * Render video with Shotstack
 */
async function renderWithShotstack(agent, hook, insight, voiceUrl, slug) {
  console.log(`🎬 Rendering video with Shotstack...`);

  // Load template
  const templatePath = path.join(__dirname, '../config/shotstack_template.json');
  const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

  // Prepare data
  const data = {
    hook_text: hook,
    insight_text: insight,
    cta_text: 'Follow Group7',
    agent_name: `${agent}-7`,
    voice_url: voiceUrl,
    duration: 30 // seconds
  };

  // Submit and poll
  const renderId = await submitRender(template, data);
  const result = await pollRenderStatus(renderId);

  // Download video
  const outputPath = path.join(__dirname, `../Production/${slug}.mp4`);
  await downloadVideo(result.url, outputPath);

  console.log(`✅ Video rendered: ${outputPath}`);

  return outputPath;
}

/**
 * Upload video to Google Drive (permanent storage)
 */
async function uploadVideoToDrive(videoPath, slug) {
  console.log(`☁️  Uploading video to Google Drive...`);

  const { uploadToGDrive } = await import('../scripts/upload-gdrive.mjs');

  const folderId = process.env.GDRIVE_OUTPUT_FOLDER_ID;
  const result = await uploadToGDrive(videoPath, `${slug}.mp4`, folderId);

  const publicUrl = `https://drive.google.com/file/d/${result.id}/view`;
  console.log(`✅ Video uploaded: ${publicUrl}`);

  return publicUrl;
}

/**
 * Log to Notion Video Database
 */
async function logToNotion(agent, slug, hook, insight, videoUrl) {
  if (!NOTION_TOKEN || !NOTION_VIDEO_DB_ID) {
    console.warn('⚠️  Skipping Notion logging (missing credentials)');
    return;
  }

  console.log(`📝 Logging to Notion...`);

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_VIDEO_DB_ID },
      properties: {
        'Title': {
          title: [{ text: { content: `${agent} - ${slug}` } }]
        },
        'Agent': {
          select: { name: agent }
        },
        'Hook': {
          rich_text: [{ text: { content: hook } }]
        },
        'Insight': {
          rich_text: [{ text: { content: insight } }]
        },
        'Video URL': {
          url: videoUrl
        },
        'Status': {
          select: { name: 'Published' }
        },
        'Created': {
          date: { start: new Date().toISOString() }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`⚠️  Notion logging failed: ${errorText}`);
    return;
  }

  console.log(`✅ Logged to Notion`);
}

/**
 * Main pipeline
 */
async function main() {
  const args = process.argv.slice(2);
  const agent = args.find(a => a.startsWith('--agent'))?.split('=')[1] || 'Lyra';
  const slug = args.find(a => a.startsWith('--slug'))?.split('=')[1] || `${agent.toLowerCase()}_${Date.now()}`;
  const hook = args.find(a => a.startsWith('--hook'))?.split('=')[1];
  const insight = args.find(a => a.startsWith('--insight'))?.split('=')[1];

  console.log(`\n🚀 Group7 Video Production Pipeline (Shotstack)`);
  console.log(`   Agent: ${agent}`);
  console.log(`   Slug: ${slug}\n`);

  try {
    // Step 1: Generate script
    const script = await generateScript(agent, hook, insight);

    // Step 2: Generate voice
    const audioPath = path.join(__dirname, `../Production/${slug}_voice.mp3`);
    await generateVoice(agent, `${script.hook}. ${script.insight}.`, audioPath);

    // Step 3: Upload audio for Shotstack
    const audioUrl = await uploadAudioForShotstack(audioPath, slug);

    // Step 4: Render video with Shotstack
    const videoPath = await renderWithShotstack(agent, script.hook, script.insight, audioUrl, slug);

    // Step 5: Upload video to Google Drive
    const videoUrl = await uploadVideoToDrive(videoPath, slug);

    // Step 6: Log to Notion
    await logToNotion(agent, slug, script.hook, script.insight, videoUrl);

    // Step 7: Clean up temp files
    await fs.unlink(audioPath).catch(() => {});

    console.log(`\n✅ Pipeline complete!`);
    console.log(`   Video: ${videoUrl}\n`);

    // Write result JSON
    const resultPath = path.join(__dirname, `../Production/logs/${slug}.json`);
    await fs.writeFile(resultPath, JSON.stringify({
      agent,
      slug,
      hook: script.hook,
      insight: script.insight,
      video_url: videoUrl,
      created_at: new Date().toISOString(),
      pipeline: 'shotstack'
    }, null, 2));

  } catch (error) {
    console.error(`\n❌ Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
