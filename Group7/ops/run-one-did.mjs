#!/usr/bin/env node
/**
 * Group7 Complete Video Production Pipeline with D-ID
 * Flow: GPT-4 Script → [ElevenLabs Voice] → D-ID Talking Head → [Shotstack Overlay] → Google Drive → Notion
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderTalkingHead } from '../scripts/did-render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Agent voice map (ElevenLabs)
const AGENT_VOICES = {
  'Lyra': 'jsCqWAovK2LkecY7zXl4',
  'Atlas': 'TxGEqnHWrfWFTfGW9XjX',
  'Nova': 'pFZP5JQG7iQjIQuC4Bku',
  'Cipher': 'cgSgspJ2msm6clMCkdW9',
  'Echo': 'EXAVITQu4vr4xnSDxMaL',
  'Quantum': 'flq6f7yk4E4fJM5XTYuZ',
  'Nexus': '21m00Tcm4TlvDq8ikWAM'
};

// Agent avatar map
const AGENT_AVATARS = {
  'Lyra': process.env.LYRA7_AVATAR_URL,
  'Atlas': process.env.LYRA7_AVATAR_URL, // TODO: Create individual avatars
  'Nova': process.env.LYRA7_AVATAR_URL,
  'Cipher': process.env.LYRA7_AVATAR_URL,
  'Echo': process.env.LYRA7_AVATAR_URL,
  'Quantum': process.env.LYRA7_AVATAR_URL,
  'Nexus': process.env.LYRA7_AVATAR_URL
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VIDEO_DB_ID = process.env.NOTION_VIDEO_DB_ID;

/**
 * Generate video script using GPT-4
 */
async function generateScript(agent, hook, insight, cta) {
  if (hook && insight) {
    return { hook, insight, cta: cta || 'Follow Group7 for daily AI insights' };
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
          content: `You are ${agent}, an AI agent for Group7. Generate a compelling 20-30 second video script with:
1. Hook (6-10 words, attention-grabbing opening)
2. Insight (25-35 words, valuable information)
3. CTA (8-12 words, call to action)

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

  // Parse hook, insight, and CTA from GPT-4 response
  const lines = content.split('\n').filter(l => l.trim());
  const hookLine = lines.find(l => l.toLowerCase().includes('hook')) || lines[0];
  const insightLine = lines.find(l => l.toLowerCase().includes('insight')) || lines[1];
  const ctaLine = lines.find(l => l.toLowerCase().includes('cta')) || lines[2];

  const parsedHook = hookLine.replace(/^.*hook:?\s*/i, '').trim();
  const parsedInsight = insightLine.replace(/^.*insight:?\s*/i, '').trim();
  const parsedCta = ctaLine.replace(/^.*cta:?\s*/i, '').trim() || 'Follow Group7 for daily AI insights';

  console.log(`✅ Generated script:\n   Hook: ${parsedHook}\n   Insight: ${parsedInsight}\n   CTA: ${parsedCta}`);

  return { hook: parsedHook, insight: parsedInsight, cta: parsedCta };
}

/**
 * Generate voice using ElevenLabs (optional - can use D-ID built-in TTS)
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
 * Upload audio to temporary storage (for D-ID to access)
 */
async function uploadAudioForDID(audioPath, slug) {
  console.log(`☁️  Uploading audio to Google Drive...`);

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
 * Generate talking head video with D-ID
 */
async function generateTalkingHead(agent, script, audioUrl, slug, useBuiltInTTS = false) {
  console.log(`🎭 Generating talking head with D-ID...`);

  const avatarUrl = AGENT_AVATARS[agent];
  if (!avatarUrl) {
    throw new Error(`No avatar configured for ${agent}`);
  }

  const fullText = `${script.hook}. ${script.insight}. ${script.cta}`;
  const outputPath = path.join(__dirname, `../Production/Video/${slug}_did.mp4`);

  const options = {
    avatarUrl,
    outputPath
  };

  if (useBuiltInTTS) {
    // Mode A: Use D-ID built-in TTS (Microsoft Azure voices)
    options.text = fullText;
    options.voice = 'en-US-JennyNeural';
  } else {
    // Mode B: Use ElevenLabs audio (better quality)
    options.audioUrl = audioUrl;
  }

  await renderTalkingHead(options);

  console.log(`✅ Talking head generated: ${outputPath}`);

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

  return { url: publicUrl, fileId: result.id };
}

/**
 * Log to Notion Video Database
 */
async function logToNotion(agent, slug, script, videoUrl) {
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
          rich_text: [{ text: { content: script.hook } }]
        },
        'Insight': {
          rich_text: [{ text: { content: script.insight } }]
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
  const cta = args.find(a => a.startsWith('--cta'))?.split('=')[1];
  const useBuiltInTTS = args.includes('--did-tts');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 GROUP7 VIDEO FACTORY - D-ID PIPELINE v2.0`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Agent: ${agent}`);
  console.log(`   Slug: ${slug}`);
  console.log(`   TTS: ${useBuiltInTTS ? 'D-ID Built-in' : 'ElevenLabs'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    // Step 1: Generate script
    const script = await generateScript(agent, hook, insight, cta);

    let audioUrl = null;
    let audioPath = null;

    if (!useBuiltInTTS) {
      // Step 2: Generate voice with ElevenLabs
      audioPath = path.join(__dirname, `../Production/Audio/${slug}_voice.mp3`);
      await generateVoice(agent, `${script.hook}. ${script.insight}. ${script.cta}`, audioPath);

      // Step 3: Upload audio for D-ID to access
      audioUrl = await uploadAudioForDID(audioPath, slug);
    }

    // Step 4: Generate talking head with D-ID
    const videoPath = await generateTalkingHead(agent, script, audioUrl, slug, useBuiltInTTS);

    // Step 5: Upload video to Google Drive (optional)
    let uploadResult = null;
    try {
      uploadResult = await uploadVideoToDrive(videoPath, slug);
    } catch (error) {
      console.warn(`⚠️  Drive upload skipped: ${error.message}`);
      console.log(`   Video saved locally: ${videoPath}`);
      uploadResult = {
        url: `file://${videoPath}`,
        fileId: null
      };
    }

    // Step 6: Log to Notion
    await logToNotion(agent, slug, script, uploadResult.url);

    // Step 7: Clean up temp files
    if (audioPath) {
      await fs.unlink(audioPath).catch(() => {});
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ PIPELINE COMPLETE!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Video: ${uploadResult.url}`);
    console.log(`   Local: ${videoPath}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Write result JSON
    const logsDir = path.join(__dirname, '../Production/logs');
    await fs.mkdir(logsDir, { recursive: true });

    const resultPath = path.join(logsDir, `${slug}.json`);
    await fs.writeFile(resultPath, JSON.stringify({
      agent,
      slug,
      hook: script.hook,
      insight: script.insight,
      cta: script.cta,
      video_url: uploadResult.url,
      video_file_id: uploadResult.fileId,
      created_at: new Date().toISOString(),
      pipeline: 'did',
      tts_provider: useBuiltInTTS ? 'did' : 'elevenlabs'
    }, null, 2));

    console.log(`📊 Log saved: ${resultPath}\n`);

  } catch (error) {
    console.error(`\n❌ Pipeline failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
