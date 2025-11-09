#!/usr/bin/env node
// GROUP7 - Master Video Production Orchestrator
import 'dotenv/config';
import { execSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOG_DIR = process.env.LOG_DIR || 'Production/logs';
const TEMPLATE_ID = process.env.CANVA_TEMPLATE_ID;
const VOICE_DIR = process.env.OUTPUT_VOICE_DIR || 'Production/Voice';

function log(message) {
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({ timestamp, message }) + '\n';
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(join(LOG_DIR, 'video_runs.jsonl'), entry);
  console.log(message);
}

function runCmd(cmd, label) {
  console.log(`\n▶ ${label}...`);
  const result = execSync(cmd, { encoding: 'utf-8' });
  return JSON.parse(result);
}

async function produceVideo(args) {
  const { agent, slug, hook, insight, cta } = args;
  
  console.log('\n' + '='.repeat(60));
  console.log(`  VIDEO PRODUCTION: ${agent} / ${slug}`);
  console.log('='.repeat(60) + '\n');
  
  log(`Started: ${agent}-${slug}`);

  try {
    // Canva render
    const canvaResult = runCmd(
      `node scripts/canva-render.mjs --templateId ${TEMPLATE_ID} --hook "${hook}" --insight "${insight}" --cta "${cta}" --agent ${agent} --slug ${slug}`,
      'Canva Render'
    );
    
    // CloudConvert merge
    const voiceFile = join(VOICE_DIR, `GRP7_${agent}_${slug}.mp3`);
    const mergeResult = runCmd(
      `node scripts/cloudconvert-merge.mjs --videoUrl "${canvaResult.canvaMp4Url}" --audioUrl "file://${process.cwd()}/${voiceFile}" --agent ${agent} --slug ${slug}`,
      'CloudConvert Merge'
    );
    
    // Google Drive upload
    const outName = `GRP7_${agent}_${slug}.mp4`;
    const uploadResult = runCmd(
      `node scripts/upload-gdrive.mjs --fileUrl "${mergeResult.mergedMp4Url}" --outName ${outName} --agent ${agent} --slug ${slug}`,
      'Google Drive Upload'
    );
    
    // Notion log
    const notionResult = runCmd(
      `node scripts/notion-log.mjs --agent ${agent} --slug ${slug} --status success --canvaUrl "${canvaResult.canvaMp4Url}" --driveUrl "${uploadResult.webViewLink}"`,
      'Notion Log'
    );

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS: ' + outName);
    console.log('Drive: ' + uploadResult.webViewLink);
    console.log('='.repeat(60) + '\n');

    return {
      status: 'success',
      driveUrl: uploadResult.webViewLink,
      driveFileId: uploadResult.driveFileId
    };

  } catch (error) {
    log(`Error: ${error.message}`);
    throw error;
  }
}

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
  return acc;
}, {});

if (!args.agent || !args.slug || !args.hook) {
  console.error('Usage: node ops/run-one.mjs --agent Lyra --slug test01 --hook "..." --insight "..." --cta "..."');
  process.exit(1);
}

produceVideo(args)
  .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(err => { console.error('\nFAILED:', err.message, '\n'); process.exit(1); });
